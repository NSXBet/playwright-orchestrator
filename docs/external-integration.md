# External Integration Guide

This guide explains how to integrate the playwright-orchestrator into your own GitHub repository.

## Overview

The orchestrator provides GitHub Actions that you can reference directly in your workflows:

| Action               | Purpose                                                        |
| -------------------- | -------------------------------------------------------------- |
| `setup-orchestrator` | Install and cache the CLI                                      |
| `orchestrate`        | Assign tests to shards (outputs `shard-files` JSON)            |
| `get-shard`          | Extract `shard-file` path for reporter-based filtering         |
| `extract-timing`     | Extract timing from Playwright reports (requires shard-file and project) |
| `merge-timing`       | Merge timing data from multiple shards                         |
| `filter-report`      | Remove orchestrator-skipped tests from merged JSON report      |

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

## Complete Workflow with Reporter-Based Filtering

**Important**: Use `npx playwright test --list --reporter=json` to generate the test list. This ensures accurate discovery of parameterized tests (`test.each`) and avoids mismatches between discovered and actual tests.

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
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - run: npm ci

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

      # IMPORTANT: Use Playwright to list tests for accurate discovery
      - name: Generate test list
        run: npx playwright test --list --reporter=json > test-list.json

      # Action handles all orchestration logic
      - name: Orchestrate tests
        id: orchestrate
        uses: NSXBet/playwright-orchestrator/.github/actions/orchestrate@v0
        with:
          test-list: test-list.json # Required: pre-generated list
          timing-file: timing-data.json # Required: timing data
          shards: ${{ env.SHARDS }}

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

      # Action extracts shard-file path for reporter
      - name: Get shard assignment
        uses: NSXBet/playwright-orchestrator/.github/actions/get-shard@v0
        id: shard
        with:
          shard-files: ${{ needs.orchestrate.outputs.shard-files }}
          shard-index: ${{ matrix.shard }}
          shards: ${{ env.SHARDS }}

      # Reporter reads ORCHESTRATOR_SHARD_FILE to filter tests
      - name: Run Playwright tests
        run: npx playwright test
        env:
          ORCHESTRATOR_SHARD_FILE: ${{ steps.shard.outputs.shard-file }}

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

      # YOU control cache location
      - name: Save timing cache
        uses: actions/cache/save@v4
        with:
          path: timing-data.json
          key: playwright-timing-${{ github.ref_name }}-${{ github.run_id }}
```

## Reporter Setup

Add the reporter to your `playwright.config.ts`:

```typescript
import { defineConfig } from "@playwright/test";

export default defineConfig({
  reporter: [["@nsxbet/playwright-orchestrator/reporter"], ["html"]],
});
```

The reporter is included in the package - no need to copy any files.

## Monorepo Usage

In monorepos where tests live in a subdirectory (e.g., `apps/web/`), ensure the `test-list.json` is generated from the correct working directory:

```yaml
jobs:
  orchestrate:
    steps:
      # Generate test list FROM the app directory
      - name: Generate test list
        working-directory: apps/web  # Where playwright.config.ts lives
        run: npx playwright test --list --reporter=json > test-list.json

      # Orchestrate can run from repo root
      - uses: NSXBet/playwright-orchestrator/.github/actions/orchestrate@v0
        with:
          test-list: apps/web/test-list.json  # Path from repo root
          timing-file: timing-data.json
          shards: 4

  e2e:
    steps:
      # Tests run FROM the app directory
      - name: Run tests
        working-directory: apps/web
        run: npx playwright test
        env:
          ORCHESTRATOR_SHARD_FILE: ${{ steps.shard.outputs.shard-file }}
```

**Why this matters**: The orchestrator generates test IDs relative to Playwright's `rootDir` (from the test-list.json config). The fixture generates IDs relative to `process.cwd()`. When both directories match, the IDs are consistent.

**What happens if misconfigured**:
- If `test-list.json` is generated from repo root but tests run from `apps/web/`:
  - Orchestrator: `apps/web/src/e2e/login.spec.ts::...`
  - Fixture: `src/e2e/login.spec.ts::...`
  - Result: **All tests skipped** (IDs don't match)

## Local Development

Reproduce CI shard behavior locally to debug test distribution:

```bash
# 1. Generate test list (same command CI uses)
npx playwright test --list --reporter=json --project="Mobile Chrome" > test-list.json

