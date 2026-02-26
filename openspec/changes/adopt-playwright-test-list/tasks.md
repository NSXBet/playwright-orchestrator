## 1. Core: Test-List Format Conversion (TDD)

- [ ] 1.1 Write tests for `toTestListFormat(testId, testDirPrefix?)` — converts `file::suite::test` to `prefix/file › suite › test`, handling testDir-to-rootDir path prefix for monorepos
- [ ] 1.2 Implement `toTestListFormat` in `src/core/test-id.ts`
- [ ] 1.3 Write tests for `toTestListFile(testIds[], testDirPrefix?)` — produces a full test-list file
- [ ] 1.4 Implement `toTestListFile`

## 2. CLI: Assign Command Test-List Output

- [ ] 2.1 Extend `loadTestListFromFile` to also return `rootDir` and `testDir` from the Playwright JSON config — currently the function calls `parsePlaywrightListOutput` which internally extracts `config.rootDir` and `project.testDir` via `getProjectTestDir`, but returns only `DiscoveredTest[]`. Create a new function (e.g., `loadTestListWithConfig`) that returns `{ tests: DiscoveredTest[], rootDir: string, testDir: string }`, or restructure `parsePlaywrightListOutput` to expose config data
- [ ] 2.2 Add `testListFiles` field to `TestAssignResult` type in `src/core/types.ts` (`testListFiles: Record<number, string>`)
- [ ] 2.3 Compute testDir-to-rootDir prefix (`path.relative(rootDir, testDir)`) in `assign` command
- [ ] 2.4 Populate `testListFiles` in assign JSON output (maps shard index → test-list content string with rootDir-relative paths); also handle the empty-tests early-return path (~line 86–99 of `assign.ts`) which constructs an inline result without `testListFiles` — should output empty strings per shard
- [ ] 2.5 Update assign tests

## 3. CLI: Remove extract-timing --shard-file

- [ ] 3.1 Write test for extract-timing extracting ALL tests from report (no shard-file)
- [ ] 3.2 Remove `--shard-file` flag from `src/commands/extract-timing.ts`
- [ ] 3.3 Remove shard-file filtering logic
- [ ] 3.4 Update existing extract-timing tests

## 4. Remove Dead Code

- [ ] 4.1 Delete `src/fixture.ts`
- [ ] 4.2 Delete `src/reporter.ts`
- [ ] 4.3 Delete `src/commands/filter-report.ts`
- [ ] 4.4 Delete `__tests__/filter-report.test.ts`
- [ ] 4.5 Delete `__tests__/reporter-filter-json.test.ts`
- [ ] 4.6 Remove `./fixture` and `./reporter` from `package.json` `exports` AND `typesVersions` sections (both have fixture/reporter entries)
- [ ] 4.7 Remove `@playwright/test` from peerDependencies and peerDependenciesMeta
- [ ] 4.8 Remove `@playwright/test` from devDependencies (if no other file needs it)
- [ ] 4.9 Delete `.github/actions/filter-report/` action
- [ ] 4.10 Remove `buildTestIdFromRuntime`, `filterRuntimeTitlePath`, and associated types (`FilterTitlePathOptions`, `BuildTestIdFromRuntimeOptions`) from `src/core/test-id.ts`; update module doc comment (currently references "fixture, reporter" and "runtime context" which no longer exist)
- [ ] 4.11 Review `__tests__/reporter.test.ts` — only tests `buildTestId`/`parseTestId` from `types.ts` (no reporter-specific code); rename describe block from "Reporter Test ID Format" to "Test ID Format" or similar
- [ ] 4.12 Clean `__tests__/test-id-consistency.test.ts` — remove "Runtime Title Path Filtering" section (tests `filterRuntimeTitlePath`, `buildTestIdFromRuntime` — both deleted), remove "Fixture-Reporter Consistency" section, remove `buildTestIdFromRuntime`/`filterRuntimeTitlePath` imports; also rename "Simulated Component Consistency" describe blocks that reference "Reporter" (e.g., "Discovery vs Reporter" → "Discovery consistency") since those tests only use `buildTestId` and are still valid
- [ ] 4.13 Update `src/core/test-discovery.ts` doc comments — `parsePlaywrightListOutput` says "to match fixture behavior", `resolveFilePath` says "Fixture (running from subdirectory...)", `getProjectTestDir` says "must match what the fixture uses"; all fixture references should be removed since the fixture no longer exists
- [ ] 4.14 Update `src/core/test-discovery.ts` `discoverTestsFromFiles` — comment says "relative to CWD for consistency with reporter"; update to remove reporter reference

## 5. Actions: Orchestrate

