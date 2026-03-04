# External Integration Guide

This guide explains how to integrate the playwright-orchestrator into your own GitHub repository.

**Requires Playwright 1.56+** (uses `--test-list` for pre-execution filtering)

## Overview

The orchestrator provides GitHub Actions that you can reference directly in your workflows:

| Action               | Purpose                                                      |
| -------------------- | ------------------------------------------------------------ |
| `setup-orchestrator` | Install and cache the CLI                                    |
| `orchestrate`        | Assign tests to shards (outputs `test-list-files` JSON)      |
| `get-shard`          | Write `test-list-file` for Playwright `--test-list` flag     |
| `extract-timing`     | Extract timing from Playwright reports (requires project)    |
| `merge-timing`       | Merge timing data from multiple shards                       |

## Versioning

Actions are tagged to match the npm package version:

- `@v2` - Latest v2.x.x (recommended for stability)
- `@v2.0.0` - Exact version (for reproducibility)
- `@main` - Latest development (not recommended for production)

## Workflow Architecture

The recommended pattern uses **three phases** to avoid redundant orchestration:

```
┌─────────────────┐     ┌─────────────────────────────────┐     ┌─────────────┐
│   orchestrate   │────▶│      e2e (matrix: [1,2,3,4])    │────▶│ merge-timing│
│   (1 job)       │     │  get-shard → --test-list         │     │ (1 job)     │
└─────────────────┘     └─────────────────────────────────┘     └─────────────┘
```

**Why three phases?**

- **Efficiency**: Run CKK algorithm once, not N times (one per shard)
- **Consistency**: All shards get assignments from the same computation
- **Rerun safety**: On retry, only test jobs re-run — orchestration results are reused, preserving deterministic shard assignments (critical for `--last-failed`)
- **Simplicity**: Actions handle all parsing and fallback logic

## Complete Workflow

**Important**: Use `npx playwright test --list --reporter=json` to generate the test list. This ensures accurate discovery of parameterized and dynamically generated tests.

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
      test-list-files: ${{ steps.orchestrate.outputs.test-list-files }}
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - run: npm ci

      - name: Setup Orchestrator
        uses: NSXBet/playwright-orchestrator/.github/actions/setup-orchestrator@v2

      # YOU control cache location
      - name: Restore timing cache
        uses: actions/cache/restore@v4
        with:
          path: timing-data.json
          key: playwright-timing-${{ github.ref_name }}
          restore-keys: |
            playwright-timing-main
            playwright-timing-

      - name: Generate test list
        run: npx playwright test --list --reporter=json > test-list.json

      - name: Orchestrate tests
        id: orchestrate
        uses: NSXBet/playwright-orchestrator/.github/actions/orchestrate@v2
        with:
          test-list: test-list.json
          timing-file: timing-data.json
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

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - run: npm ci
      - run: npx playwright install chromium --with-deps

      # Action writes test-list file for --test-list flag
      - name: Get shard assignment
        uses: NSXBet/playwright-orchestrator/.github/actions/get-shard@v2
        id: shard
        with:
          test-list-files: ${{ needs.orchestrate.outputs.test-list-files }}
          shard-index: ${{ matrix.shard }}
          shards: ${{ env.SHARDS }}

      # Use --test-list for pre-execution filtering
      # Falls back to native --shard=N/M if orchestration failed
      - name: Run Playwright tests
        run: |
          TEST_LIST_FILE="${{ steps.shard.outputs.test-list-file }}"
          if [ -n "$TEST_LIST_FILE" ] && [ -f "$TEST_LIST_FILE" ]; then
            npx playwright test --test-list "$TEST_LIST_FILE"
          else
            npx playwright test ${{ steps.shard.outputs.fallback-args }}
          fi

      # Extract timing (runs unless cancelled)
      - name: Setup Orchestrator
        if: success() || failure()
        uses: NSXBet/playwright-orchestrator/.github/actions/setup-orchestrator@v2

      - name: Extract timing
        if: success() || failure()
        uses: NSXBet/playwright-orchestrator/.github/actions/extract-timing@v2
        with:
          report-file: playwright-report/results.json
          output-file: timing-shard-${{ matrix.shard }}.json
          shard: ${{ matrix.shard }}
          project: chromium

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
        uses: NSXBet/playwright-orchestrator/.github/actions/setup-orchestrator@v2

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
        uses: NSXBet/playwright-orchestrator/.github/actions/merge-timing@v2
        with:
          existing-file: timing-data.json
          new-files: timing-shard-*.json
          output-file: timing-data.json

      - name: Save timing cache
        uses: actions/cache/save@v4
        with:
          path: timing-data.json
          key: playwright-timing-${{ github.ref_name }}-${{ github.run_id }}
