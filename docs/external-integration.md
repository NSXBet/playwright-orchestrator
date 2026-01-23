# External Integration Guide

This guide explains how to integrate the playwright-orchestrator into your own GitHub repository.

## Overview

The orchestrator provides GitHub Actions that you can reference directly in your workflows:

| Action | Purpose |
|--------|---------|
| `setup-orchestrator` | Install and cache the CLI |
| `orchestrate` | Assign tests to shards |
| `extract-timing` | Extract timing from Playwright reports |
| `merge-timing` | Merge timing data from multiple shards |

## Versioning

Actions are tagged to match the npm package version:

- `@v1` - Latest v1.x.x (recommended for stability)
- `@v1.2.3` - Exact version (for reproducibility)
- `@main` - Latest development (not recommended for production)

## Quick Start

```yaml
name: E2E Tests

on: [push, pull_request]

jobs:
  e2e:
    runs-on: ubuntu-24.04
    strategy:
      fail-fast: false
      matrix:
        shard: [1, 2, 3, 4]
    steps:
      - uses: actions/checkout@v4

      - uses: NSXBet/playwright-orchestrator/.github/actions/setup-orchestrator@v1

      - uses: NSXBet/playwright-orchestrator/.github/actions/orchestrate@v1
        id: orchestrate
        with:
          test-dir: ./e2e
          shards: 4
          shard-index: ${{ matrix.shard }}

      - name: Run Playwright
        run: |
          if [ "${{ steps.orchestrate.outputs.use-native-sharding }}" = "true" ]; then
            npx playwright test ${{ steps.orchestrate.outputs.shard-arg }}
          else
            npx playwright test --grep "${{ steps.orchestrate.outputs.grep-pattern }}"
          fi
```

## Complete Workflow with Timing Data

For optimal test distribution, you need to collect and persist timing data:

```yaml
name: E2E Tests

on:
  push:
    branches: [main]
  pull_request:

jobs:
  e2e:
    runs-on: ubuntu-24.04
    strategy:
      fail-fast: false
      matrix:
        shard: [1, 2, 3, 4]
    steps:
      - uses: actions/checkout@v4

      # 1. Setup orchestrator CLI
      - name: Setup Orchestrator
        uses: NSXBet/playwright-orchestrator/.github/actions/setup-orchestrator@v1

      # 2. Restore cached timing data (YOU control this)
      - name: Restore timing cache
        uses: actions/cache/restore@v4
        with:
          path: timing-data.json
          key: playwright-timing-${{ github.ref_name }}
          restore-keys: |
            playwright-timing-main
            playwright-timing-

      # 3. Assign tests to this shard
      - name: Orchestrate tests
        id: orchestrate
        uses: NSXBet/playwright-orchestrator/.github/actions/orchestrate@v1
        with:
          test-dir: ./e2e
          shards: 4
          shard-index: ${{ matrix.shard }}
          timing-file: timing-data.json

      # 4. Setup your project
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - run: npm ci
      - run: npx playwright install chromium --with-deps

      # 5. Run tests (with fallback support)
      - name: Run Playwright
        run: |
          if [ "${{ steps.orchestrate.outputs.use-native-sharding }}" = "true" ]; then
            echo "Using native Playwright sharding"
            npx playwright test ${{ steps.orchestrate.outputs.shard-arg }}
          else
            echo "Using orchestrated distribution (${{ steps.orchestrate.outputs.test-count }} tests)"
            npx playwright test --grep "${{ steps.orchestrate.outputs.grep-pattern }}"
          fi

      # 6. Extract timing (runs on success OR failure, NOT on cancel)
      - name: Extract timing
        if: success() || failure()
        uses: NSXBet/playwright-orchestrator/.github/actions/extract-timing@v1
        with:
          report-file: playwright-report/results.json
          output-file: timing-shard-${{ matrix.shard }}.json
          shard: ${{ matrix.shard }}

      # 7. Upload timing artifact (YOU control this)
      - name: Upload timing artifact
        if: success() || failure()
        uses: actions/upload-artifact@v4
        with:
          name: timing-shard-${{ matrix.shard }}
          path: timing-shard-${{ matrix.shard }}.json
          retention-days: 1

  merge-timing:
    needs: e2e
    if: success() || failure()
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v4

      - name: Setup Orchestrator
        uses: NSXBet/playwright-orchestrator/.github/actions/setup-orchestrator@v1

      # Restore existing timing data
      - name: Restore timing cache
        uses: actions/cache/restore@v4
        with:
          path: timing-data.json
          key: playwright-timing-${{ github.ref_name }}
          restore-keys: playwright-timing-

      # Download all shard timing artifacts
      - name: Download timing artifacts
        uses: actions/download-artifact@v4
        with:
          pattern: timing-shard-*
          merge-multiple: true

      # Merge timing data
      - name: Merge timing data
        uses: NSXBet/playwright-orchestrator/.github/actions/merge-timing@v1
        with:
          existing-file: timing-data.json
          new-files: timing-shard-*.json
          output-file: timing-data.json

      # Save updated timing cache (YOU control this)
      - name: Save timing cache
        uses: actions/cache/save@v4
        with:
          path: timing-data.json
          key: playwright-timing-${{ github.ref_name }}-${{ github.run_id }}
```

