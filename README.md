# @nsxbet/playwright-orchestrator

Intelligent Playwright test distribution across CI shards using historical timing data.

**Requires Playwright 1.56+** (uses the `--test-list` flag for pre-execution test filtering)

## The Problem

Default Playwright sharding (`--shard=N/M`) distributes tests by **file count**, not by duration. This creates significant imbalance:

| Shard   | Duration | vs Fastest |
| ------- | -------- | ---------- |
| Shard 1 | ~31 min  | +182%      |
| Shard 2 | ~15 min  | +36%       |
| Shard 3 | ~22 min  | +100%      |
| Shard 4 | ~11 min  | baseline   |

Your CI is bottlenecked by the slowest shard, wasting runner time.

## The Solution

This orchestrator:

1. **Learns** test durations from previous runs
2. **Distributes** tests optimally using the CKK algorithm
3. **Balances** shards to within 10-15% of each other

Result: All shards finish at roughly the same time.

### Test-Level Distribution

Unlike other solutions that only distribute at the **file level**, this orchestrator supports **test-level distribution**. This matters when you have files with many tests of varying durations.

```text
File-level:  login.spec.ts (50 tests, 10min) → all go to shard 1
Test-level:  login.spec.ts tests → spread across shards 1-4
```

### Zero Runtime Footprint

The orchestrator uses Playwright's `--test-list` flag to filter tests **before execution**. This means:

- **No fixture** needed in your test setup
- **No reporter** needed in `playwright.config.ts`
- **No imports** from `@nsxbet/playwright-orchestrator` in your project code
- All Playwright reporters (HTML, JSON, blob) produce natively clean output

## Quick Start

```bash
# Generate test list
npx playwright test --list --reporter=json --project "chromium" > test-list.json

# Assign tests to shards
npx playwright-orchestrator assign \
  --test-list ./test-list.json \
  --timing-file ./timing-data.json \
  --shards 4 > assignment.json

# Run tests for a specific shard using --test-list
npx playwright test --test-list shard-1.txt --project "chromium"

# Extract timing from report after tests complete
npx playwright-orchestrator extract-timing \
  --report-file ./playwright-report/results.json \
  --output-file ./shard-1-timing.json \
  --project "chromium"

# Merge timing data from all shards
npx playwright-orchestrator merge-timing \
  --existing ./timing-data.json \
  --new ./shard-1-timing.json ./shard-2-timing.json \
  --output ./timing-data.json
```

## How It Works

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Orchestrate    │────▶│   Run Tests     │────▶│  Merge Timing   │
│  (1 job)        │     │   (N parallel)  │     │  (1 job)        │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                       │                       │
        ▼                       ▼                       ▼
  Run CKK once           --test-list filter       Merge all shards
  Output all shards      Clean reports natively   Update cache
```

1. **Orchestrate**: Run once, compute assignments for ALL shards. Output includes `testListFiles` with ready-to-write Playwright test-list content per shard.
2. **Run Tests**: Each shard writes its test-list file and passes `--test-list <file>` to Playwright. Tests not in the list are removed from the suite tree before execution.
3. **Merge**: Collect timing from all shards, update history with EMA.

## Setup

No changes to `playwright.config.ts` are needed. Just use standard Playwright reporters:

```typescript
import { defineConfig } from "@playwright/test";

export default defineConfig({
  reporter: [
    ["json", { outputFile: "playwright-report/results.json" }],
    ["html"],
  ],
});
```

## Local Testing

Reproduce CI shard behavior locally:

```bash
# 1. Generate test list (same as CI does)
npx playwright test --list --reporter=json --project="chromium" > test-list.json

# 2. Get shard distribution
playwright-orchestrator assign --test-list test-list.json --shards 4 --output-format json > result.json

# 3. Write test-list file for shard 1 (the assign command includes testListFiles)
# Or use jq: jq -r '.testListFiles."1"' result.json > shard-1.txt

