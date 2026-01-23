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

## Workflow Architecture

The recommended pattern uses **three phases** to avoid redundant orchestration:

```
┌─────────────────┐     ┌─────────────────────────────────┐     ┌─────────────┐
│   orchestrate   │────▶│      e2e (matrix: [1,2,3,4])    │────▶│ merge-timing│
│   (1 job)       │     │  Read files → Run tests         │     │ (1 job)     │
└─────────────────┘     └─────────────────────────────────┘     └─────────────┘
```

**Why three phases?**
- **Efficiency**: Run CKK algorithm once, not N times (one per shard)
- **Consistency**: All shards get assignments from the same computation
- **Simplicity**: Pass file lists directly to Playwright (no grep patterns needed)

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
      shard-files: ${{ steps.assign.outputs.shard-files }}
      expected-durations: ${{ steps.assign.outputs.expected-durations }}
      use-orchestrator: ${{ steps.assign.outputs.use-orchestrator }}
    steps:
      - uses: actions/checkout@v4

      - name: Setup Orchestrator
        uses: NSXBet/playwright-orchestrator/.github/actions/setup-orchestrator@v1

      - name: Restore timing cache
        id: cache
        uses: actions/cache/restore@v4
        with:
          path: timing-data.json
          key: playwright-timing-${{ github.ref_name }}
          restore-keys: |
            playwright-timing-main
            playwright-timing-

      - name: Assign tests to shards
        id: assign
        run: |
          TIMING_ARG=""
          if [ "${{ steps.cache.outputs.cache-hit }}" = "true" ]; then
            TIMING_ARG="--timing-file timing-data.json"
          fi

          set +e
          RESULT=$(playwright-orchestrator assign \
            --test-dir ./e2e \
            --shards ${{ env.SHARDS }} \
            --level file \
            --output-format json \
            $TIMING_ARG 2>&1)
          EXIT_CODE=$?
          set -e

          # Validate JSON output
          if [ $EXIT_CODE -ne 0 ] || ! echo "$RESULT" | jq -e '.' > /dev/null 2>&1; then
            echo "::warning::Orchestrator failed, falling back to native sharding"
            echo "use-orchestrator=false" >> $GITHUB_OUTPUT
            echo "shard-files={}" >> $GITHUB_OUTPUT
            echo "expected-durations={}" >> $GITHUB_OUTPUT
          else
            echo "use-orchestrator=true" >> $GITHUB_OUTPUT
            echo "shard-files=$(echo "$RESULT" | jq -c '.shards')" >> $GITHUB_OUTPUT
            echo "expected-durations=$(echo "$RESULT" | jq -c '.expectedDurations')" >> $GITHUB_OUTPUT

            # Log summary
            echo "### Orchestrator Assignment" >> $GITHUB_STEP_SUMMARY
            for i in $(seq 1 ${{ env.SHARDS }}); do
              FILES=$(echo "$RESULT" | jq -r ".shards.\"$i\" | length")
              DURATION=$(echo "$RESULT" | jq -r ".expectedDurations.\"$i\"")
              echo "- **Shard $i**: $FILES files (~$((DURATION / 1000))s)" >> $GITHUB_STEP_SUMMARY
            done
          fi

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

      # Get files assigned to this shard
      - name: Get shard files
        if: needs.orchestrate.outputs.use-orchestrator == 'true'
        id: files
        run: |
          FILES=$(echo '${{ needs.orchestrate.outputs.shard-files }}' | jq -r '.["${{ matrix.shard }}"] | join(" ")')
          echo "list=$FILES" >> $GITHUB_OUTPUT
          echo "has-files=$([ -n "$FILES" ] && echo 'true' || echo 'false')" >> $GITHUB_OUTPUT

      # Run tests with orchestrated file list
      - name: Run Playwright (orchestrated)
        if: needs.orchestrate.outputs.use-orchestrator == 'true' && steps.files.outputs.has-files == 'true'
        run: npx playwright test ${{ steps.files.outputs.list }}

      # Fallback to native sharding
      - name: Run Playwright (fallback)
        if: needs.orchestrate.outputs.use-orchestrator != 'true'
        run: npx playwright test --shard=${{ matrix.shard }}/${{ env.SHARDS }}

      # Skip empty shard
      - name: Skip empty shard
        if: needs.orchestrate.outputs.use-orchestrator == 'true' && steps.files.outputs.has-files != 'true'
        run: echo "No files assigned to this shard"

      # Extract timing (runs unless cancelled)
      - name: Setup Orchestrator
        if: success() || failure()
        uses: NSXBet/playwright-orchestrator/.github/actions/setup-orchestrator@v1

      - name: Extract timing
        if: success() || failure()
        uses: NSXBet/playwright-orchestrator/.github/actions/extract-timing@v1
        with:
          report-file: playwright-report/results.json
          output-file: timing-shard-${{ matrix.shard }}.json
          shard: ${{ matrix.shard }}
          level: file

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
        uses: NSXBet/playwright-orchestrator/.github/actions/setup-orchestrator@v1

      - name: Restore timing cache
        uses: actions/cache/restore@v4
        with:
          path: timing-data.json
          key: playwright-timing-${{ github.ref_name }}
          restore-keys: playwright-timing-

      - name: Download timing artifacts
        uses: actions/download-artifact@v4
        with:
          pattern: timing-shard-*
          merge-multiple: true

      - name: Merge timing data
        uses: NSXBet/playwright-orchestrator/.github/actions/merge-timing@v1
        with:
          existing-file: timing-data.json
          new-files: timing-shard-*.json
          output-file: timing-data.json
          level: file

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

### extract-timing

Extracts timing from Playwright reports.

```yaml
- uses: NSXBet/playwright-orchestrator/.github/actions/extract-timing@v1
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
- uses: NSXBet/playwright-orchestrator/.github/actions/merge-timing@v1
  with:
    existing-file: ''            # Optional: existing timing data
    new-files: 'timing-*.json'   # Required: space-separated paths/globs
    output-file: ./timing.json   # Required: output path
    alpha: '0.3'                 # Optional: EMA factor
    prune-days: '30'             # Optional: remove old entries
    level: file                  # Optional: 'test' or 'file' (file recommended)
```

## CLI Commands

The recommended approach is to call the CLI directly in the orchestrate job:

```bash
# Assign tests to shards (outputs JSON with all shard assignments)
playwright-orchestrator assign \
  --test-dir ./e2e \
  --shards 4 \
  --level file \
  --timing-file timing-data.json \
  --output-format json
```

**Output format:**
```json
{
  "shards": {
    "1": ["file1.spec.ts", "file2.spec.ts"],
    "2": ["file3.spec.ts"],
    ...
  },
  "expectedDurations": {
    "1": 45000,
    "2": 43000,
    ...
  },
  "isOptimal": true
}
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
