# External Integration Guide

This guide explains how to integrate the playwright-orchestrator into your own GitHub repository.

## Overview

The orchestrator provides GitHub Actions that you can reference directly in your workflows:

| Action | Purpose |
|--------|---------|
| `setup-orchestrator` | Install and cache the CLI |
| `orchestrate` | Assign tests to shards (outputs all shards when `shard-index` omitted) |
| `get-shard` | Extract test arguments for a specific shard |
| `extract-timing` | Extract timing from Playwright reports |
| `merge-timing` | Merge timing data from multiple shards |

## Versioning

Actions are tagged to match the npm package version:

- `@v0` - Latest v0.x.x (recommended for stability)
- `@v0.2.0` - Exact version (for reproducibility)
- `@main` - Latest development (not recommended for production)

## Workflow Architecture

The recommended pattern uses **three phases** to avoid redundant orchestration:

```
┌─────────────────┐     ┌─────────────────────────────────┐     ┌─────────────┐
│   orchestrate   │────▶│      e2e (matrix: [1,2,3,4])    │────▶│ merge-timing│
│   (1 job)       │     │  get-shard → Run tests          │     │ (1 job)     │
└─────────────────┘     └─────────────────────────────────┘     └─────────────┘
```

**Why three phases?**
- **Efficiency**: Run CKK algorithm once, not N times (one per shard)
- **Consistency**: All shards get assignments from the same computation
- **Simplicity**: Actions handle all parsing and fallback logic

## Complete Workflow with Timing Data

```yaml
name: E2E Tests

on:
  push:
    branches: [main]
  pull_request:

env:
  SHARDS: 4

jobs:
  # ============================================
  # Phase 1: Orchestrate (runs once)
  # ============================================
  orchestrate:
    runs-on: ubuntu-24.04
    outputs:
      shard-files: ${{ steps.orchestrate.outputs.shard-files }}
      grep-patterns: ${{ steps.orchestrate.outputs.grep-patterns }}
    steps:
      - uses: actions/checkout@v4

      - name: Setup Orchestrator
        uses: NSXBet/playwright-orchestrator/.github/actions/setup-orchestrator@v0

      # YOU control cache location
      - name: Restore timing cache
        uses: actions/cache/restore@v4
        with:
          path: timing-data.json
          key: playwright-timing-${{ github.ref_name }}
          restore-keys: |
            playwright-timing-main
            playwright-timing-

      # Action handles all orchestration logic
      - name: Orchestrate tests
        id: orchestrate
        uses: NSXBet/playwright-orchestrator/.github/actions/orchestrate@v0
        with:
          test-dir: ./e2e
          shards: ${{ env.SHARDS }}
          timing-file: timing-data.json
          project: chromium  # Recommended for accurate parameterized test discovery
          # No shard-index = outputs ALL shards

  # ============================================
  # Phase 2: Run tests (parallel matrix)
  # ============================================
  e2e:
    needs: [orchestrate]
    runs-on: ubuntu-24.04
    strategy:
      fail-fast: false
      matrix:
        shard: [1, 2, 3, 4]
    steps:
      - uses: actions/checkout@v4

      # Setup your project (adjust as needed)
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - run: npm ci
      - run: npx playwright install chromium --with-deps

      # Action handles parsing + fallback
      - name: Get shard assignment
        uses: NSXBet/playwright-orchestrator/.github/actions/get-shard@v0
        id: shard
        with:
          shard-files: ${{ needs.orchestrate.outputs.shard-files }}
          grep-patterns: ${{ needs.orchestrate.outputs.grep-patterns }}
          shard-index: ${{ matrix.shard }}
          shards: ${{ env.SHARDS }}

      # Just works - --grep="pattern", files, or --shard=N/M
      - name: Run Playwright tests
        run: npx playwright test ${{ steps.shard.outputs.test-args }}

      # Extract timing (runs unless cancelled)
      - name: Setup Orchestrator
        if: success() || failure()
        uses: NSXBet/playwright-orchestrator/.github/actions/setup-orchestrator@v0

      - name: Extract timing
        if: success() || failure()
        uses: NSXBet/playwright-orchestrator/.github/actions/extract-timing@v0
        with:
          report-file: playwright-report/results.json
          output-file: timing-shard-${{ matrix.shard }}.json
          shard: ${{ matrix.shard }}
          level: file

      # YOU control artifact location
      - name: Upload timing artifact
        if: success() || failure()
        uses: actions/upload-artifact@v4
        with:
          name: timing-shard-${{ matrix.shard }}
          path: timing-shard-${{ matrix.shard }}.json
          retention-days: 1
          if-no-files-found: ignore

  # ============================================
  # Phase 3: Merge timing data
  # ============================================
  merge-timing:
    needs: [orchestrate, e2e]
    if: success() || failure()
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v4

      - name: Setup Orchestrator
        uses: NSXBet/playwright-orchestrator/.github/actions/setup-orchestrator@v0

      # YOU control cache location
      - name: Restore timing cache
        uses: actions/cache/restore@v4
        with:
          path: timing-data.json
          key: playwright-timing-${{ github.ref_name }}
          restore-keys: playwright-timing-

      # YOU control artifact location
      - name: Download timing artifacts
        uses: actions/download-artifact@v4
        with:
          pattern: timing-shard-*
          merge-multiple: true

      - name: Merge timing data
        uses: NSXBet/playwright-orchestrator/.github/actions/merge-timing@v0
        with:
          existing-file: timing-data.json
          new-files: timing-shard-*.json
          output-file: timing-data.json
          level: file

      # YOU control cache location
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
- uses: NSXBet/playwright-orchestrator/.github/actions/setup-orchestrator@v0
  with:
    version: ''  # Optional: specific version (default: latest)
```