# 4. Run tests for that shard
npx playwright test --test-list shard-1.txt --project="chromium"
```

## GitHub Actions (External Repositories)

Use the orchestrator in your own repository. The recommended pattern runs orchestration **once** before matrix jobs.

**Important**: Use `npx playwright test --list --reporter=json` to generate the test list. This ensures accurate discovery of parameterized tests (`test.each`).

```yaml
jobs:
  # Phase 1: Orchestrate (runs once)
  orchestrate:
    runs-on: ubuntu-24.04
    outputs:
      test-list-files: ${{ steps.orchestrate.outputs.test-list-files }}
    steps:
      - uses: actions/checkout@v4
      - run: npm ci

      - uses: NSXBet/playwright-orchestrator/.github/actions/setup-orchestrator@v0

      - uses: actions/cache/restore@v4
        with:
          path: timing-data.json
          key: playwright-timing-${{ github.ref_name }}
          restore-keys: playwright-timing-

      - run: npx playwright test --list --reporter=json > test-list.json

      - uses: NSXBet/playwright-orchestrator/.github/actions/orchestrate@v0
        id: orchestrate
        with:
          test-list: test-list.json
          timing-file: timing-data.json
          shards: 4

  # Phase 2: Run tests (parallel matrix)
  e2e:
    needs: [orchestrate]
    runs-on: ubuntu-24.04
    strategy:
      fail-fast: false
      matrix:
        shard: [1, 2, 3, 4]
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npx playwright install chromium --with-deps

      - uses: NSXBet/playwright-orchestrator/.github/actions/get-shard@v0
        id: shard
        with:
          test-list-files: ${{ needs.orchestrate.outputs.test-list-files }}
          shard-index: ${{ matrix.shard }}
          shards: 4

      # Use --test-list for clean, pre-execution filtering
      - run: |
          TEST_LIST_FILE="${{ steps.shard.outputs.test-list-file }}"
          if [ -n "$TEST_LIST_FILE" ] && [ -f "$TEST_LIST_FILE" ]; then
            npx playwright test --test-list "$TEST_LIST_FILE"
          else
            npx playwright test ${{ steps.shard.outputs.fallback-args }}
          fi
```

See [docs/external-integration.md](./docs/external-integration.md) for complete workflow with timing data persistence.

## CLI Commands

| Command          | Description                           |
| ---------------- | ------------------------------------- |
| `assign`         | Distribute tests across shards        |
| `extract-timing` | Extract timing from Playwright report |
| `merge-timing`   | Merge timing data with EMA smoothing  |

Run `playwright-orchestrator <command> --help` for details.

### File Affinity

By default, the `assign` command keeps tests from the same file on the same shard when the time difference is small. This reduces redundant page/context initialization costs.

```bash
# Disable file affinity
playwright-orchestrator assign --test-list test-list.json --shards 4 --no-file-affinity

# Override penalty (in ms)
playwright-orchestrator assign --test-list test-list.json --shards 4 --file-affinity-penalty 20000
```

## Development

```bash
make install    # Install dependencies
make lint       # Biome linter
make typecheck  # TypeScript
make test       # Bun test
make build      # Build
make act-test   # Run CI locally (requires Act)
```

## E2E Testing

```bash
make act-e2e-monorepo   # Run E2E monorepo workflow with Act
```

The E2E workflow tests the complete orchestration cycle:

1. **setup**: Build package, create tarball
2. **orchestrate**: Use real `orchestrate` action
3. **e2e-tests** (matrix): Use `get-shard` with `--test-list` and `extract-timing` actions
4. **merge**: Use `merge-timing` action

## Cache Strategy

GitHub Actions cache is branch-scoped. We recommend a **promote-on-merge** pattern:

1. Each PR branch saves to its own cache key
2. PRs restore from their own cache, falling back to main
3. When a PR is merged, promote the PR's cache to main

See [Cache Strategy for PRs](./docs/external-integration.md#cache-strategy-for-prs) for implementation details.

## License

MIT