- [ ] 5.1 Update `.github/actions/orchestrate/action.yml` — output `test-list-files` (from `assign`'s `testListFiles`) instead of `shard-files`
- [ ] 5.2 Update fallback to output `test-list-files={}` on failure
- [ ] 5.3 Update summary table — compute test count per shard by counting non-empty lines in each `testListFiles` entry (not by extracting `shards` array lengths); remove any internal reference to old `shard-files` format

## 6. Actions: Get-Shard Test-List Output

- [ ] 6.1 Update `.github/actions/get-shard/action.yml` — receive `test-list-files` input (JSON of shard → string, NOT shard → array), extract shard's test-list string with `jq -r ".\"$SHARD_INDEX\" // \"\""` (note: `-r` for raw string output, not `-c`), write to `.txt` plain text file via `printf '%s' "$CONTENT" > file.txt`
- [ ] 6.2 Output `test-list-file` instead of `shard-file` (note: old output was a JSON array file written with `echo "$TESTS" > file.json`, new output is a plain text file with one test per line — use `printf` not `echo` to avoid trailing newline issues)
- [ ] 6.3 Remove old `shard-file` output; keep `test-count` but compute it by counting non-empty lines in the test-list string (old: `jq 'length'` on array, new: `echo "$CONTENT" | grep -c .` on string); keep `has-tests` based on non-empty content

## 7. Actions: Extract-Timing

- [ ] 7.1 Remove `shard-file` input from `.github/actions/extract-timing/action.yml`
- [ ] 7.2 Remove `--shard-file` from CLI invocation

## 8. Update Examples and E2E Workflows

- [ ] 8.1 Delete `examples/monorepo/apps/web/src/test/e2e/setup.ts` (fixture wrapper)
- [ ] 8.2 Delete `examples/monorepo/apps/web/src/test/e2e/path-consistency.spec.ts` (tests `ORCHESTRATOR_SHARD_FILE`)
- [ ] 8.3 Update `examples/monorepo/apps/web/playwright.config.ts` (remove reporter, filterJson)
- [ ] 8.4 Update monorepo test files to import from `@playwright/test` directly — 8 files import from `./setup.js` or `../../setup.js` (`login`, `home`, `nested`, `parameterized`, `skip-patterns`, `special-chars`, `separator-conflict`, `features/deep/path`); replace with `import { test, expect } from '@playwright/test'` (the 9th file, `path-consistency`, is deleted in task 8.2)
- [ ] 8.5 Update `.github/workflows/e2e-monorepo.yml` — major rewrite:
  - Rename `shard-files` → `test-list-files` (~3 refs), `shard-file` → `test-list-file` (~10 refs)
  - Replace `ORCHESTRATOR_SHARD_FILE` env var with `--test-list` CLI flag in the test run step (~line 229)
  - Remove `ORCHESTRATOR_DEBUG` env var (~line 230)
  - Update debug step (~line 136–147): shard file is now plain text, not JSON — replace `jq -r '.[:5][]'` with `head -5`, remove JSON format analysis
  - Remove `shard-file` input from extract-timing step (~line 301)
  - Remove report filtering validation (~line 386–392) that checks `filterJson` reporter option — no longer relevant
  - Simplify/remove "Validate timing artifact has no orchestrator-skipped tests" step (~line 394–395) — no orchestrator-skipped tests exist with `--test-list`
  - Remove filter-report step (~lines 523–528) and its merged-report validation (~lines 530–555) — merged reports are natively clean
  - Update duplicate entries warning (~line 574–576) that references "Not in shard" annotation
  - Update shard-file validation steps (~lines 370–402) that use `jq` to parse JSON arrays — test-list files are plain text
- [ ] 8.6 Update `examples/external-workflow.yml` — replace `shard-files` → `test-list-files`, `shard-file` → `test-list-file`, `ORCHESTRATOR_SHARD_FILE` → `--test-list`, remove `shard-file` from extract-timing, add missing `project` input to extract-timing
- [ ] 8.7 Delete `examples/basic/playwright-orchestrator-reporter.ts`
- [ ] 8.8 Update `examples/basic/playwright.config.ts` (remove reporter reference)
- [ ] 8.9 Update `examples/monorepo/README.md` (remove fixture/reporter references)
- [ ] 8.10 Update `.github/workflows/e2e-example.yml` — currently uses deprecated `grep-pattern` approach (already removed from orchestrate action per CHANGELOG); rewrite to use three-phase workflow with orchestrate → get-shard → `--test-list` flag, remove extract-timing `level` input (doesn't exist anymore), update to match e2e-monorepo pattern

## 9. Documentation

- [ ] 9.1 Update `README.md` — document Playwright 1.56+ requirement, replace fixture/reporter setup with `--test-list` usage, update workflow examples
- [ ] 9.2 Update `docs/external-integration.md` (~565 lines, heavy rewrite):
  - [ ] 9.2.1 Update three-phase workflow example (lines ~43–203) — replace `shard-files` → `test-list-files`, `shard-file` → `test-list-file`, remove `ORCHESTRATOR_SHARD_FILE` env var, use `--test-list` CLI flag, remove `shard-file` from extract-timing
  - [ ] 9.2.2 Remove reporter setup section (lines ~205–218) — reporter no longer exists
  - [ ] 9.2.3 Update monorepo section (lines ~220–248) — remove reporter/fixture references, show `--test-list` usage
  - [ ] 9.2.4 Update local development section (lines ~257–302) — remove `ORCHESTRATOR_SHARD_FILE` env var examples, update troubleshooting
  - [ ] 9.2.5 Update action reference tables (lines ~304–389) — remove filter-report action entry, remove `shard-file` from extract-timing inputs, rename get-shard outputs, rename orchestrate outputs
- [ ] 9.3 Delete `docs/test-level-reporter.md` (documents fixture + reporter approach)
- [ ] 9.4 Update `AGENTS.md` (root, not openspec/) — heavy rewrite needed:
  - Remove reporter config example and `filterJson` option docs (~lines 184–206)
  - Remove monorepo fixture path resolution section (~line 210)
  - Update action reference table entries: `get-shard` description, `extract-timing` description (~line 425–427)
  - Replace `ORCHESTRATOR_SHARD_FILE` workflow example (~lines 450–462) with `--test-list` usage

## 10. Changeset

- [ ] 10.1 Create changeset with `bunx changeset add --empty`, set to major (breaking change)

## 11. Verify

- [ ] 11.1 Run `make lint && make typecheck && make test`
