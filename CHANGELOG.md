# @nsxbet/playwright-orchestrator

## 0.6.3

### Patch Changes

- [#31](https://github.com/NSXBet/playwright-orchestrator/pull/31) [`dd56807`](https://github.com/NSXBet/playwright-orchestrator/commit/dd5680714517d6b75d5b588a51660e0aac9e1188) Thanks [@gtkatakura](https://github.com/gtkatakura)! - fix: resolve test ID path mismatch (rootDir vs testDir)

  All components now consistently use `project.testDir` as the single source of truth for path resolution:

  - `test-discovery.ts`: Uses `project.testDir` from JSON config (no fallback to `config.rootDir`)
  - `fixture.ts`: Validates `testInfo.project.testDir` is defined
  - `reporter.ts`: Requires `project.testDir` (no fallback chain)
  - `extract-timing.ts`: Throws error if `testDir` not found in report
  - `test-id.ts`: `baseDir` is now required (no `process.cwd()` fallback)

  This prevents silent test ID mismatches in monorepo setups where `testDir` is a subdirectory of `rootDir`.

## 0.6.2

### Patch Changes

- [#29](https://github.com/NSXBet/playwright-orchestrator/pull/29) [`8919b03`](https://github.com/NSXBet/playwright-orchestrator/commit/8919b03b81a45f1334ddb4c822a515c274384753) Thanks [@gtkatakura](https://github.com/gtkatakura)! - Fix test ID path mismatch in monorepo setups

  When the orchestrator runs from a monorepo root but tests run from a subdirectory, the test IDs would not match because both used `process.cwd()` to generate relative paths:

  - Orchestrator (CWD: repo root): `apps/bet-client/src/test/e2e/login.spec.ts::...`
  - Fixture (CWD: `apps/bet-client/`): `src/test/e2e/login.spec.ts::...`

  This caused all tests to be skipped because no IDs matched the shard file.

  **Fix:** The test discovery now generates paths relative to Playwright's `rootDir` (from the test-list.json config), not relative to `process.cwd()`. This ensures consistent test IDs regardless of where the orchestrator runs from.

  **Before:** All tests skipped (path mismatch)
  **After:** Correct sharding - both orchestrator and fixture generate identical test IDs like `src/test/e2e/login.spec.ts::...`

## 0.6.1

### Patch Changes

- [`b5f5621`](https://github.com/NSXBet/playwright-orchestrator/commit/b5f5621fbe9e50bf125121da8ecc79cb9a0caa4f) Thanks [@gtkatakura](https://github.com/gtkatakura)! - Add typesVersions for TypeScript moduleResolution compatibility

  Projects using `moduleResolution: "node"` in their tsconfig.json couldn't resolve
  types for subpath imports like `@nsxbet/playwright-orchestrator/fixture`.

  Added `typesVersions` field to package.json as a fallback for older TypeScript
  configurations that don't support the `exports` field for type resolution.

  This fixes the error:

  ```
  Cannot find module '@nsxbet/playwright-orchestrator/fixture' or its corresponding type declarations.
  ```

## 0.6.0

### Minor Changes

- [#26](https://github.com/NSXBet/playwright-orchestrator/pull/26) [`f45c3c4`](https://github.com/NSXBet/playwright-orchestrator/commit/f45c3c45bf68a9ac5f8d3cbb44759ff83a095979) Thanks [@gtkatakura](https://github.com/gtkatakura)! - Add fixture-based test filtering for proper test skipping

  The reporter-based approach only added metadata but didn't actually skip tests.
  This adds a new fixture module that uses `test.skip()` to properly skip tests
  not in the current shard.

  ### New Features

  - **Fixture module** (`@nsxbet/playwright-orchestrator/fixture`):
    - `setupOrchestratorFilter(test)` - Sets up beforeEach hook for automatic filtering
    - `shouldRunTest(testInfo)` - Manual check if a test should run

  ### Usage

  ```typescript
  // In your test utils or setup file
  import { test } from "@playwright/test";
  import { setupOrchestratorFilter } from "@nsxbet/playwright-orchestrator/fixture";

  setupOrchestratorFilter(test);
  ```

  ### Bug Fixes

  - Fixed reporter test ID generation to exclude project name and filename from titlePath
  - Reporter now correctly builds test IDs matching the orchestrator format

## 0.5.3

### Patch Changes

- [#24](https://github.com/NSXBet/playwright-orchestrator/pull/24) [`5f59ef5`](https://github.com/NSXBet/playwright-orchestrator/commit/5f59ef587d119aa63d9e39cc340005ff9e5c0d53) Thanks [@gtkatakura](https://github.com/gtkatakura)! - Fix reporter test ID matching to exclude project name and filename from titlePath

  The reporter's `buildTestId` was incorrectly including the project name and filename from `titlePath()`, causing test IDs to mismatch between orchestrator and reporter.

  Before: `src/test/e2e/account.spec.ts::Mobile Chrome::account.spec.ts::Describe::test`
  After: `src/test/e2e/account.spec.ts::Describe::test`

  This ensures tests are correctly filtered during shard execution.

## 0.5.2

### Patch Changes

- [#22](https://github.com/NSXBet/playwright-orchestrator/pull/22) [`8c1f0c1`](https://github.com/NSXBet/playwright-orchestrator/commit/8c1f0c177627a350e3e75974231fb5d2b4fd85bb) Thanks [@gtkatakura](https://github.com/gtkatakura)! - Fix test ID path resolution to match reporter format

  The orchestrator was generating test IDs with incorrect file paths and duplicated filenames:

  - File paths were just filenames instead of relative paths from CWD
  - Root suite title (filename) was included in titlePath, causing duplication

  Fixed by:

  - Using `config.rootDir` from Playwright JSON to resolve relative file paths
  - Skipping root suite title from titlePath (it's the filename, redundant with file)

  Before: `account.spec.ts::account.spec.ts::Describe::test`
  After: `src/test/e2e/account.spec.ts::Describe::test`

  This ensures test IDs match between orchestrator (discovery) and reporter (runtime filtering).

## 0.5.1

### Patch Changes

- [#20](https://github.com/NSXBet/playwright-orchestrator/pull/20) [`cb3f710`](https://github.com/NSXBet/playwright-orchestrator/commit/cb3f710e4ac606ca573ce83c083e209eddeb09cd) Thanks [@gtkatakura](https://github.com/gtkatakura)! - Add CommonJS require exports for Playwright compatibility

  Playwright uses CommonJS require() to load custom reporters. The package was ESM-only
  with only `import` conditions in exports, causing "Package subpath './reporter' is not
  defined by exports" errors when used as a reporter.

  Added `require` conditions to both main and reporter exports for compatibility.

## 0.5.0

### Minor Changes

- [#18](https://github.com/NSXBet/playwright-orchestrator/pull/18) [`118f16d`](https://github.com/NSXBet/playwright-orchestrator/commit/118f16de276f7b00db07e082a746d3ff56b2dcbe) Thanks [@gtkatakura](https://github.com/gtkatakura)! - Remove backward compatibility with legacy models and add reporter as package export

  ### New Features

  - **Reporter as package export**: Import the reporter directly without copying files:
    ```typescript
    reporter: [["@nsxbet/playwright-orchestrator/reporter"], ["html"]];
    ```

  ### Breaking Changes

  - **Timing Data V1 no longer supported**: Only V2 (test-level) format is accepted. V1 files will be treated as empty data.
  - **Grep patterns removed**: The `--grep` based filtering is removed in favor of reporter-based filtering.
  - **File:line locations removed**: The `buildTestLocation()` function and related outputs are removed.
  - **Actions outputs changed**:
    - `orchestrate`: Removed `grep-patterns`, `test-locations` outputs
    - `get-shard`: Removed `test-args`, `grep-file` outputs; use `shard-file` instead

  ### Migration

  1. Add the reporter to your `playwright.config.ts`:

     ```typescript
     reporter: [["@nsxbet/playwright-orchestrator/reporter"], ["html"]];
     ```

  2. Update workflows to use `shard-file` output:

     ```yaml
     - run: npx playwright test
       env:
         ORCHESTRATOR_SHARD_FILE: ${{ steps.shard.outputs.shard-file }}
     ```

  3. Delete any V1 timing cache files and let them regenerate

## 0.4.1

### Patch Changes

- [`3b3b6a0`](https://github.com/NSXBet/playwright-orchestrator/commit/3b3b6a0546ab4a7824b7bb3a787e98effd670662) Thanks [@gtkatakura](https://github.com/gtkatakura)! - Fix grep patterns to use full title path for exact test matching

  - Use full title path (e.g., "describe › test title") instead of just test title
  - This fixes duplicate test matching for tests with the same name in different describe blocks
  - get-shard action now prefers grep patterns over file:line locations (file:line doesn't work reliably for parameterized tests)

## 0.4.0

### Minor Changes

- [`ba05fe7`](https://github.com/NSXBet/playwright-orchestrator/commit/ba05fe7f2494eb0dbe278ba110bfc830a9074aa1) Thanks [@gtkatakura](https://github.com/gtkatakura)! - Add test locations output for exact test filtering

  - Add `line` and `column` fields to `DiscoveredTest` interface
  - Extract line/column from Playwright JSON output
  - Add `testLocations` output (file:line format) to assign command
  - Add `test-locations` output to orchestrate action
  - Update get-shard action to prefer test-locations over grep-patterns

  This enables exact test filtering using Playwright's native `file:line` syntax,
  which guarantees 100% accurate test matching without duplicates.

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