# 2. Get shard distribution
playwright-orchestrator assign --test-list test-list.json --shards 4

# 3. Extract a specific shard's tests (requires jq)
playwright-orchestrator assign --test-list test-list.json --shards 4 | jq '.shards."1"' > shard.json

# 4. Run tests for that shard
ORCHESTRATOR_SHARD_FILE=shard.json npx playwright test --project="Mobile Chrome"
```

### Verify Reporter is Working

Enable debug logging to see which tests are filtered:

```bash
ORCHESTRATOR_DEBUG=1 ORCHESTRATOR_SHARD_FILE=shard.json npx playwright test
```

You should see output like:

```
[Orchestrator] 25 tests for this shard
[Skip] e2e/other.spec.ts::Other::should work
```

### Troubleshooting

**Tests not being filtered:**

- Verify `ORCHESTRATOR_SHARD_FILE` points to a valid JSON array of test IDs
- Check test IDs match format: `{file}::{describe}::{test-title}`
- Enable debug logging with `ORCHESTRATOR_DEBUG=1`

**All tests skipped:**

- Verify test IDs in shard.json match your actual tests
- Run `playwright-orchestrator assign` with `--verbose` to see discovered test IDs

## Action Reference

### setup-orchestrator

Installs and caches the CLI.

```yaml
- uses: NSXBet/playwright-orchestrator/.github/actions/setup-orchestrator@v0
  with:
    version: "" # Optional: specific version (default: latest)
```

### orchestrate

Assigns tests to shards.

```yaml
- uses: NSXBet/playwright-orchestrator/.github/actions/orchestrate@v0
  id: orchestrate
  with:
    test-list: test-list.json # Required: path to test list JSON
    timing-file: timing-data.json # Required: path to timing data
    shards: 4 # Required: total shard count
    level: test # Optional: 'test' or 'file'
```

**Inputs:**

- `test-list` (required): Path to JSON file from `npx playwright test --list --reporter=json`
- `timing-file` (required): Path to timing data JSON file (created by merge-timing action)
- `shards` (required): Total number of shards
- `level` (optional): Distribution level - `test` (default) or `file`

**Outputs:**

- `shard-files`: JSON object with test assignments for all shards
- `expected-durations`: JSON object with expected durations per shard
- `total-tests`: Total number of tests
- `is-optimal`: Whether distribution is optimal
- `use-orchestrator`: Whether orchestration succeeded

**Note:** On first run, the timing file may not exist yet. The action will use estimation and emit a notice.

### get-shard

Extracts shard-file path for a specific shard.

```yaml
- uses: NSXBet/playwright-orchestrator/.github/actions/get-shard@v0
  id: shard
  with:
    shard-files: ${{ needs.orchestrate.outputs.shard-files }}
    shard-index: ${{ matrix.shard }}
    shards: 4 # For fallback to --shard=N/M
```

**Outputs:**

- `shard-file`: Path to JSON file with test IDs for reporter
- `has-tests`: Whether this shard has tests
- `test-count`: Number of tests in this shard
- `fallback-args`: Native Playwright shard argument (`--shard=N/M`)

### extract-timing

Extracts timing from Playwright reports. Requires a shard file and project name to ensure only shard-relevant tests are included in timing output.

```yaml
- uses: NSXBet/playwright-orchestrator/.github/actions/extract-timing@v1
  with:
    report-file: ./results.json # Required: Playwright JSON report
    output-file: ./timing.json # Required: output path
    shard: 1 # Required: shard index
    project: chromium # Required: Playwright project name
    shard-file: ${{ steps.shard.outputs.shard-file }} # Required: shard JSON file
```

### filter-report

Removes orchestrator-skipped tests from a Playwright JSON report. Useful for cleaning merged reports (from `playwright merge-reports`) where per-shard `filterJson` doesn't help because blob reports still contain all tests.

```yaml
- uses: NSXBet/playwright-orchestrator/.github/actions/filter-report@v0
  with:
    report-file: ./merged-report/results.json # Required: JSON report to filter
    output-file: ./merged-report/results.json # Optional: defaults to overwriting input
