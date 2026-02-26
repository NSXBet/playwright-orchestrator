## Context

The orchestrator's test filtering currently works at runtime using `test.skip()`, which marks tests as "skipped" but keeps them in Playwright's suite tree. This creates cascading problems:

1. **Fixture** calls `test.skip(true, 'Not in shard')` for every non-shard test
2. **Reporter** hides skipped tests from output and rewrites JSON reports via `filterJson`
3. **filter-report** command cleans merged reports after combining shards

Playwright 1.56+ introduced `--test-list <file>`, which pushes a filter to `preOnlyTestFilters` inside `createRootSuite()`. Tests not matching are removed from `suite._entries` before execution — the same mechanism used by `--shard`. Reports natively contain only tests that ran.

With `--test-list`, the entire runtime integration layer (fixture + reporter) is unnecessary. Playwright's built-in reporters (list, line, dot, html, json, blob) all produce correct output because the suite tree only contains shard tests. The package becomes a pure CLI + GitHub Actions tool.

### Stakeholders

- External users integrating via GitHub Actions workflows
- Internal CI pipeline (e2e-monorepo workflow)

## Goals / Non-Goals

### Goals
- Eliminate the entire runtime integration (fixture, reporter, filter-report)
- Produce clean Playwright reports (HTML, JSON, blob) without any orchestrator code in the reporter chain
- Zero `playwright.config.ts` changes for orchestrator users (no imports, no fixture, no reporter)
- Zero `@playwright/test` dependency from the orchestrator package
- Simplify CI workflows (no `ORCHESTRATOR_SHARD_FILE` env var, no filter-report step)
- Remove all dead code in a single breaking change

### Non-Goals
- Change the distribution algorithm (CKK/LPT, timing, file affinity)
- Change the test ID format internally (`file::describe::title` stays)
- Support Playwright versions older than 1.56

## Decisions

### Decision 1: Use `--test-list` CLI flag (not internal APIs)

Playwright exposes `--test-list` as a documented CLI flag. Internally it uses `preOnlyTestFilters` and `filterTestsRemoveEmptySuites` — the exact same pipeline as `--shard`.

**Alternatives considered:**
- **Manipulate `suite._entries` in reporter's `onBegin`**: Fragile, uses private API, reporter may be called after filtering pipeline.
- **Push to `postShardTestFilters` via plugin API**: Completely undocumented, internal to Playwright, could break at any time.
- **Use `--grep` with complex patterns**: Already rejected in the original design due to substring collisions.

**Rationale:** `--test-list` is the only public, stable mechanism for pre-execution filtering. It's documented, versioned, and uses the same internal pipeline as `--shard`.

**Format details:** The test-list file accepts entries at multiple granularity levels:
- File only: `path/to/file.spec.ts`
- File + suite: `path/to/file.spec.ts › suite name`
- Fully qualified: `path/to/file.spec.ts › suite › test name`
- With project prefix (optional): `[chromium] › path/to/file.spec.ts › suite › test`
- With line/column (optional): `path/to/file.spec.ts:3:9 › suite › test`
- Alternative separator `>` can be used instead of `›`
- Comments (`#`) and blank lines are allowed

We use the `file › suite › test` format WITHOUT project prefix (the orchestrator already uses `--project` for project selection) and WITHOUT line/column numbers (test IDs are matched by title, not location).

### Decision 2: Delete the reporter entirely (not simplify)

The reporter existed solely to work around `test.skip()`:
- `onBegin`: Correct the inflated "Running X tests" count → Playwright does this natively
- `onTestEnd`: Hide skipped tests from output → No skipped tests exist in the suite
- `onEnd`: Print filtered summary → Built-in reporters show correct counts
- `onExit`/`filterJson`: Rewrite JSON report → JSON is natively clean

There is nothing the custom reporter provides that Playwright's built-in reporters don't already do with `--test-list`.

### Decision 3: Path-aware conversion from internal IDs to test-list format

**Critical:** Internal test IDs use file paths relative to `project.testDir` (e.g., `login.spec.ts`), but Playwright's `--test-list` matching resolves paths relative to `config.rootDir` (e.g., `src/test/e2e/login.spec.ts`).

When `testDir === rootDir` (simple projects), there's no difference. But in monorepos where they differ, a naive conversion silently breaks:

