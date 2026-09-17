# Jest Orchestrator External Integration

`@nsxbet/jest-orchestrator` distributes Jest 30+ tests across CI shards using
historical timings. It uses **file-level sharding by default**: all tests in a
file run on one shard, and each file's estimated duration is the sum of its
per-test history. Pass `level: test` only when you explicitly need a large file
to be split.

Unlike Playwright, Jest does not provide a native test-list filter. The Jest
orchestrator's `run-shard` command loads an exact allowlist shim before test
execution. It selects `(file, fullName)` pairs exactly, then verifies after the
run that every assigned test occurrence ran and no unassigned occurrence did.

> **Requirements:** Jest 30+ with the default jest-circus runner, Node 20+, and
> a project-local Jest installation.

## Actions

| Action                    | Purpose                                                        |
| ------------------------- | -------------------------------------------------------------- |
| `setup-jest-orchestrator` | Install and cache the npm CLI in an external repository        |
| `jest-orchestrate`        | Discover tests and create an assignment + manifest artifact    |
| `jest-get-shard`          | Validate an assignment and retrieve a shard's plan path        |
| `jest-merge-timing`       | Merge per-shard timing artifacts with EMA and optional pruning |

The Actions are storage-agnostic: they neither restore caches nor upload
actions artifacts. Your workflow owns those operations.

## Complete workflow

This workflow follows the same three-phase shape as the Playwright integration:
create one plan, run a matrix of shard jobs, then merge timings. It uses a
branch-specific timing cache with `main` fallback.

```yaml
name: Jest tests with orchestrator

on:
  push:
    branches: [main]
  pull_request:

env:
  SHARDS: 4
  TIMING_FILE: jest-timing.json

jobs:
  orchestrate:
    runs-on: ubuntu-24.04
    outputs:
      matrix: ${{ steps.matrix.outputs.matrix }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci

      - uses: NSXBet/test-orchestrator/.github/actions/setup-jest-orchestrator@main
        with:
          version: "" # latest; pin a released version in production

      - uses: actions/cache/restore@v4
        with:
          path: ${{ env.TIMING_FILE }}
          key: jest-timing-${{ github.ref_name }}
          restore-keys: |
            jest-timing-${{ github.ref_name }}-
            jest-timing-main-

      - id: matrix
        run: |
          MATRIX=$(seq 1 "$SHARDS" | jq -R . | jq -sc '{shard: .}')
          echo "matrix=$MATRIX" >> "$GITHUB_OUTPUT"

      - id: orchestrate
        uses: NSXBet/test-orchestrator/.github/actions/jest-orchestrate@main
        with:
          root: .
          timing-file: ${{ env.TIMING_FILE }}
          shards: ${{ env.SHARDS }}
          # level defaults to file; set test only to split files

      - uses: actions/upload-artifact@v4
        with:
          name: jest-assignment
          path: .orchestration/
          include-hidden-files: true
          retention-days: 1

  test:
    needs: orchestrate
    runs-on: ubuntu-24.04
    strategy:
      fail-fast: false
      matrix: ${{ fromJSON(needs.orchestrate.outputs.matrix) }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci

      - uses: NSXBet/test-orchestrator/.github/actions/setup-jest-orchestrator@main

      - uses: actions/download-artifact@v4
        with:
          name: jest-assignment
          path: .orchestration

      - id: shard
        uses: NSXBet/test-orchestrator/.github/actions/jest-get-shard@main
        with:
          assignment-file: .orchestration/assignment.json
          shard-index: ${{ matrix.shard }}

      # run-shard is the Jest equivalent of both test execution and
      # Playwright's extract-timing action: it emits the timing artifact from
      # the report it controls and validates exact selected coverage.
      - name: Run assigned Jest shard and extract timing
        run: |
          jest-orchestrator run-shard \
            --root . \
            --assignment .orchestration/assignment.json \
            --shard ${{ matrix.shard }} \
            --output shard-timing-${{ matrix.shard }}.json \
            --report-output shard-report-${{ matrix.shard }}.json

      - uses: actions/upload-artifact@v4
        if: success() || failure()
        with:
          name: jest-timing-shard-${{ matrix.shard }}
          path: shard-timing-${{ matrix.shard }}.json
          if-no-files-found: error
          retention-days: 1

  merge-timing:
    needs: [orchestrate, test]
    if: success() || failure()
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - uses: NSXBet/test-orchestrator/.github/actions/setup-jest-orchestrator@main

      - uses: actions/cache/restore@v4
        with:
          path: ${{ env.TIMING_FILE }}
          key: jest-timing-${{ github.ref_name }}
          restore-keys: jest-timing-main-

      - uses: actions/download-artifact@v4
        with:
          name: jest-assignment
          path: .orchestration

      - uses: actions/download-artifact@v4
        with:
          pattern: jest-timing-shard-*
          merge-multiple: true
          path: timing-artifacts

      - uses: NSXBet/test-orchestrator/.github/actions/jest-merge-timing@main
        with:
          existing-file: ${{ env.TIMING_FILE }}
          new-files: timing-artifacts/shard-timing-*.json
          output-file: ${{ env.TIMING_FILE }}
          manifest: .orchestration/manifest.json

      - uses: actions/cache/save@v4
        with:
          path: ${{ env.TIMING_FILE }}
          key: jest-timing-${{ github.ref_name }}-${{ github.run_id }}
```

