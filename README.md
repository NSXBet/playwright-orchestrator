# @nsxbet/playwright-orchestrator

Intelligent Playwright test distribution across CI shards using historical timing data.

## The Problem

Default Playwright sharding (`--shard=N/M`) distributes tests by **file count**, not by duration. This creates significant imbalance:

| Shard | Duration | vs Fastest |
|-------|----------|------------|
| Shard 1 | ~31 min | +182% |
| Shard 2 | ~15 min | +36% |
| Shard 3 | ~22 min | +100% |
| Shard 4 | ~11 min | baseline |

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

# Discover tests
playwright-orchestrator list-tests --test-dir ./e2e

# Assign tests to shards (with timing data)
playwright-orchestrator assign \
  --test-dir ./e2e \
  --timing-file ./timing-data.json \
  --shards 4

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
│  (assign)       │     │   (parallel)    │     │  (EMA smooth)   │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                       │                       │
        ▼                       ▼                       ▼
  timing-data.json        --grep patterns         timing-data.json
  (read history)          (per shard)             (updated)
```

1. **Orchestrate**: Read timing history, distribute tests across shards
2. **Run Tests**: Each shard runs its assigned tests via `--grep`
3. **Merge**: Collect timing from all shards, update history with EMA

## GitHub Actions (External Repositories)

Use the orchestrator in your own repository with these actions:

```yaml
jobs:
  e2e:
    runs-on: ubuntu-24.04
    strategy:
      matrix:
        shard: [1, 2, 3, 4]
    steps:
      - uses: actions/checkout@v4

      # Install orchestrator CLI
      - uses: NSXBet/playwright-orchestrator/.github/actions/setup-orchestrator@v1

      # Restore timing cache (you control this)
      - uses: actions/cache/restore@v4
        with:
          path: timing-data.json
          key: playwright-timing-${{ github.ref_name }}
          restore-keys: playwright-timing-

      # Assign tests to this shard
      - uses: NSXBet/playwright-orchestrator/.github/actions/orchestrate@v1
        id: orchestrate
        with:
          test-dir: ./e2e
          shards: 4
          shard-index: ${{ matrix.shard }}
          timing-file: timing-data.json

      # Run tests (with fallback to native sharding)
      - name: Run Playwright
        run: |
          if [ "${{ steps.orchestrate.outputs.use-native-sharding }}" = "true" ]; then
            npx playwright test ${{ steps.orchestrate.outputs.shard-arg }}
          else
            npx playwright test --grep "${{ steps.orchestrate.outputs.grep-pattern }}"
          fi

      # Extract timing (runs on success or failure, not on cancel)
      - if: success() || failure()
        uses: NSXBet/playwright-orchestrator/.github/actions/extract-timing@v1
        with:
          report-file: playwright-report/results.json
          output-file: timing-shard-${{ matrix.shard }}.json
          shard: ${{ matrix.shard }}
```

See [docs/external-integration.md](./docs/external-integration.md) for complete workflow with timing data persistence.

## CLI Commands

| Command | Description |
|---------|-------------|
| `list-tests` | Discover tests in a project |
| `assign` | Distribute tests across shards |
| `extract-timing` | Extract timing from Playwright report |
| `merge-timing` | Merge timing data with EMA smoothing |

Run `playwright-orchestrator <command> --help` for details.

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

See [AGENTS.md](./AGENTS.md) for AI assistant instructions.

## License

MIT