### orchestrate

Assigns tests to shards. Omit `shard-index` to output ALL shards (recommended for three-phase pattern).

```yaml
- uses: NSXBet/playwright-orchestrator/.github/actions/orchestrate@v0
  id: orchestrate
  with:
    test-dir: ./e2e           # Required: path to tests
    shards: 4                 # Required: total shard count
    timing-file: ''           # Optional: path to timing data
    level: file               # Optional: 'test' or 'file' (file recommended)
    project: ''               # Optional: Playwright project name (recommended for accurate discovery)
    # shard-index: OMIT for all-shards mode
```

**Note**: The `project` parameter is recommended when using `level: test` to ensure accurate discovery of parameterized tests (e.g., `test.each`). Without it, some tests may not be discovered correctly.

**Outputs (all-shards mode):**
- `shard-files`: JSON object with file/test assignments for all shards
- `grep-patterns`: JSON object with grep patterns for all shards (test-level only)
- `expected-durations`: JSON object with expected durations per shard
- `use-orchestrator`: Whether orchestration succeeded

### get-shard

Extracts test arguments for a specific shard. Handles parsing and fallback automatically.

```yaml
- uses: NSXBet/playwright-orchestrator/.github/actions/get-shard@v0
  id: shard
  with:
    shard-files: ${{ needs.orchestrate.outputs.shard-files }}
    grep-patterns: ${{ needs.orchestrate.outputs.grep-patterns }}  # For test-level
    shard-index: ${{ matrix.shard }}
    shards: 4                 # For fallback to --shard=N/M
```

**Outputs:**
- `test-args`: Arguments for playwright test (`--grep="pattern"`, files, or `--shard=N/M`)
- `has-files`: Whether this shard has orchestrated files
- `file-list`: Space-separated file list (empty if fallback)

### extract-timing

Extracts timing from Playwright reports.

```yaml
- uses: NSXBet/playwright-orchestrator/.github/actions/extract-timing@v0
  with:
    report-file: ./results.json  # Required: Playwright JSON report
    output-file: ./timing.json   # Required: output path
    shard: 1                     # Required: shard index
    project: default             # Optional: Playwright project
    level: file                  # Optional: 'test' or 'file' (file recommended)
```

### merge-timing

Merges timing data with EMA smoothing.

```yaml
- uses: NSXBet/playwright-orchestrator/.github/actions/merge-timing@v0
  with:
    existing-file: ''            # Optional: existing timing data
    new-files: 'timing-*.json'   # Required: space-separated paths/globs
    output-file: ./timing.json   # Required: output path
    alpha: '0.3'                 # Optional: EMA factor
    prune-days: '30'             # Optional: remove old entries
    level: file                  # Optional: 'test' or 'file' (file recommended)
```

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