## Action reference

### `setup-jest-orchestrator`

Installs and caches the `jest-orchestrator` CLI from npm.

```yaml
- uses: NSXBet/test-orchestrator/.github/actions/setup-jest-orchestrator@main
  with:
    version: "" # optional package version; latest when blank
```

### `jest-orchestrate`

Discovers every registered Jest test then assigns it to a shard plan. A missing
or corrupt timing file is a cold start, not an error: assignments use a
10-second fallback estimate and the first shard run creates history. Once timing
exists, new tests use the same-file average, then the global average, before
falling back to 10 seconds.

```yaml
- uses: NSXBet/test-orchestrator/.github/actions/jest-orchestrate@main
  with:
    root: . # required Jest project root
    timing-file: jest-timing.json # required path; may not exist yet
    shards: 4 # required total shard count
    level: file # optional; this is the default
    jest-args: "--config jest.config.js" # optional discovery arguments
```

Outputs:

- `assignment-file`: generated `.orchestration/assignment.json` path;
- `total-tests`: count from the discovery manifest.

### `jest-get-shard`

Validates the downloaded assignment artifact and selected one-based shard index.
It returns `assignment-file` as a convenience for the subsequent `run-shard`
command.

```yaml
- uses: NSXBet/test-orchestrator/.github/actions/jest-get-shard@main
  with:
    assignment-file: .orchestration/assignment.json
    shard-index: 1
```

### `run-shard` timing extraction

There is no separate Jest `extract-timing` Action. `run-shard` must launch Jest
to install its exact selection shim, so it owns the resulting JSON report. It
simultaneously executes the assigned tests, verifies exact coverage, and writes
the per-shard timing artifact.

- Jest test failures cause exit code `1` after the report/artifact is written.
- Infrastructure or exact-selection verification failures cause a non-`0`/`1`
  failure and must fail the job.
- Static `test.skip` and `test.todo` entries remain in the plan but do not add a
  timing measurement because Jest does not execute them.

### `annotate`

Pass the assignment file and shard number with the report to distinguish
selected `test.skip`/`test.todo` entries from assertions filtered into another
shard:

```bash
jest-orchestrator annotate \
  --report shard-report-1.json \
  --assignment .orchestration/assignment.json \
  --shard 1 \
  --summary-append "$GITHUB_STEP_SUMMARY"
```

### `jest-merge-timing`

Merges timing artifacts with EMA (default alpha `0.3`). Supply the discovery
manifest to prune identities removed from the current suite.

```yaml
- uses: NSXBet/test-orchestrator/.github/actions/jest-merge-timing@main
  with:
    existing-file: jest-timing.json # optional
    new-files: "timing-artifacts/shard-timing-*.json"
    output-file: jest-timing.json
    manifest: .orchestration/manifest.json # optional stale-entry pruning
```

## Monorepo usage

Set `root` to the directory containing the target Jest configuration, and run
`run-shard --root` from that same directory. Jest reports normalized absolute
file paths in the manifest, so the assignment artifact stays valid across the
orchestrate and matrix jobs.

```yaml
- uses: NSXBet/test-orchestrator/.github/actions/jest-orchestrate@main
  with:
    root: apps/web
    timing-file: jest-timing.json
    shards: 4
```

## Failure behavior and troubleshooting

The Jest integration intentionally fails loudly rather than falling back to a
native Jest shard flag, because native file sharding cannot preserve an exact
test-level plan.

- **Jest 29 or a non-circus runner:** upgrade to Jest 30+ using jest-circus.
- **An expected test was not executed:** ensure the same source revision,
  project root, Jest config, and `jest-args` are used for discovery and shard
  execution.
- **An unexpected test executed:** inspect the `--report-output` report and
  make sure no runner configuration overrides the selection shim.
- **No timing history:** expected on the first run; a successful merge supplies
  it for later runs.

## Cache strategy for pull requests

Use one branch-specific cache key per project/configuration, with a fallback to
`main`. After a merged PR, promote the branch timing cache to a `main` key. This
avoids concurrent PR writes racing on the same cache while letting new branches
start from established timing history.

Use `if: success() || failure()` for timing artifact upload and merge steps so
failed test reports still improve timing data, but cancellation does not run
post-test operations.
