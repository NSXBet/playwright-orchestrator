# Change: Adopt Playwright's --test-list for Pre-Execution Test Filtering

## Why

The current test filtering approach uses `test.skip()` at runtime, which leaves skipped tests in Playwright's suite tree. Every reporter (HTML, JSON, blob) sees all tests — including orchestrator-skipped ones — forcing a three-layer workaround stack: fixture for skipping, reporter for JSON cleanup, and `filter-report` for post-merge cleanup. Playwright 1.56+ provides `--test-list`, which removes tests from the suite tree **before execution**, producing natively clean reports with zero workarounds.

With `--test-list`, the entire Playwright runtime integration (fixture, reporter) becomes unnecessary. Playwright's built-in reporters produce correct output natively. The package becomes a pure CLI + GitHub Actions tool with zero runtime footprint in user code.

## What Changes

- **BREAKING**: `get-shard` action outputs a Playwright test-list file instead of a JSON shard file
- **BREAKING**: `ORCHESTRATOR_SHARD_FILE` env var is removed — replaced by `--test-list` CLI flag
- **BREAKING**: Fixture (`withOrchestratorFilter`, `shouldRunTest`) is removed — `src/fixture.ts` deleted
- **BREAKING**: Reporter is removed entirely — `src/reporter.ts` deleted
- **BREAKING**: `filter-report` command and action are removed
- **BREAKING**: `extract-timing --shard-file` flag is removed (reports are natively clean)
- **BREAKING**: `./fixture` and `./reporter` package exports are removed
- **BREAKING**: `@playwright/test` peerDependency is removed (no runtime Playwright integration)
- `assign` command JSON output now includes `testListFiles` with Playwright test-list formatted content per shard (file paths relative to `rootDir`, not `testDir`)
- `buildTestIdFromRuntime` and `filterRuntimeTitlePath` removed (only used by deleted fixture/reporter)
- `ORCHESTRATOR_SHARD_FILE` and `ORCHESTRATOR_DEBUG` env vars are no longer read by any code

## Compatibility

- **Minimum Playwright version**: 1.56+ (introduces `--test-list` CLI flag)
- README and docs must document this requirement prominently

## Impact

- Affected specs: `orchestration`, `external-integration`
- Affected code:
  - `src/fixture.ts` — **deleted**
  - `src/reporter.ts` — **deleted**
  - `src/commands/filter-report.ts` — **deleted**
  - `src/core/test-id.ts` — `buildTestIdFromRuntime`, `filterRuntimeTitlePath` removed; `toTestListFormat`, `toTestListFile` added (path-aware: converts testDir-relative paths to rootDir-relative)
  - `src/core/test-discovery.ts` — `loadTestListFromFile` extended to also return `rootDir` and `testDir` (needed for test-list path conversion); doc comments updated to remove fixture references
  - `src/commands/extract-timing.ts` — `--shard-file` flag removed
  - `src/commands/assign.ts` — outputs `testListFiles` in JSON format (uses rootDir/testDir from discovery to compute path prefix)
  - `.github/actions/orchestrate/action.yml` — outputs `test-list-files` instead of `shard-files`; summary table computes test count from line count (not JSON array length)
  - `.github/actions/get-shard/action.yml` — receives `test-list-files` (JSON of shard → string), writes plain text test-list file (not JSON array), outputs `test-list-file`
  - `.github/actions/extract-timing/action.yml` — `shard-file` input removed (currently `required: true`, so all external workflows referencing it MUST update)
  - `.github/actions/filter-report/` — **deleted**
  - `package.json` — `./fixture`, `./reporter` exports AND `typesVersions` entries removed; `@playwright/test` peerDep and devDep removed
  - `__tests__/filter-report.test.ts` — **deleted**
  - `__tests__/reporter-filter-json.test.ts` — **deleted**
  - `__tests__/reporter.test.ts` — reporter-specific tests removed, test ID format tests kept
  - `__tests__/test-id-consistency.test.ts` — fixture-reporter consistency sections removed
  - `examples/monorepo/apps/web/src/test/e2e/path-consistency.spec.ts` — **deleted** (tests `ORCHESTRATOR_SHARD_FILE`)
  - `.github/workflows/e2e-monorepo.yml` — `shard-files` → `test-list-files`, remove `ORCHESTRATOR_SHARD_FILE` env var, remove filter-report step, update debug steps
  - `.github/workflows/e2e-example.yml` — rewrite from deprecated `grep-pattern` to `--test-list` three-phase workflow
  - `docs/`, `examples/`, `README.md`, `AGENTS.md` — updated