```

Identifies orchestrator-skipped tests by the annotation `{type: "skip", description: "Not in shard"}` and removes specs where ALL tests have this annotation.

### merge-timing

Merges timing data with EMA smoothing.

```yaml
- uses: NSXBet/playwright-orchestrator/.github/actions/merge-timing@v0
  with:
    existing-file: "" # Optional: existing timing data
    new-files: "timing-*.json" # Required: space-separated paths/globs
    output-file: ./timing.json # Required: output path
    alpha: "0.3" # Optional: EMA factor
    prune-days: "30" # Optional: remove old entries
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

## Cache Strategy for PRs

GitHub Actions cache is branch-scoped: a PR branch can read from main's cache, but main cannot read from a PR branch's cache. This creates a challenge: timing data collected during PR runs is "lost" after merge.

### Recommended Pattern: Promote on Merge

Use branch-specific cache keys with a promotion workflow:

```
┌─────────────────────────────────────────────────────────────────┐
│ PR opened (branch: feature-x)                                   │
├─────────────────────────────────────────────────────────────────┤
│ 1. Restore: playwright-timing-feature-x-$project                │
│    Fallback: playwright-timing-main-$project                    │
│ 2. Run tests, collect timing                                    │
│ 3. Save: playwright-timing-feature-x-$project-$run_id           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼ (merge)
┌─────────────────────────────────────────────────────────────────┐
│ PR merged → promote-timing-cache workflow                       │
├─────────────────────────────────────────────────────────────────┤
│ 1. Restore: playwright-timing-feature-x-$project                │
│ 2. Save: playwright-timing-main-$project-$run_id                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ Next PR (branch: feature-y)                                     │
├─────────────────────────────────────────────────────────────────┤
│ 1. Restore: playwright-timing-feature-y → miss                  │
│    Fallback: playwright-timing-main → hit (updated data!)       │
└─────────────────────────────────────────────────────────────────┘
```

### Implementation

**In your test workflow** (`_test-playwright.yaml`):

```yaml
env:
  SHARDS: 4

jobs:
  e2e-tests:
    strategy:
      matrix:
        shardIndex: [1, 2, 3, 4]
    steps:
      # ... setup steps ...
      
      - name: Restore timing cache
        uses: actions/cache/restore@v4
        with:
          path: playwright-timing.json
          key: playwright-timing-${{ github.ref_name }}-${{ inputs.project }}
          restore-keys: |
            playwright-timing-main-${{ inputs.project }}
            playwright-timing-

      # ... run tests, extract timing ...

  merge-reports:
    needs: [e2e-tests]
    steps:
      # ... merge timing from all shards ...
      
      - name: Save timing cache
        uses: actions/cache/save@v4
        with:
          path: playwright-timing.json
          key: playwright-timing-${{ github.ref_name }}-${{ inputs.project }}-${{ github.run_id }}
```

**In your PR closed workflow** (`on_pr_closed.yaml`):

```yaml
name: Pull Request - Closed
on:
  pull_request:
    types: [closed]

jobs:
  promote-timing-cache:
    name: Promote timing cache
    if: github.event.pull_request.merged == true
    runs-on: ubuntu-22.04
    strategy:
      matrix:
        project: ["Mobile Chrome", "Mobile Safari"]
    steps:
      - name: Restore PR branch cache
        id: restore
        uses: actions/cache/restore@v4
        with:
          path: playwright-timing.json
          key: playwright-timing-${{ github.event.pull_request.head.ref }}-${{ matrix.project }}

      - name: Promote to main cache
        if: steps.restore.outputs.cache-hit == 'true'
        uses: actions/cache/save@v4
        with:
          path: playwright-timing.json
          key: playwright-timing-main-${{ matrix.project }}-${{ github.run_id }}
```

### Benefits

- **No race conditions**: Each PR has isolated cache
- **Main always updated**: Only receives data from merged PRs that passed CI
- **PRs inherit from main**: Start with the latest timing data
- **Lightweight promotion**: Just copies files, no test execution

### Alternative: S3 or External Storage

If you use S3-backed cache (like runs-on), you may have more flexibility with cross-branch access. In that case, you can use a simpler shared key:

```yaml
# All branches read/write to the same key
key: playwright-timing-${{ inputs.project }}
```

However, this can cause race conditions if multiple PRs run simultaneously. The promote-on-merge pattern avoids this by isolating each PR's timing data.

## Cancellation Handling

Steps use `if: success() || failure()` instead of `always()`:

- **Success**: Step runs
- **Failure**: Step runs (captures timing for failed tests)
- **Cancelled**: Step does NOT run

This prevents timing extraction from running when you cancel a workflow.
