# @nsxbet/playwright-orchestrator

Intelligent Playwright test distribution across CI shards using historical timing data.

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

Unlike other solutions that only distribute at the **file level**, this orchestrator supports **test-level distribution**. This matters when you have files with many tests of varying durations - distributing individual tests achieves much better balance than distributing entire files.

```
File-level:  login.spec.ts (50 tests, 10min) → all go to shard 1
Test-level:  login.spec.ts tests → spread across shards 1-4
```

Test-level distribution requires the reporter AND a test fixture to filter tests at runtime. See [Setup](#setup) below.

## Quick Start

```bash
# Install
bun add -D @nsxbet/playwright-orchestrator

# Generate test list
bunx playwright test --list --reporter=json --project "Mobile Chrome" > test-list.json

# Assign tests to shards
bunx playwright-orchestrator assign \
  --test-list ./test-list.json \
  --timing-file ./timing-data.json \
  --shards 4 > assignment.json

# Extract each shard's tests to separate files
jq '.shards."1"' assignment.json > shard-1.json
jq '.shards."2"' assignment.json > shard-2.json
jq '.shards."3"' assignment.json > shard-3.json
jq '.shards."4"' assignment.json > shard-4.json

# Run tests for a specific shard (fixture filters based on ORCHESTRATOR_SHARD_FILE)
ORCHESTRATOR_SHARD_FILE=shard-1.json bunx playwright test --project "Mobile Chrome"

# Extract timing from report after tests complete
bunx playwright-orchestrator extract-timing \
  --report-file ./playwright-report/results.json \
  --output-file ./shard-1-timing.json \
  --shard-file ./shard-1.json \
  --project "Mobile Chrome"

# Merge timing data from all shards
bunx playwright-orchestrator merge-timing \
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
  Run CKK once            Read shard-files         Merge all shards
  Output all shards       from job outputs         Update cache
```

1. **Orchestrate**: Run once, compute assignments for ALL shards
2. **Run Tests**: Each shard reads its files from `needs.orchestrate.outputs`
3. **Merge**: Collect timing from all shards, update history with EMA

## Setup

For test-level distribution to work, you need **two things**:

### 1. Reporter (in `playwright.config.ts`)

```typescript
import { defineConfig } from "@playwright/test";

export default defineConfig({
  reporter: [
    ["@nsxbet/playwright-orchestrator/reporter", {
      filterJson: "playwright-report/results.json",
    }],
    ["json", { outputFile: "playwright-report/results.json" }],
    ["html"],
  ],
});
```

The `filterJson` option (optional) tells the reporter to rewrite the JSON report after tests complete, removing specs not assigned to this shard. This keeps per-shard reports clean and prevents timing corruption from zero-duration orchestrator-skipped entries.

### 2. Test Fixture (in your test setup file)

Wrap your base test with `withOrchestratorFilter`:

```typescript
// e2e/setup.ts
import { test as base } from "@playwright/test";
import { withOrchestratorFilter } from "@nsxbet/playwright-orchestrator/fixture";

export const test = withOrchestratorFilter(base);
export { expect } from "@playwright/test";
```

Then use this `test` in your spec files:

```typescript
// e2e/login.spec.ts
import { test, expect } from "./setup";

test("should login", async ({ page }) => {
  // ...
});
```

The reporter and fixture work together:
- **Reporter**: Reads `ORCHESTRATOR_SHARD_FILE` env var to know which tests belong to this shard
- **Fixture**: Skips tests that don't belong to the current shard at runtime

## Local Testing

Reproduce CI shard behavior locally:

```bash
# 1. Generate test list (same as CI does)
npx playwright test --list --reporter=json --project="Mobile Chrome" > test-list.json

# 2. Get shard distribution and extract shard 1 (requires jq)
playwright-orchestrator assign --test-list test-list.json --shards 4 | jq '.shards."1"' > shard.json

# 3. Run tests for that shard
ORCHESTRATOR_SHARD_FILE=shard.json npx playwright test --project="Mobile Chrome"
```

This is useful for debugging why a specific test runs (or doesn't run) in a particular shard.

## GitHub Actions (External Repositories)

Use the orchestrator in your own repository. The recommended pattern runs orchestration **once** before matrix jobs.

**Important**: Use `npx playwright test --list --reporter=json` to generate the test list. This ensures accurate discovery of parameterized tests (`test.each`) and avoids mismatches between discovered and actual tests.

**Monorepo Note**: In monorepos, generate the test list from the same directory where tests run (where `playwright.config.ts` lives). See [Monorepo Usage](./docs/external-integration.md#monorepo-usage) for details.

```yaml
jobs:
  # Phase 1: Orchestrate (runs once)
  orchestrate:
    runs-on: ubuntu-24.04
    outputs:
      shard-files: ${{ steps.orchestrate.outputs.shard-files }}
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - run: npm ci

      - uses: NSXBet/playwright-orchestrator/.github/actions/setup-orchestrator@v0

      # YOU control cache location
      - uses: actions/cache/restore@v4
        with:
          path: timing-data.json
          key: playwright-timing-${{ github.ref_name }}
          restore-keys: playwright-timing-

      # IMPORTANT: Generate test list from the directory where tests run
      # In monorepos, use working-directory to match where playwright.config.ts lives
      - run: npx playwright test --list --reporter=json > test-list.json

      # Action handles all orchestration logic
      - uses: NSXBet/playwright-orchestrator/.github/actions/orchestrate@v0
        id: orchestrate
        with:
          test-list: test-list.json # Required: pre-generated list
          timing-file: timing-data.json # Required: timing data
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

      # Action outputs shard-file path for reporter
      - uses: NSXBet/playwright-orchestrator/.github/actions/get-shard@v0
        id: shard
        with:
          shard-files: ${{ needs.orchestrate.outputs.shard-files }}
          shard-index: ${{ matrix.shard }}
          shards: 4

      # Reporter reads ORCHESTRATOR_SHARD_FILE to filter tests
      - run: npx playwright test
        env:
          ORCHESTRATOR_SHARD_FILE: ${{ steps.shard.outputs.shard-file }}
```

See [docs/external-integration.md](./docs/external-integration.md) for complete workflow with timing data persistence.

## CLI Commands

| Command          | Description                                               |
| ---------------- | --------------------------------------------------------- |
| `assign`         | Distribute tests across shards                            |
| `extract-timing` | Extract timing from Playwright report                     |
| `merge-timing`   | Merge timing data with EMA smoothing                      |
| `filter-report`  | Remove orchestrator-skipped tests from merged JSON report |

Run `playwright-orchestrator <command> --help` for details.

### File Affinity

By default, the `assign` command keeps tests from the same file on the same shard when the time difference is small. This reduces redundant page/context initialization costs in frameworks like Next.js where the first test on a page pays a "footprint" cost.

The penalty is auto-calculated from timing data (P25 of per-file average durations). You can override or disable it:

```bash
# Disable file affinity
playwright-orchestrator assign --test-list test-list.json --shards 4 --no-file-affinity

# Override penalty (in ms)
playwright-orchestrator assign --test-list test-list.json --shards 4 --file-affinity-penalty 20000
```

## Development

```bash
# Install dependencies
make install

# Run quality checks
make lint       # Biome linter
make typecheck  # TypeScript
make test       # Bun test

# Build
make build

# Run CI locally (requires Act)
make act-test
```

## E2E Testing

The repository includes comprehensive E2E tests that simulate real-world monorepo usage:

```bash
# Run E2E monorepo workflow with Act
make act-e2e-monorepo
```

The E2E workflow (`e2e-monorepo.yml`) tests the complete orchestration cycle:

1. **setup**: Build package, create tarball artifact
2. **orchestrate**: Use real `orchestrate` action to assign tests
3. **e2e-tests** (matrix): Use `get-shard` and `extract-timing` actions
4. **merge**: Use `merge-timing` action to combine timing data

**Note**: Publish validation is handled separately in CI via the `test-publish` job (Verdaccio).

Test scenarios covered in `examples/monorepo/`:

- Path normalization (orchestrate from root, run from subdirectory)
- Parameterized tests (`test.each` patterns)
- Nested describe blocks (4+ levels deep)
- Special characters in test names (Unicode, brackets)
- `::` separator conflicts in test titles
- Skip patterns (`skip`, `fixme`, `slow`, tags)
- Deep subdirectory paths

See [AGENTS.md](./AGENTS.md) for AI assistant instructions.

## Cache Strategy

GitHub Actions cache is branch-scoped, which creates challenges for sharing timing data between PRs and main. We recommend a **promote-on-merge** pattern:

1. Each PR branch saves to its own cache key
2. PRs restore from their own cache, falling back to main
3. When a PR is merged, a workflow promotes the PR's cache to main

This avoids race conditions between concurrent PRs while ensuring main always has the latest timing data.

See [Cache Strategy for PRs](./docs/external-integration.md#cache-strategy-for-prs) for implementation details.

## License

MIT