```

## Rerun with `--last-failed`

Playwright 1.49+ supports `--last-failed`, which re-runs only tests that failed in the previous attempt. The orchestrator supports this natively — orchestration runs in a separate build job, so shard assignments stay the same across retry attempts.

```
Attempt 1:  [e2e-build: orchestrate] → [shard 1 ✅] [shard 2 ❌] [shard 3 ✅]
                                                          ↓ (re-run failed jobs)
Attempt 2:  [e2e-build: skipped]     →                [shard 2 --last-failed ✅]
```

### Implementation

Each shard saves its `.last-run.json` as an artifact after every run. On retry, shards download the previous attempt's last-run data, merge the failed tests, and pass `--last-failed` to Playwright.

```yaml
jobs:
  # Phase 0: Build + Orchestrate (NOT re-executed on retry)
  e2e-build:
    runs-on: ubuntu-24.04
    outputs:
      test-list-files: ${{ steps.orchestrate.outputs.test-list-files }}
    steps:
      - uses: actions/checkout@v4
      - run: npm ci

      - uses: NSXBet/playwright-orchestrator/.github/actions/setup-orchestrator@v2

      - uses: actions/cache/restore@v4
        with:
          path: timing-data.json
          key: playwright-timing-${{ github.ref_name }}
          restore-keys: playwright-timing-

      - run: npx playwright test --list --reporter=json > test-list.json

      - uses: NSXBet/playwright-orchestrator/.github/actions/orchestrate@v2
        id: orchestrate
        with:
          test-list: test-list.json
          timing-file: timing-data.json
          shards: 4

  # Phase 1: Run tests (with --last-failed on retry)
  e2e:
    needs: [e2e-build]
    runs-on: ubuntu-24.04
    strategy:
      fail-fast: false
      matrix:
        shard: [1, 2, 3, 4]
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npx playwright install chromium --with-deps

      - uses: NSXBet/playwright-orchestrator/.github/actions/get-shard@v2
        id: shard
        with:
          test-list-files: ${{ needs.e2e-build.outputs.test-list-files }}
          shard-index: ${{ matrix.shard }}
          shards: 4

      # --- last-failed support ---
      - name: Compute previous attempt number
        if: github.run_attempt > 1
        id: prev-attempt
        run: echo "number=$(( ${{ github.run_attempt }} - 1 ))" >> $GITHUB_OUTPUT

      - name: Download previous last-run data
        if: github.run_attempt > 1
        id: download-last-run
        uses: actions/download-artifact@v4
        with:
          pattern: e2e-last-run-attempt-${{ steps.prev-attempt.outputs.number }}-shard-*
          merge-multiple: true
          path: previous-last-run
        continue-on-error: true

      - name: Merge last-run data for --last-failed
        if: github.run_attempt > 1 && steps.download-last-run.outcome == 'success'
        run: |
          if compgen -G "previous-last-run/last-run-shard-*.json" > /dev/null 2>&1; then
            mkdir -p test-results
            jq -s '{ status: "failed", failedTests: [.[].failedTests[]?] | unique }' \
              previous-last-run/last-run-shard-*.json \
              > test-results/.last-run.json
            echo "Merged failed tests for --last-failed:"
            cat test-results/.last-run.json
          else
            echo "No previous last-run data found, will run all tests"
          fi

      # --- run tests ---
      - name: Run Playwright tests
        run: |
          LAST_FAILED_FLAG=""
          if [ "${{ github.run_attempt }}" -gt 1 ] && [ -f test-results/.last-run.json ]; then
            FAILED_COUNT=$(jq '.failedTests | length' test-results/.last-run.json 2>/dev/null || echo 0)
            if [ "$FAILED_COUNT" -gt 0 ]; then
              LAST_FAILED_FLAG="--last-failed"
              echo "::notice::Re-run detected (attempt ${{ github.run_attempt }}), using --last-failed ($FAILED_COUNT previously failed tests)"
            else
              echo "::notice::Re-run detected but no failed tests in last-run data — running all tests"
            fi
          fi

          TEST_LIST_FILE="${{ steps.shard.outputs.test-list-file }}"
          if [ -n "$TEST_LIST_FILE" ] && [ -f "$TEST_LIST_FILE" ]; then
            npx playwright test --test-list "$TEST_LIST_FILE" $LAST_FAILED_FLAG
          else
            npx playwright test ${{ steps.shard.outputs.fallback-args }} $LAST_FAILED_FLAG
          fi

      # --- save last-run for potential rerun ---
      - name: Save last-run data
        if: "!cancelled()"
        run: |
          if [ -f test-results/.last-run.json ]; then
            cp test-results/.last-run.json last-run-shard-${{ matrix.shard }}.json
          fi

      - name: Upload last-run data
        if: "!cancelled()"
        uses: actions/upload-artifact@v4
        with:
          name: e2e-last-run-attempt-${{ github.run_attempt }}-shard-${{ matrix.shard }}
          path: last-run-shard-${{ matrix.shard }}.json
          retention-days: 7
          if-no-files-found: ignore