```
rootDir:  /project
testDir:  /project/src/test/e2e

Internal test ID:     login.spec.ts::Login::should login        (relative to testDir)
--test-list expects:  src/test/e2e/login.spec.ts › Login › ...  (relative to rootDir)
Naive conversion:     login.spec.ts › Login › ...                (MISMATCH!)
```

**Solution:** The `assign` command already has both `rootDir` and `testDir` from the test-list.json config. It computes the testDir-to-rootDir prefix and prepends it to the file path when generating `testListFiles`. The `toTestListFormat` function takes a `testDirPrefix` parameter (the relative path from rootDir to testDir).

The `get-shard` action then simply writes the pre-formatted `testListFiles` string to a file — no path computation needed in the action.

**Edge case — `testDir === rootDir`:** When they're equal, `path.relative(rootDir, testDir)` returns `""` (empty string). In this case, `toTestListFormat` prepends nothing, and the file path is used as-is. This is the common case for simple projects. The `testDirPrefix` parameter is optional and defaults to `""`.

**Why not change the internal format?** The `::` format with testDir-relative paths is used throughout — timing data, shard assignments, test discovery. Changing it would be a much larger refactoring. The rootDir-relative conversion happens only at the boundary (test-list file output).

### Decision 4: Remove `extract-timing --shard-file` entirely

With `--test-list`, the Playwright JSON report only contains tests that ran in the shard. There are no 0ms orchestrator-skipped entries to filter out. So `extract-timing` extracts timing from ALL tests in the report — no shard file needed.

### Decision 5: Remove `@playwright/test` dependency

With the fixture and reporter deleted, no source file imports from `@playwright/test`. The peerDependency and devDependency can both be removed. Users obviously still have Playwright installed (they're running tests), but the orchestrator has no coupling to it.

### Decision 6: Clean up dead runtime code

`buildTestIdFromRuntime` and `filterRuntimeTitlePath` in `src/core/test-id.ts` were only used by the fixture and reporter. With both deleted, these functions are dead code and should be removed.

### Decision 7: Breaking change, no deprecation

This is a clean break. All old filtering infrastructure is removed:
- `src/fixture.ts` — deleted
- `src/reporter.ts` — deleted
- `src/commands/filter-report.ts` — deleted
- `./fixture` and `./reporter` package exports — removed
- `.github/actions/filter-report/` — deleted
- `ORCHESTRATOR_SHARD_FILE` env var — no longer read
- `@playwright/test` peer/dev dependency — removed

Users upgrading must switch to `--test-list`. This is acceptable because:
- The new approach is strictly simpler (zero config in user code)
- The old approach was always a workaround
- Clean break avoids maintaining two paths

## Risks / Trade-offs

### Risk: Playwright changes --test-list format or removes it
- **Likelihood**: Low — it's a documented CLI feature using the same pipeline as `--shard`
- **Mitigation**: The format is simple text, easy to adapt

### Risk: Edge cases with special characters in test-list format
- **Likelihood**: Medium — test names with `›` or `>` could conflict with delimiters
- **Mitigation**: Playwright's `loadTestList` parser splits on delimiters left-to-right; test title is the last token. Validate with E2E tests covering special characters.

### Risk: `testDir` outside of `rootDir` produces invalid paths
- **Likelihood**: Very low — Playwright resolves `testDir` relative to `rootDir` by default, so it's always a subdirectory
- **Mitigation**: Validate that `path.relative(rootDir, testDir)` does not start with `..`. If it does, log a warning and use the file path as-is (no prefix). This should never happen with standard Playwright configs.

### Trade-off: Users must pass `--test-list` as a CLI argument
- The old approach used an env var (`ORCHESTRATOR_SHARD_FILE`)
- `--test-list` requires modifying the `npx playwright test` command
- This is acceptable because it's the standard Playwright way and simpler overall

### Risk: Minimum Playwright version requirement
- **Likelihood**: Medium — users on older Playwright versions will get CLI errors
- **Impact**: `--test-list` was introduced in Playwright 1.56. Users on older versions will see "Unknown option: --test-list"
- **Mitigation**: Document the minimum version prominently in README. The `get-shard` action's `test-list-file` output makes the requirement clear. No runtime version check is needed — the error from Playwright is self-explanatory.
