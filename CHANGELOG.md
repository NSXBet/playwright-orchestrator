# @nsxbet/playwright-orchestrator

## 0.4.0

### Minor Changes

- Add `testLocations` output for exact test filtering using file:line format

  The orchestrator now outputs test locations in Playwright's native `file:line` format,
  which guarantees 100% accurate test matching without duplicates.

  Changes:
  - Add `line` and `column` fields to `DiscoveredTest` interface
  - Add `testLocations` output to assign command (alongside existing `grepPatterns`)
  - Add `test-locations` output to orchestrate action
  - Update get-shard action to prefer `test-locations` over `grep-patterns`

  This fixes the issue where grep patterns could match multiple tests with the same
  title in different files or describe blocks, resulting in more tests running than expected.

  Usage (automatic when using orchestrate + get-shard actions):
  ```yaml
  - uses: NSXBet/playwright-orchestrator/.github/actions/get-shard@v0
    with:
      test-locations: ${{ needs.orchestrate.outputs.test-locations }}
      # ... other inputs
  ```

  The `test-args` output will now contain file:line locations like:
  ```
  account.spec.ts:6 account.spec.ts:17 betslip.spec.ts:42
  ```

## 0.3.0

### Minor Changes

- [#14](https://github.com/NSXBet/playwright-orchestrator/pull/14) [`660fa68`](https://github.com/NSXBet/playwright-orchestrator/commit/660fa68094fb8922f080411477eab6050d801529) Thanks [@gtkatakura](https://github.com/gtkatakura)! - Add `--test-list` flag to accept pre-generated Playwright test list

  This is the recommended approach for CI environments where Playwright is already set up.
  Instead of the orchestrator trying to discover tests internally (which requires running
  `npx playwright test --list`), the workflow can generate the test list and pass it directly.

  New workflow pattern:

  ```yaml
  - name: Generate test list
    run: npx playwright test --list --reporter=json --project="My Project" > test-list.json
    working-directory: my-app

  - name: Orchestrate tests
    uses: NSXBet/playwright-orchestrator/.github/actions/orchestrate@v0
    with:
      test-list: my-app/test-list.json
      shards: 4
  ```

  Benefits:

  - More robust: Uses the same Playwright setup that runs tests
  - More debuggable: If `--list` fails, it fails visibly in the workflow step
  - Simpler action: No internal test discovery, just assignment algorithm

## 0.2.3

### Patch Changes

- [#11](https://github.com/NSXBet/playwright-orchestrator/pull/11) [`ddd0115`](https://github.com/NSXBet/playwright-orchestrator/commit/ddd011588bd102aeec2ca4974c260efe5552fd31) Thanks [@gtkatakura](https://github.com/gtkatakura)! - Add `--config-dir` flag to specify Playwright config location

  The `discoverTests` function now accepts a `configDir` parameter that specifies where
  `playwright.config.ts` is located. This fixes test discovery when the test directory
  (`--test-dir`) is different from the Playwright config directory.

  Previously, Playwright was run from the test directory, which failed to find the config
  file and returned 0 tests, causing fallback to the less accurate regex-based parser.

  Changes:

  - Added `--config-dir` / `-c` flag to `assign` command
  - Added `config-dir` input to the `orchestrate` GitHub Action
  - Updated `discoverTests()` to accept optional `configDir` parameter

## 0.2.2

### Patch Changes

- [#8](https://github.com/NSXBet/playwright-orchestrator/pull/8) [`52c1fb5`](https://github.com/NSXBet/playwright-orchestrator/commit/52c1fb5a8520c3d0aa249e74d877e6d28dcc58e5) Thanks [@gtkatakura](https://github.com/gtkatakura)! - Fix test discovery to use Playwright --list instead of regex parsing

  The `assign` command was always using the fallback regex-based file parser (`discoverTestsFromFiles`) instead of using Playwright's `--list` command (`discoverTests`). This caused:

  - Parameterized tests (using `test.each`, data-driven tests) to not be expanded
  - Tests with template literals in names (e.g., `${variable}`) to appear as single tests
  - Significant undercounting of tests (e.g., 88 discovered vs 177 actual tests)

  Changes:

  - `assign` command now tries `discoverTests()` (Playwright --list) first for accurate test discovery
  - Falls back to `discoverTestsFromFiles()` only if Playwright --list fails
  - Added `--project` flag to filter by Playwright project name
  - Added `--use-fallback` flag to force the old regex-based behavior if needed
  - Updated `orchestrate` action to accept and pass `project` parameter

## 0.2.1

### Patch Changes

- [#6](https://github.com/NSXBet/playwright-orchestrator/pull/6) [`5d3f407`](https://github.com/NSXBet/playwright-orchestrator/commit/5d3f4078f8375a2603071145ae04d81cd6bb3726) Thanks [@gtkatakura](https://github.com/gtkatakura)! - Fix test-level distribution to use --grep patterns instead of raw test IDs

  The get-shard action now accepts a `grep-patterns` input from the orchestrate action.
  When provided, it outputs `--grep="<pattern>"` as test-args instead of space-separated
  test IDs, preventing bash syntax errors from special characters in test names.

## 0.2.0

### Minor Changes

- [#3](https://github.com/NSXBet/playwright-orchestrator/pull/3) [`ee93c37`](https://github.com/NSXBet/playwright-orchestrator/commit/ee93c37be21c6e9a2e10ba4bb9b7e90ea496eff3) Thanks [@gtkatakura](https://github.com/gtkatakura)! - Add external usage support with storage-agnostic GitHub Actions

  - New `setup-orchestrator` action for external repositories
  - Refactored actions to be storage-agnostic (user controls cache/artifacts)
  - Native sharding fallback when orchestrator fails
  - Complete documentation in `docs/external-integration.md`