## Action Reference

### setup-orchestrator

Installs and caches the CLI.

```yaml
- uses: NSXBet/playwright-orchestrator/.github/actions/setup-orchestrator@v1
  with:
    version: ''  # Optional: specific version (default: latest)
```

### orchestrate

Assigns tests to shards.

```yaml
- uses: NSXBet/playwright-orchestrator/.github/actions/orchestrate@v1
  id: orchestrate
  with:
    test-dir: ./e2e           # Required: path to tests
    shards: 4                 # Required: total shard count
    shard-index: 1            # Required: this shard (1-based)
    timing-file: ''           # Optional: path to timing data
    level: test               # Optional: 'test' or 'file'
    glob-pattern: '**/*.spec.ts'  # Optional: test file pattern
```

**Outputs:**
- `grep-pattern`: Pattern for `--grep` flag
- `test-count`: Number of tests assigned
- `expected-duration`: Expected time in ms
- `is-optimal`: Whether CKK found optimal solution
- `use-native-sharding`: `true` if should use `--shard` flag
- `shard-arg`: Native shard argument (e.g., `--shard=1/4`)

### extract-timing

Extracts timing from Playwright reports.

```yaml
- uses: NSXBet/playwright-orchestrator/.github/actions/extract-timing@v1
  with:
    report-file: ./results.json  # Required: Playwright JSON report
    output-file: ./timing.json   # Required: output path
    shard: 1                     # Required: shard index
    project: default             # Optional: Playwright project
    level: test                  # Optional: 'test' or 'file'
```

**Outputs:**
- `test-count`: Number of tests with timing data extracted
- `success`: Whether extraction succeeded (`true` or `false`)

### merge-timing

Merges timing data with EMA smoothing.

```yaml
- uses: NSXBet/playwright-orchestrator/.github/actions/merge-timing@v1
  with:
    existing-file: ''            # Optional: existing timing data
    new-files: 'timing-*.json'   # Required: space-separated paths/globs
    output-file: ./timing.json   # Required: output path
    alpha: '0.3'                 # Optional: EMA factor
    prune-days: '30'             # Optional: remove old entries
    level: test                  # Optional: 'test' or 'file'
```

**Outputs:**
- `test-count`: Number of tests in merged data
- `success`: Whether merge succeeded (`true` or `false`)

## Fallback Behavior

The orchestrator automatically falls back to Playwright's native `--shard` flag when:

- CLI fails to execute
- No tests are discovered
- Timing file is corrupted
- Shard is assigned zero tests

This ensures your tests **always run**, even on the first execution or if something goes wrong.

## Storage Control

**You control where timing data is stored.** The actions are storage-agnostic:

- They do NOT call `actions/cache` internally
- They do NOT upload artifacts
- You provide input files, they produce output files

This gives you flexibility to:
- Use custom cache keys
- Store timing data in S3 or other backends
- Skip caching entirely for debugging

## Cancellation Handling

Steps use `if: success() || failure()` instead of `always()`:

- **Success**: Step runs
- **Failure**: Step runs (captures timing for failed tests)
- **Cancelled**: Step does NOT run

This prevents timing extraction from running when you cancel a workflow.