```

> **Note:** This example focuses on the `--last-failed` steps only. Add timing extraction and merge phases from the [Complete Workflow](#complete-workflow) section for a full setup.

### Key Design Decisions

| Decision | Rationale |
| --- | --- |
| `test-list-files` via job outputs | Job outputs persist across attempts — no re-computation needed |
| Merge **all** shards' last-run data | A shard may need to re-run a test that was originally in a different shard (edge case with `--last-failed` matching) |
| `failedTests` length guard | Prevents `--last-failed` from silently running zero tests when the `.last-run.json` exists but has no failures |
| Artifact naming with `e2e-` prefix | Avoids collisions with other workflow artifacts; includes attempt number for multi-retry scenarios |
| `!cancelled()` for last-run upload | Ensures last-run data is saved even on failure, but not on cancellation |

### Why Orchestration Must Be in a Separate Job

If orchestration runs **inside each shard job** instead, re-running failed jobs causes the orchestrator to recompute assignments. Since the runner environment, caches, or timing data may differ between attempts, shards can get a **different test distribution** on retry. This means `--last-failed` may find no matching tests in the reassigned shard — silently running zero tests.

```
Attempt 1:  Shard 2 runs test-X → test-X fails
                                    ↓ (re-run failed jobs)
Attempt 2:  Shard 2 re-orchestrates → test-X now assigned to Shard 3
            Shard 2 runs --last-failed → finds nothing → 0 tests run ❌
```

By keeping orchestration in a separate build job, GitHub Actions skips it on retry, so every shard gets the exact same test distribution as the original attempt.

## Monorepo Usage

In monorepos where tests live in a subdirectory (e.g., `apps/web/`), ensure the `test-list.json` is generated from the correct working directory:

```yaml
jobs:
  orchestrate:
    steps:
      # Generate test list FROM the app directory
      - name: Generate test list
        working-directory: apps/web
        run: npx playwright test --list --reporter=json > test-list.json

      - uses: NSXBet/playwright-orchestrator/.github/actions/orchestrate@v2
        with:
          test-list: apps/web/test-list.json
          timing-file: timing-data.json
          shards: 4

  e2e:
    steps:
      # Tests run FROM the app directory with --test-list
      - name: Run tests
        working-directory: apps/web
        run: |
          TEST_LIST_FILE="${{ steps.shard.outputs.test-list-file }}"
          if [ -n "$TEST_LIST_FILE" ] && [ -f "$TEST_LIST_FILE" ]; then
            npx playwright test --test-list "$TEST_LIST_FILE"
          else
            npx playwright test ${{ steps.shard.outputs.fallback-args }}
          fi
