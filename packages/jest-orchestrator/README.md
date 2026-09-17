# @nsxbet/jest-orchestrator

Intelligent Jest test distribution across CI shards using historical timing data.

**Requires Jest 30+ with the default jest-circus runner.**

## The Problem

Default Jest sharding distributes by **file count**, not by duration. A suite
with one slow test file and several quick ones can leave CI waiting on a single
straggling shard.

| Shard | Duration | Result                |
| ----- | -------- | --------------------- |
| 1     | ~30 min  | slowest job blocks CI |
| 2     | ~15 min  | runner is idle early  |
| 3     | ~11 min  | runner is idle early  |

## The Solution

This orchestrator:

1. **Learns** individual Jest test durations from prior runs.
2. **Distributes files by default** with CKK/LPT balancing, keeping each file's
   tests together to preserve file-level test setup and reduce repeated loading.
3. **Optionally distributes individual tests** with exact allowlist selection
   when a large file needs to be split.
4. **Verifies** after every shard that the assigned test occurrences are exactly
   the occurrences that Jest executed.

### File-Level Distribution by Default

`assign` defaults to `--level file`: a file is one atomic scheduling unit and
its duration is the sum of its historical per-test timings.

```text
file level (default): login.spec.ts (50 tests, 10 min) → one shard
test level (optional): login.spec.ts tests → can spread across shards 1–4
```

Use `--level test` only when splitting a file is more important than keeping
its tests together.

### Exact Test Selection

Jest has no equivalent to Playwright's `--test-list`. For test-level plans, the
orchestrator loads a `setupFilesAfterEnv` shim that uses exact `(file,
fullName)` allowlist membership, not regex matching. Unassigned tests are
marked skipped before execution and a bidirectional post-run check fails if a
selected test is missed or an unselected one runs.

That means names such as `should login`, `should login with SSO`, `Should
Login`, `regex \\d+`, `$100`, and `A | B` remain distinct and safe.

## Quick Start

```bash
# 1. Discover Jest's per-test inventory
npx jest-orchestrator discover --root . --output jest-tests.json

# 2. Assign whole files across shards (the default)
npx jest-orchestrator assign \
  --manifest ./jest-tests.json \
  --timings ./jest-timing.json \
  --shards 4 \
  --output assignment.json

# 3. Execute one shard exactly as assigned
npx jest-orchestrator run-shard \
  --root . \
  --assignment ./assignment.json \
  --shard 1 \
  --output ./shard-1-timing.json \
  --report-output ./shard-1-report.json

# 4. Merge all shard timings with EMA smoothing
npx jest-orchestrator merge-timing \
  --existing ./jest-timing.json \
  --new ./shard-1-timing.json ./shard-2-timing.json \
  --output ./jest-timing.json \
  --prune-manifest ./jest-tests.json
```

For test-level distribution, add `--level test` to `assign`. Both levels retain
per-test timing data, so changing the scheduling granularity needs no timing
store migration.

## How It Works

```text
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Orchestrate    │────▶│   Run Tests     │────▶│  Merge Timing   │
│  (1 job)        │     │   (N parallel)  │     │  (1 job)        │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                       │                       │
        ▼                       ▼                       ▼
  Discover + assign       Exact allowlist shim      Merge all shards
  Output all shard plans  Verify executed == plan   Update timing cache
```

1. **Orchestrate**: discover every registered test and assign all shards from
   one timing snapshot.
2. **Run Tests**: each shard invokes `run-shard`; file-level plans select all
   tests in their files, while test-level plans use the exact allowlist shim.
3. **Merge**: merge timing artifacts using EMA smoothing and prune tests no
   longer present in the discovery manifest.

## GitHub Actions

The repository provides separate Jest Actions and leaves its Playwright Actions
unchanged:

| Action              | Purpose                                           |
| ------------------- | ------------------------------------------------- |
| `jest-orchestrate`  | Discover tests and produce an assignment artifact |
| `jest-get-shard`    | Validate and retrieve a shard assignment          |
| `jest-merge-timing` | Merge shard timing artifacts with EMA smoothing   |

A typical workflow stores the assignment artifact between the orchestration and
matrix jobs, then stores timing artifacts for the final merge job:

```yaml
jobs:
  orchestrate:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm install -g @nsxbet/jest-orchestrator
      - uses: NSXBet/test-orchestrator/.github/actions/jest-orchestrate@main
        with:
          root: .
          timing-file: jest-timing.json
          shards: 4
          # level defaults to file; use test only when files must split

  e2e:
    needs: orchestrate
    strategy:
      matrix:
        shard: [1, 2, 3, 4]
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm install -g @nsxbet/jest-orchestrator
      # Download the assignment artifact, then:
      - run: |
          jest-orchestrator run-shard \
            --root . \
            --assignment assignment.json \
            --shard ${{ matrix.shard }} \
            --output shard-timing-${{ matrix.shard }}.json
```

The Actions are storage-agnostic: use GitHub cache, artifacts, S3, or another
backend to persist `jest-timing.json` between workflow runs.

## CLI Commands

| Command        | Description                                                          |
| -------------- | -------------------------------------------------------------------- |
| `discover`     | Create a per-test Jest inventory from the project root               |
| `assign`       | Assign files (default) or tests (`--level test`) to shards           |
| `run-shard`    | Execute and verify one assigned shard, then emit timings             |
| `merge-timing` | Merge timing artifacts with EMA smoothing and optional pruning       |
| `annotate`     | Convert a Jest JSON report into GitHub annotations and a job summary |

Run `jest-orchestrator <command> --help` for complete flag documentation.

## Library API

```ts
import { assignShards, discoverTests, mergeTimingData, runShard } from "@nsxbet/jest-orchestrator";
```

Test identities are structured as `{ project, file, fullName }`; timing-store
keys are canonical base64url JSON so titles can contain arbitrary characters.

## Development

```bash
make install               # Install workspace dependencies
make lint                  # Lint both packages
make typecheck             # Type-check both packages
make test                  # Run both package test suites
make build                 # Build both packages
make act-e2e-jest          # Run the basic Jest E2E workflow locally
make act-e2e-jest-monorepo # Run the tarball-based Jest monorepo E2E workflow
```

## Cache Strategy

GitHub Actions cache is branch-scoped. Use a **promote-on-merge** strategy:

1. Save `jest-timing.json` under a branch-specific cache key.
2. Restore the branch key first and fall back to a `main` key.
3. After merge, promote the merged branch's timing cache to `main`.

The repository's Jest example workflow demonstrates cache miss, exact hit, and
restore-key reporting.

## License

MIT
