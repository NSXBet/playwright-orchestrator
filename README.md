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

## Quick Start

```bash
# Install
bun add -D @nsxbet/playwright-orchestrator

# Discover tests (uses Playwright --list for accurate discovery)
playwright-orchestrator list-tests --test-dir ./e2e --project "Mobile Chrome"

# Assign tests to shards (with timing data)
playwright-orchestrator assign \
  --test-dir ./e2e \
  --timing-file ./timing-data.json \
  --shards 4 \
  --project "Mobile Chrome"  # Recommended for accurate test discovery

# Extract timing from report
playwright-orchestrator extract-timing \
  --report-file ./playwright-report/results.json \
  --output-file ./shard-1-timing.json

# Merge timing data
playwright-orchestrator merge-timing \
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

## Reporter Setup

Add the reporter to your `playwright.config.ts`:

```typescript
import { defineConfig } from "@playwright/test";

export default defineConfig({
  reporter: [["@nsxbet/playwright-orchestrator/reporter"], ["html"]],
});
```

The reporter reads `ORCHESTRATOR_SHARD_FILE` env var to filter tests for the current shard.

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
          test-list: test-list.json # Use pre-generated list (recommended)
          shards: 4
          timing-file: timing-data.json

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

| Command          | Description                                                                      |
| ---------------- | -------------------------------------------------------------------------------- |
| `list-tests`     | Discover tests in a project (uses Playwright `--list`)                           |
| `assign`         | Distribute tests across shards (uses Playwright `--list` for accurate discovery) |
| `extract-timing` | Extract timing from Playwright report                                            |
| `merge-timing`   | Merge timing data with EMA smoothing                                             |

Run `playwright-orchestrator <command> --help` for details.

**Important**: The `--project` flag is recommended for both `list-tests` and `assign` commands to ensure accurate test discovery, especially for parameterized tests (e.g., `test.each`).

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

## License

MIT