```

The orchestrator automatically handles the `testDir` to `rootDir` path conversion when generating test-list files.

## Local Development

Reproduce CI shard behavior locally:

```bash
# 1. Generate test list
npx playwright test --list --reporter=json --project="chromium" > test-list.json

# 2. Get shard distribution (includes testListFiles)
playwright-orchestrator assign --test-list test-list.json --shards 4 --output-format json > result.json

# 3. Write test-list file for shard 1
jq -r '.testListFiles."1"' result.json > shard-1.txt

# 4. Run tests for that shard
npx playwright test --test-list shard-1.txt --project="chromium"
```

### Troubleshooting

**Tests not being filtered:**

- Verify the test-list file contains correct Playwright test-list format entries
- Check that Playwright version is 1.56+ (`--test-list` was introduced in 1.56)

**All tests skipped or zero tests run:**

- Verify file paths in the test-list file are relative to Playwright's `rootDir`
- Run `playwright-orchestrator assign` with `--verbose` to see discovered test IDs

## Action Reference

### setup-orchestrator

Installs and caches the CLI.

```yaml
- uses: NSXBet/playwright-orchestrator/.github/actions/setup-orchestrator@v2
  with:
    version: "" # Optional: specific version (default: latest)
```

### orchestrate

Assigns tests to shards.

```yaml
- uses: NSXBet/playwright-orchestrator/.github/actions/orchestrate@v2
  id: orchestrate
  with:
    test-list: test-list.json # Required: path to test list JSON
    timing-file: timing-data.json # Required: path to timing data
    shards: 4 # Required: total shard count
```

**Outputs:**

- `test-list-files`: JSON object with test-list content per shard (ready for `--test-list`)
- `expected-durations`: JSON object with expected durations per shard
- `total-tests`: Total number of tests
- `is-optimal`: Whether distribution is optimal
- `use-orchestrator`: Whether orchestration succeeded

**Note:** On first run, the timing file may not exist yet. The action will use estimation and emit a notice.

### get-shard

Writes a test-list file for a specific shard.

```yaml
- uses: NSXBet/playwright-orchestrator/.github/actions/get-shard@v2
  id: shard
  with:
    test-list-files: ${{ needs.orchestrate.outputs.test-list-files }}
    shard-index: ${{ matrix.shard }}
    shards: 4
```

**Outputs:**

- `test-list-file`: Path to plain text file for `--test-list` flag
- `has-tests`: Whether this shard has tests
- `test-count`: Number of tests in this shard
- `fallback-args`: Native Playwright shard argument (`--shard=N/M`)

### extract-timing

Extracts timing from Playwright reports.

```yaml
- uses: NSXBet/playwright-orchestrator/.github/actions/extract-timing@v2
  with:
    report-file: ./results.json # Required: Playwright JSON report
    output-file: ./timing.json # Required: output path
    shard: 1 # Required: shard index
    project: chromium # Required: Playwright project name
```

### merge-timing

Merges timing data with EMA smoothing.

```yaml
- uses: NSXBet/playwright-orchestrator/.github/actions/merge-timing@v2
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
```

### Implementation

**In your PR closed workflow** (`on_pr_closed.yaml`):

```yaml
name: Pull Request - Closed
on:
  pull_request:
    types: [closed]

jobs:
  promote-timing-cache:
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

## Cancellation Handling

Steps use `if: success() || failure()` instead of `always()`:

- **Success**: Step runs
- **Failure**: Step runs (captures timing for failed tests)
- **Cancelled**: Step does NOT run

This prevents timing extraction from running when you cancel a workflow.
