# Test-Level Distribution with Custom Reporter

Reliable test-level distribution using a Playwright Reporter for exact test filtering.

## Quick Start

```typescript
// playwright.config.ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  reporter: [
    ["@nsxbet/playwright-orchestrator/reporter"],
    ["json", { outputFile: "results.json" }],
  ],
});
```

```bash
# Test locally (test ID includes relative path from project root)
echo '["e2e/login.spec.ts::Login::should login"]' > shard.json
ORCHESTRATOR_SHARD_FILE=shard.json npx playwright test
```

## Reporter Output

The orchestrator reporter provides clean, list-style output showing only tests assigned to the current shard:

**Default output:**
```
Running 25 tests using 2 workers

  ✓ login.spec.ts > Login > should login (150ms)
  ✓ login.spec.ts > Login > should logout (120ms)
  ✓ home.spec.ts > Home > should render (200ms)
  ...

  25 passed (30.5s)
```

**With `ORCHESTRATOR_DEBUG=1`:**
```
Running 25 tests using 2 workers (24 filtered by orchestrator)

  ○ other.spec.ts > Other > filtered test
  ✓ login.spec.ts > Login > should login (150ms)
  ○ another.spec.ts > Another > filtered test
  ✓ home.spec.ts > Home > should render (200ms)
  ...

  25 passed (30.5s)
```

**Key features:**
- "Running X tests" shows only shard tests (not total)
- Filtered tests are hidden by default (no noise)
- Debug mode shows filtered tests with `○` marker
- Summary shows only shard test counts

## Why This Approach

Previous approaches using `--grep` or `file:line` failed because:

| Approach | Problem |
|----------|---------|
| `--grep` pattern | Substring collision: `"login"` matches `"login with SSO"` |
| `file:line` | Breaks `test.each()` parameterized tests |
| CLI arguments | Bash syntax errors with `()`, `|`, `$` in test names |

The **Custom Reporter** solution:
- Passes test IDs via **JSON file** (no shell escaping)
- Filters at runtime using **`Set.has()`** (exact matching)
- Works with all test types including parameterized tests

## How It Works

```
Orchestrator → JSON file → Reporter → Playwright
     ↓              ↓           ↓
  Distributes   test-ids     Filters via
    tests       per shard    Set.has()
```

1. Orchestrator assigns tests to shards, outputs JSON file per shard
2. Reporter reads JSON file via `ORCHESTRATOR_SHARD_FILE` env var
3. For each test, Reporter checks `allowedTestIds.has(testId)`
4. Tests not in the set get `{ type: "skip" }` annotation
5. Playwright skips annotated tests

## Reporter Implementation

The reporter is included in the package and provides list-style output:

```typescript
// playwright.config.ts
reporter: [
  ["@nsxbet/playwright-orchestrator/reporter"],
  ["json", { outputFile: "results.json" }],
]
```

The reporter:
1. Reads test IDs from JSON file via `ORCHESTRATOR_SHARD_FILE` env var
2. Uses `Set.has()` for exact matching (no substring collisions)
3. Prints clean output showing only shard tests
4. Provides accurate test counts ("Running X tests" = shard tests only)

**Note:** The orchestrator reporter replaces the need for Playwright's `list` reporter. Do not use both together as it will produce duplicate output.

See [src/reporter.ts](../src/reporter.ts) for the full implementation.

## Configuration

```typescript
// playwright.config.ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  reporter: process.env.CI
    ? [
        ["@nsxbet/playwright-orchestrator/reporter"],
        ["json", { outputFile: "results.json" }],
      ]
    : [["list"]],  // Use standard list reporter for local dev
});
```

**Environment Variables:**
- `ORCHESTRATOR_SHARD_FILE`: Path to JSON file with test IDs for this shard
- `ORCHESTRATOR_DEBUG`: Set to "1" to show filtered tests in output

## GitHub Actions Workflow

```yaml
jobs:
  orchestrate:
    runs-on: ubuntu-24.04
    outputs:
      shard-files: ${{ steps.orchestrate.outputs.shard-files }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - uses: NSXBet/playwright-orchestrator/.github/actions/setup-orchestrator@v0
      
      - uses: actions/cache/restore@v4
        with:
          path: timing-data.json
          key: playwright-timing-${{ github.ref_name }}
      
      # IMPORTANT: In monorepos, use working-directory to run from the same
      # directory where tests will execute (ensures consistent path resolution)
      - name: Generate test list
        run: |
          npx playwright test --list --reporter=json > test-list.json
          if [ ! -s test-list.json ]; then
            echo "Error: test-list.json is empty or was not created"
            exit 1
          fi
      
      - uses: NSXBet/playwright-orchestrator/.github/actions/orchestrate@v0
        id: orchestrate
        with:
          test-list: test-list.json
          timing-file: timing-data.json
          shards: 4
          level: test

  e2e:
    needs: [orchestrate]
    strategy:
      matrix:
        shard: [1, 2, 3, 4]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci && npx playwright install --with-deps

      - uses: NSXBet/playwright-orchestrator/.github/actions/get-shard@v0
        id: shard
        with:
          shard-files: ${{ needs.orchestrate.outputs.shard-files }}
          shard-index: ${{ matrix.shard }}
          shards: 4

      - run: npx playwright test
        env:
          ORCHESTRATOR_SHARD_FILE: ${{ steps.shard.outputs.shard-file }}
```

## JSON File Format

The shard file is a simple array of test IDs:

```json
[
  "e2e/login.spec.ts::Login::should login",
  "e2e/login.spec.ts::Login::should logout",
  "e2e/home.spec.ts::Home::should render"
]
```

Test ID format: `{relative-path}::{describe}::{test-title}`

Where `{relative-path}` is the file path relative to the current working directory (CWD) with forward slashes. Examples:
- `e2e/login.spec.ts::Login::should login`
- `tests/e2e/features/auth/login.spec.ts::Auth::should authenticate`

## Validation

Essential test to verify exact matching works:

```typescript
import { describe, test, expect } from "bun:test";

describe("Exact Matching", () => {
  test("should NOT collide on substrings", () => {
    const shard = new Set(["login.spec.ts::Login::should login"]);
    
    expect(shard.has("login.spec.ts::Login::should login")).toBe(true);
    expect(shard.has("login.spec.ts::Login::should login with SSO")).toBe(false);
  });

  test("should handle special characters", () => {
    const testId = "e2e/test.spec.ts::Suite::should show error (500)";
    const shard = new Set([testId]);
    expect(shard.has(testId)).toBe(true);
  });
});
```

## Troubleshooting

### Tests not being filtered

Enable debug mode:
```bash
ORCHESTRATOR_DEBUG=1 ORCHESTRATOR_SHARD_FILE=shard.json npx playwright test
```

### Test ID mismatch

The ID generated by orchestrator must match the reporter's format exactly:
```
{relative-file}::{describe}::{test-title}
```

Common issues:
- Path prefix difference: `e2e/login.spec.ts` vs `./e2e/login.spec.ts`
- Case sensitivity: `Login` vs `login`

### Shard file not found

```bash
ls -la $ORCHESTRATOR_SHARD_FILE
cat $ORCHESTRATOR_SHARD_FILE | jq .
```

## FAQ

**Q: What if shard file doesn't exist?**
A: Reporter runs all tests (graceful fallback).

**Q: Performance impact?**
A: `Set.has()` is O(1). Overhead < 1ms for 10k tests.

**Q: Minimum Playwright version?**
A: 1.20+ (when `test.annotations` was stabilized).

## Edge Cases & Behavior

This section documents what happens in various edge cases.

### Test Lifecycle Changes

| Scenario | Discovery | Timing | Result |
|----------|-----------|--------|--------|
| **New test added** | ✅ Discovered | Estimated 30s | Runs, timing collected after |
| **Test renamed** | ✅ New ID discovered | Old ID orphaned | Runs with estimated timing |
| **Test deleted** | Not discovered | Data orphaned | Pruned after 30 days |
| **File moved** | ✅ New path = new ID | Old ID orphaned | Same as renamed |
| **Describe renamed** | ✅ New title path | Old ID orphaned | Same as renamed |

**Key insight**: The orchestrator always discovers the **current** state of tests, not historical. New/renamed tests are always included.

### Shard File Edge Cases

| Scenario | Behavior |
|----------|----------|
| **File missing** | ✅ Graceful fallback - ALL tests run |
| **Empty array `[]`** | ⚠️ ALL tests skipped (nothing allowed) |
| **Invalid JSON** | ❌ Reporter throws, test run fails |
| **Wrong format (object)** | ❌ Unexpected behavior |
| **Duplicate IDs** | ✅ Set deduplicates, no issue |
| **Stale ID (test deleted)** | ✅ ID unused, no effect |

### Playwright Features

| Feature | Behavior |
|---------|----------|
| **`test.skip()`** | Test skipped (either skip applies) |
| **`test.only()`** | ⚠️ Playwright focuses, reporter still filters |
| **`test.fixme()`** | Test skipped by Playwright |
| **`test.skip(condition)`** | Reporter annotation checked first |
| **`retries: N`** | Each retry triggers `onTestBegin`, annotation reapplied |
| **`workers: N`** | Each worker has reporter instance, reads same file |
| **`beforeAll/afterAll`** | ✅ Not affected, run normally |
| **Custom fixtures** | ✅ Not affected |

### Timing & Performance

| Scenario | Behavior |
|----------|----------|
| **Very slow test (10+ min)** | If timing known, balanced; if new, causes imbalance first run |
| **Very fast test (0ms)** | May group many together |
| **100+ tests** | CKK may timeout → LPT fallback |
| **More shards than tests** | Some shards get 0 tests |
| **Single test** | Assigned to shard 1 |
| **Test timeout** | Test fails, timing collected |
| **Test crash** | Test fails, timing may be incomplete |

### CI/CD Scenarios

| Scenario | Behavior |
|----------|----------|
| **Job cancelled** | Timing not collected for incomplete tests |
| **Concurrent PRs** | Each gets own assignments, no conflict |
| **Timing from other branch** | Works if IDs match, new tests estimated |
| **Cache miss** | All tests estimated 30s |
| **Stale cache (30+ days)** | Old IDs pruned, re-estimated |

### Multiple Playwright Projects

When using multiple projects (chromium, firefox, webkit):

```typescript
// playwright.config.ts
projects: [
  { name: 'chromium', use: { browserName: 'chromium' } },
  { name: 'firefox', use: { browserName: 'firefox' } },
]
```

⚠️ **Current limitation**: Same test ID for all projects. The orchestrator assigns tests without project awareness.

**Workaround**: Use `--project` flag to run one project per workflow, or accept that same tests run on same shard across browsers.

### Special Test Names

| Scenario | Behavior |
|----------|----------|
| **Unicode/Emojis** | ✅ Works, JSON handles unicode |
| **Very long title (1000+ chars)** | ✅ Works, no limit |
| **Newlines in title** | ⚠️ Included in ID, may cause display issues |
| **Empty title `test('')`** | ✅ Valid ID with empty segment |
| **Deep nesting (10+ describes)** | ✅ Long ID with many `::` |

### Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         ORCHESTRATION PHASE                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Codebase (current)              Timing Cache (historical)               │
│  ─────────────────              ────────────────────────                 │
│  test-a (exists)          ───►  test-a: 5000ms    ✅ Match               │
│  test-b (exists)          ───►  test-b: 3000ms    ✅ Match               │
│  test-c (NEW)             ───►  (not found)       📊 Estimate 30s        │
│  (test-d deleted)         ◄───  test-d: 2000ms    🗑️ Orphaned            │
│                                                                          │
│  Result: [test-a, test-b, test-c] assigned to shards                     │
│                                                                          │
├─────────────────────────────────────────────────────────────────────────┤
│                           RUNTIME PHASE                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Shard File                      Playwright Tests                        │
│  ──────────                     ────────────────                         │
│  ["test-a", "test-c"]    ───►   test-a    ✅ In set → RUN                │
│                          ───►   test-b    ❌ Not in set → SKIP           │
│                          ───►   test-c    ✅ In set → RUN                │
│                          ───►   test-e    ❌ Not in set → SKIP           │
│                                 (new test added between phases)          │
│                                                                          │
├─────────────────────────────────────────────────────────────────────────┤
│                         POST-RUN PHASE                                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Timing Extraction               Timing Merge                            │
│  ────────────────               ────────────                             │
│  test-a: 4800ms          ───►   EMA(5000, 4800) = 4940ms                 │
│  test-c: 1500ms          ───►   New entry: 1500ms                        │
│  (test-d not seen)       ───►   Pruned after 30 days                     │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Race Condition: Test Added Between Phases

**Scenario**: Developer adds `test-e` after orchestration but before test run.

```
1. Orchestrate: discovers [test-a, test-b, test-c]
2. Developer pushes: adds test-e
3. Test run: Playwright sees [test-a, test-b, test-c, test-e]
4. Reporter: test-e not in shard file → SKIPPED
```

**Result**: New test `test-e` is skipped on this run. It will be discovered and run on the next CI run.

**Mitigation**: This is rare and self-correcting. The next run will include the test.

### Test Structure Edge Cases

| Scenario | Test ID | Behavior |
|----------|---------|----------|
| **Root-level test (no describe)** | `file.spec.ts::should work` | ✅ Works |
| **Same test name, different describes** | `file.spec.ts::A::test` vs `file.spec.ts::B::test` | ✅ Different IDs |
| **Nested describes (same name)** | `file.spec.ts::A::A::test` | ✅ Full path in ID |
| **Empty describe name** | `file.spec.ts::::test` | ⚠️ Double `::` in ID |
| **test.step() inside test** | Not in ID | ✅ Steps not tracked |
| **test.describe.serial()** | Same as regular | ✅ Works |
| **test.describe.parallel()** | Same as regular | ✅ Works |
| **test.describe.configure()** | Same as regular | ✅ Works |

### Dynamic Test Generation

```typescript
// Tests generated at runtime
const testCases = ['a', 'b', 'c'];
for (const tc of testCases) {
  test(`dynamic test ${tc}`, async () => {});
}
```

| Phase | Behavior |
|-------|----------|
| Discovery (`--list`) | ✅ All 3 tests discovered |
| Shard assignment | ✅ Each gets unique ID |
| Reporter filtering | ✅ Exact match works |

**Note**: Different from `test.each()` - these are separate test definitions.

### Timing Data Edge Cases

| Scenario | Behavior |
|----------|----------|
| **v1 timing with test-level distribution** | ⚠️ Warning logged, all tests estimated |
| **Corrupted timing JSON** | ❌ Parse error, uses empty data |
| **Timing file locked** | ❌ Read error, uses empty data |
| **Duration = 0** | ✅ Valid, test grouped with others |
| **Duration = NaN** | ⚠️ May cause sorting issues |
| **Duration very large (overflow)** | ⚠️ May cause imbalance |
| **Negative duration** | ⚠️ Algorithm may behave unexpectedly |

### Sharding Algorithm Edge Cases

| Scenario | Behavior |
|----------|----------|
| **All tests same duration** | ✅ Even distribution |
| **1 test = 10min, 100 tests = 1s each** | ⚠️ One shard gets 10min test alone |
| **CKK timeout (5s default)** | ✅ Falls back to LPT |
| **Shard count = 0** | ❌ Error thrown |
| **Shard count negative** | ❌ Error thrown |
| **More shards than tests** | ✅ Some shards empty, fallback to native |

### Global Setup/Teardown

```typescript
// playwright.config.ts
export default defineConfig({
  globalSetup: './global-setup.ts',
  globalTeardown: './global-teardown.ts',
});
```

| Hook | Behavior |
|------|----------|
| **globalSetup** | ✅ Runs once before all workers, not affected |
| **globalTeardown** | ✅ Runs once after all workers, not affected |
| **beforeAll (in test file)** | ✅ Runs per worker, not affected by reporter |
| **afterAll (in test file)** | ✅ Runs per worker, not affected |

### Storage State & Authentication

```typescript
// Authenticated test
test.use({ storageState: 'auth.json' });
test('logged in test', async ({ page }) => {});
```

| Scenario | Behavior |
|----------|----------|
| **Storage state per test** | ✅ Works, reporter just filters |
| **Storage state per project** | ✅ Works |
| **Auth depends on skipped test** | ⚠️ May cause issues if auth test skipped |

### File System Edge Cases

| Scenario | Behavior |
|----------|----------|
| **Symlinked test file** | ⚠️ Path resolution may differ |
| **Test file outside testDir** | ❌ Not discovered |
| **Disk full (can't write shard file)** | ❌ Action fails |
| **Permission denied (can't read)** | ❌ Reporter throws |
| **File deleted mid-run** | ✅ Already loaded in memory |
| **BOM in shard file** | ⚠️ JSON.parse may fail |
| **CRLF line endings** | ✅ JSON handles |

### CI Environment Edge Cases

| Scenario | Behavior |
|----------|----------|
| **Self-hosted runner** | ✅ Works if Node.js available |
| **Docker container** | ✅ Works, paths relative to container |
| **Shallow clone** | ✅ Works, doesn't need git history |
| **Fork PR (no secrets)** | ⚠️ Cache may not restore |
| **Manual trigger (workflow_dispatch)** | ✅ Works |
| **Scheduled run (cron)** | ✅ Works, uses default branch timing |
| **Rerun failed tests only** | ⚠️ Must re-orchestrate or use native sharding |

### Working Directory Edge Cases

| Scenario | Behavior |
|----------|----------|
| **Monorepo (tests in subdirectory)** | ✅ Works with correct testDir |
| **CWD changes during test** | ⚠️ Relative paths may break |
| **Absolute paths in shard file** | ⚠️ Won't match relative paths in reporter |
| **Windows backslashes** | ✅ Reporter normalizes to `/` |

### Encoding Edge Cases

| Scenario | Behavior |
|----------|----------|
| **UTF-8 test names** | ✅ Works (日本語, émoji, etc.) |
| **UTF-8 BOM in JSON** | ⚠️ May cause parse issues |
| **Non-UTF8 file** | ⚠️ JSON.parse may fail |
| **Null bytes in test name** | ⚠️ May cause issues |

### Playwright Configuration Edge Cases

| Config | Behavior |
|--------|----------|
| **Multiple testDir** | ⚠️ Not supported in single config |
| **testMatch patterns** | ✅ Discovery respects patterns |
| **testIgnore patterns** | ✅ Discovery respects patterns |
| **grep/grepInvert in config** | ⚠️ May conflict with reporter |
| **Timeout per test** | ✅ Not affected |
| **Expect timeout** | ✅ Not affected |

### Reporter Interaction Edge Cases

| Scenario | Behavior |
|----------|----------|
| **Multiple reporters** | ✅ Each reporter independent |
| **Reporter throws in onBegin** | ❌ Test run fails |
| **Reporter throws in onTestBegin** | ❌ Test fails |
| **Async operations in reporter** | ⚠️ onTestBegin is sync |
| **Reporter modifies test object** | ✅ Annotations persist |

### Retry & Flaky Test Edge Cases

| Scenario | Behavior |
|----------|----------|
| **Test fails, retries** | ✅ Each retry goes through onTestBegin |
| **Flaky test (passes on retry)** | ✅ Timing collected from successful run |
| **Always failing test** | ✅ Still filtered correctly |
| **Retry with different worker** | ✅ New worker loads shard file |

### Memory & Performance Edge Cases

| Scenario | Behavior |
|----------|----------|
| **10,000+ tests** | ✅ Set.has() is O(1), no issue |
| **100MB shard file** | ⚠️ Memory usage during parse |
| **Slow file system** | ⚠️ Delay on file read |
| **Many workers (50+)** | ✅ Each reads file independently |

### Annotation Edge Cases

The reporter uses `test.annotations.push({ type: 'skip' })`. What happens with other annotations?

| Scenario | Behavior |
|----------|----------|
| **Test already has `skip` annotation** | ✅ Both annotations present, test skipped |
| **Test has `fixme` annotation** | ✅ Both present, fixme takes precedence |
| **Test has `fail` annotation** | ✅ Both present, fail may override |
| **Test has `slow` annotation** | ✅ Both present, slow for timeout only |
| **Custom annotation `@tag`** | ✅ Independent, both work |
| **Annotation array frozen** | ❌ Push throws TypeError |

### Test Title Edge Cases (Obscure)

| Title | Test ID | Behavior |
|-------|---------|----------|
| `'   '` (whitespace only) | `file.spec.ts::Suite::   ` | ✅ Valid but confusing |
| `'\t\t'` (tabs) | `file.spec.ts::Suite::\t\t` | ✅ Valid |
| `'a::b'` (contains separator) | `file.spec.ts::Suite::a::b` | ⚠️ Ambiguous parse |
| `'a/b/c'` (looks like path) | `file.spec.ts::Suite::a/b/c` | ✅ Valid |
| `'"quoted"'` | `file.spec.ts::Suite::"quoted"` | ✅ JSON escapes |
| `'line1\nline2'` (newline) | Contains `\n` | ⚠️ Display issues |
| `''` (empty string) | `file.spec.ts::Suite::` | ✅ Valid |

### File Path Edge Cases (Obscure)

| Path | Behavior |
|------|----------|
| `tests/my tests/login.spec.ts` (spaces) | ✅ Works |
| `tests/tëst/日本語.spec.ts` (unicode) | ✅ Works |
| `tests/v2.0.0/test.spec.ts` (dots) | ✅ Works |
| `tests/../other/test.spec.ts` (parent) | ⚠️ Path normalization varies |
| 260+ char path (Windows limit) | ❌ May fail on Windows |
| Case difference `Tests/` vs `tests/` | ⚠️ OS-dependent matching |

### Reporter Lifecycle Edge Cases

| Scenario | Behavior |
|----------|----------|
| **onBegin with empty suite** | ✅ allowedTestIds loaded, no tests to filter |
| **onTestBegin never called** | ✅ No action needed |
| **Test filtered before reporter** | ✅ onTestBegin not called for that test |
| **Multiple onTestBegin (retry)** | ✅ Annotation added each time |
| **Other reporter modifies test** | ⚠️ Order-dependent, may conflict |

### Process Signal Edge Cases

| Signal | Behavior |
|--------|----------|
| **SIGTERM (graceful)** | ⚠️ May interrupt mid-test, partial timing |
| **SIGKILL (force)** | ❌ No cleanup, no timing data |
| **SIGINT (Ctrl+C)** | ⚠️ May trigger afterAll, depends on timing |
| **Process.exit(1) in test** | ❌ Hard exit, no cleanup |
| **Unhandled rejection** | ⚠️ May crash worker |

### Playwright Version Edge Cases

| Version | Behavior |
|---------|----------|
| **< 1.20** | ⚠️ `test.annotations` may not work |
| **1.20 - 1.30** | ✅ Stable annotations API |
| **> 1.30** | ✅ Should work (backwards compatible) |
| **Canary/Next** | ⚠️ API may change |
| **Mixed versions (monorepo)** | ⚠️ Behavior may vary |

### GitHub Actions Output Edge Cases

| Scenario | Behavior |
|----------|----------|
| **Output > 1MB** | ⚠️ May be truncated |
| **JSON with special chars** | ✅ Properly escaped |
| **Unicode in output** | ✅ UTF-8 encoded |
| **needs context null** | ❌ Orchestrate job failed |
| **Matrix expansion large** | ⚠️ Many jobs spawned |

### Cache Edge Cases

| Scenario | Behavior |
|----------|----------|
| **Cache key collision** | ⚠️ May restore wrong data |
| **Concurrent cache writes** | ⚠️ Last write wins |
| **Cache restore partial** | ⚠️ Corrupted data possible |
| **Cache expired** | ✅ Uses empty timing data |
| **Cache service down** | ✅ Continues with estimates |

### Concurrent Execution Edge Cases

| Scenario | Behavior |
|----------|----------|
| **Same file read by 50 workers** | ✅ Read-only, no conflict |
| **Timing file written by 2 jobs** | ⚠️ Race condition, data loss |
| **Shard file modified mid-run** | ✅ Already loaded in memory |
| **Two PRs merge simultaneously** | ⚠️ Cache may be stale |

### Floating Point Edge Cases

| Scenario | Behavior |
|----------|----------|
| **Duration = 0.1 + 0.2** | ⚠️ May not equal 0.3 exactly |
| **EMA with very small alpha** | ⚠️ Slow convergence |
| **Sum overflow** | ⚠️ Infinity, algorithm breaks |
| **Duration = Infinity** | ❌ Sorting/comparison fails |
| **Duration = -Infinity** | ❌ Unexpected sorting |

### Test Artifacts Edge Cases

| Scenario | Behavior |
|----------|----------|
| **Screenshot name collision** | ⚠️ Overwritten in same shard |
| **Video file incomplete** | ⚠️ Corrupted if test crashes |
| **Trace file > 100MB** | ⚠️ Memory issues, upload timeout |
| **Artifact upload fails** | ⚠️ Lost, but tests still reported |

### Environment Variable Edge Cases

| Variable | Behavior |
|----------|----------|
| **ORCHESTRATOR_SHARD_FILE=""** (empty) | ✅ Treated as not set |
| **ORCHESTRATOR_SHARD_FILE="  "** (spaces) | ⚠️ May try to read file named "  " |
| **ORCHESTRATOR_DEBUG="true"** | ⚠️ Not "1", debug disabled |
| **Variable with newline** | ⚠️ Path includes newline |
| **Variable unset mid-run** | ✅ Already read in onBegin |

### JSON Parse Edge Cases

| Content | Behavior |
|---------|----------|
| `[]` | ✅ Empty set, all tests skipped |
| `[""]` | ✅ One empty string ID |
| `[null]` | ⚠️ Set contains null |
| `[1, 2, 3]` | ⚠️ Numbers, won't match string IDs |
| `{"a": 1}` | ❌ Object, Set constructor fails |
| `"string"` | ❌ String, Set constructor may accept |
| `null` | ❌ TypeError |
| `undefined` | ❌ JSON.parse fails |
| Trailing comma `[1,]` | ❌ JSON.parse fails |

### Cross-Platform Edge Cases

| Platform | Issue |
|----------|-------|
| **Windows** | Path separator `\` normalized to `/` |
| **Windows** | Case-insensitive file system |
| **Windows** | 260 char path limit |
| **macOS** | Unicode normalization (NFD vs NFC) |
| **Linux** | Case-sensitive file system |
| **Docker** | UID/GID permission issues |
| **WSL** | Mixed path formats |

### Timezone & Locale Edge Cases

| Scenario | Behavior |
|----------|----------|
| **TZ=UTC vs TZ=America/New_York** | ✅ Only affects timestamps |
| **Different locales (date format)** | ✅ ISO 8601 used internally |
| **DST transition during run** | ✅ No effect on test execution |

### Node.js Version Edge Cases

| Version | Behavior |
|---------|----------|
| **Node 16** | ⚠️ May work, not tested |
| **Node 18** | ✅ Supported |
| **Node 20** | ✅ Supported |
| **Node 22** | ✅ Should work |
| **Bun runtime** | ⚠️ Playwright may have issues |
| **Deno** | ❌ Not supported |

### TypeScript & Compilation Edge Cases

| Scenario | Behavior |
|----------|----------|
| **tsconfig paths `@/tests/`** | ⚠️ Must resolve to relative path |
| **Source maps enabled** | ✅ No effect on test ID |
| **Compiled JS (tsc output)** | ✅ Uses .js path in ID |
| **ESM (`type: "module"`)** | ✅ Works |
| **CommonJS** | ✅ Works |
| **Decorator metadata** | ✅ No effect |
| **Barrel exports (index.ts)** | ⚠️ Path may be index.ts |

### Test File Organization Edge Cases

| Pattern | Behavior |
|---------|----------|
| **Test imports another test** | ⚠️ Imported tests may run twice |
| **Circular test dependencies** | ❌ Node may fail to load |
| **Shared setup in separate file** | ✅ No effect on IDs |
| **Page Object Pattern** | ✅ No effect on IDs |
| **Test data in JSON files** | ✅ No effect |
| **Test in node_modules** | ❌ Usually excluded by testIgnore |

### Browser Context Edge Cases

| Scenario | Behavior |
|----------|----------|
| **New context per test** | ✅ Isolation works |
| **Shared context** | ⚠️ State may leak between tests |
| **Multiple pages per test** | ✅ Same test ID |
| **Popups/new tabs** | ✅ Same test ID |
| **iframes** | ✅ Same test ID |
| **Service workers** | ✅ Per-context, cleaned up |
| **Web workers** | ✅ Per-page, cleaned up |

### Reporter Order Edge Cases

| Configuration | Behavior |
|---------------|----------|
| **Orchestrator first** | ✅ Filters before others see test |
| **Orchestrator last** | ✅ Filters after others modify test |
| **Before HTML reporter** | ✅ HTML sees filtered results |
| **After HTML reporter** | ⚠️ HTML may see unfiltered |
| **Multiple custom reporters** | ⚠️ All see same test object |

### Test Isolation Edge Cases

| Leaky State | Behavior |
|-------------|----------|
| **Global variables** | ⚠️ May leak between tests in same worker |
| **Cookies** | ✅ Cleared per context (default) |
| **localStorage** | ✅ Cleared per context (default) |
| **IndexedDB** | ✅ Cleared per context (default) |
| **Service worker cache** | ⚠️ May persist if not cleaned |
| **Singleton instances** | ⚠️ Shared in same worker |

### Browser-Specific Edge Cases

| Browser | Behavior |
|---------|----------|
| **Chromium-only API** | ✅ Test runs, may fail on other browsers |
| **Firefox differences** | ✅ Test ID same, behavior may differ |
| **WebKit differences** | ✅ Test ID same, behavior may differ |
| **Mobile emulation** | ✅ Same test ID |
| **Device descriptors** | ✅ Same test ID |

### Network Condition Edge Cases

| Condition | Behavior |
|-----------|----------|
| **Offline mode** | ✅ Test runs, network fails |
| **Slow 3G emulation** | ✅ Test runs slower |
| **Request interception (route)** | ✅ No effect on filtering |
| **Mock responses** | ✅ No effect on filtering |
| **CORS errors** | ✅ Test fails, filtered correctly |
| **Certificate errors** | ✅ Test fails, filtered correctly |

### Resource Cleanup Edge Cases

| Resource | Behavior |
|----------|----------|
| **Browser not closed** | ⚠️ Orphan process, CI timeout |
| **Port still in use** | ⚠️ Next run may fail |
| **File handle leak** | ⚠️ May cause issues |
| **Temp files not deleted** | ⚠️ Disk fills up over time |
| **Database connection leak** | ⚠️ Pool exhaustion |

### Mocking Edge Cases

| Mock | Behavior |
|------|----------|
| **Clock (fake timers)** | ✅ No effect on filtering |
| **Date.now()** | ⚠️ Timing data may be wrong |
| **Math.random()** | ✅ No effect |
| **Fetch mock** | ✅ No effect on filtering |

### Snapshot Testing Edge Cases

| Scenario | Behavior |
|----------|----------|
| **Snapshot mismatch** | ✅ Test fails, filtered correctly |
| **--update-snapshots** | ✅ Works with filtering |
| **Platform-specific snapshot** | ⚠️ May differ across shards |
| **Font rendering differences** | ⚠️ May cause flaky failures |
| **Animation mid-frame** | ⚠️ Timing-dependent |

### Component Testing (CT) Edge Cases

| Scenario | Behavior |
|----------|----------|
| **React CT** | ✅ Same filtering works |
| **Vue CT** | ✅ Same filtering works |
| **Svelte CT** | ✅ Same filtering works |
| **Component mount failure** | ✅ Test fails, filtered correctly |
| **CT + E2E mixed** | ✅ Different test files |

### Authentication Edge Cases

| Scenario | Behavior |
|----------|----------|
| **Token expires mid-test** | ✅ Test fails, filtered correctly |
| **Session timeout** | ✅ Test fails, filtered correctly |
| **OAuth callback** | ✅ Same test ID |
| **2FA/OTP flow** | ✅ Same test ID |
| **SSO redirect** | ✅ Same test ID |
| **Auth test skipped but needed** | ⚠️ Dependent tests may fail |

### Database Edge Cases

| Scenario | Behavior |
|----------|----------|
| **Concurrent DB access** | ⚠️ May cause conflicts |
| **Transaction rollback** | ✅ Per-test cleanup |
| **Connection pool exhausted** | ❌ Tests timeout |
| **Schema changed mid-run** | ❌ Tests may fail |
| **Database seed per shard** | ⚠️ Must coordinate |

### Third-Party Service Edge Cases

| Scenario | Behavior |
|----------|----------|
| **Rate limited** | ✅ Test fails, retry may help |
| **Service degraded (slow)** | ✅ Test may timeout |
| **Service down** | ✅ Test fails |
| **API version changed** | ✅ Test fails |
| **Webhook delivery** | ⚠️ Async, may not arrive |

### Tracing & Debugging Edge Cases

| Feature | Behavior |
|---------|----------|
| **Trace per test** | ✅ Works with filtering |
| **HAR recording** | ✅ Works with filtering |
| **Video recording** | ✅ Works with filtering |
| **Screenshot on failure** | ✅ Works with filtering |
| **--debug mode** | ✅ Works with filtering |
| **--ui mode** | ⚠️ May show all tests, filtering in reporter |

### Playwright Test Config Edge Cases

| Config | Behavior |
|--------|----------|
| **`testDir` array** | ❌ Not supported by Playwright |
| **`testMatch` complex glob** | ✅ Discovery respects it |
| **`outputDir` per project** | ✅ No effect on filtering |
| **`snapshotDir` custom** | ✅ No effect on filtering |
| **`preserveOutput: 'always'`** | ✅ No effect on filtering |
| **`updateSnapshots: 'all'`** | ✅ No effect on filtering |

### Test Tags/Annotations Edge Cases

| Tag | Behavior |
|-----|----------|
| **`@smoke` tag in title** | ✅ Part of test ID |
| **`@slow` tag** | ✅ Part of test ID |
| **Tags via --grep** | ⚠️ May conflict with reporter |
| **Playwright tag API** | ✅ Separate from test ID |

### Expect Assertion Edge Cases

| Assertion | Behavior |
|-----------|----------|
| **expect.soft()** | ✅ Test continues, may still fail |
| **expect.poll()** | ✅ Async wait, no filtering effect |
| **expect.toPass()** | ✅ Retry logic, no filtering effect |
| **Custom matchers** | ✅ No filtering effect |

### Test Hooks Edge Cases

| Hook | Behavior |
|------|----------|
| **beforeEach throws** | ✅ Test fails, onTestBegin already called |
| **afterEach throws** | ✅ Test fails after completion |
| **beforeAll throws** | ❌ All tests in describe skip |
| **afterAll throws** | ⚠️ Cleanup fails, may affect next file |
| **Hook timeout** | ✅ Treated as test failure |

### Fixture Edge Cases

| Fixture | Behavior |
|---------|----------|
| **Auto fixture** | ✅ Runs for non-skipped tests |
| **Worker fixture** | ✅ Shared per worker |
| **Scoped fixture** | ✅ Per-test or per-worker |
| **Fixture depends on skipped test** | ⚠️ May not initialize |
| **Fixture setup throws** | ✅ Test fails |
| **Fixture teardown throws** | ⚠️ Cleanup incomplete |

### Parallelism Edge Cases

| Config | Behavior |
|--------|----------|
| **fullyParallel: true** | ✅ Each test in own worker |
| **fullyParallel: false** | ✅ File-level parallelism |
| **workers: 1** | ✅ Sequential in one worker |
| **Parallel + serial mix** | ⚠️ Serial blocks parallel |

### Test.step Edge Cases

| Scenario | Behavior |
|----------|----------|
| **Nested steps** | ✅ Not in test ID |
| **Step failure** | ✅ Test fails |
| **Step in beforeAll** | ✅ Not in test ID |
| **Async step** | ✅ Awaited properly |

### File System Advanced Edge Cases

| Scenario | Behavior |
|----------|----------|
| **Symlink loop** | ❌ Node follows until error |
| **NFS mount (slow)** | ⚠️ Slow file operations |
| **RAM disk (tmpfs)** | ✅ Fast but lost on reboot |
| **Encrypted volume** | ✅ Transparent to Node |
| **Sparse file** | ✅ Works normally |
| **Hard links** | ⚠️ Same file, different paths = different IDs |
| **Read-only file system** | ❌ Can't write shard file |
| **Disk quota exceeded** | ❌ Write fails |

### Network Advanced Edge Cases

| Scenario | Behavior |
|----------|----------|
| **IPv6 only** | ⚠️ Some services may fail |
| **Corporate proxy** | ⚠️ Must configure NODE_EXTRA_CA_CERTS |
| **VPN required** | ⚠️ Network routing may differ |
| **DNS over HTTPS (DoH)** | ✅ Transparent |
| **Split DNS** | ⚠️ Internal URLs may not resolve |
| **Air-gapped network** | ❌ Can't download browsers |
| **MTU issues** | ⚠️ Large responses may fail |

### Time & Clock Edge Cases

| Scenario | Behavior |
|----------|----------|
| **NTP sync during test** | ⚠️ Time may jump |
| **Clock drift** | ⚠️ Timing data inaccurate |
| **Monotonic clock** | ✅ Used for performance.now() |
| **High-resolution timer** | ✅ Microsecond precision |
| **DST transition** | ⚠️ Timestamps may be confusing |
| **Leap second** | ⚠️ 61 seconds in minute |
| **Y2038 problem** | ⚠️ 32-bit timestamp overflow |
| **Negative timezone** | ✅ Handled correctly |

### Unicode Advanced Edge Cases

| Character Type | Behavior |
|----------------|----------|
| **Zero-width joiner (ZWJ)** | ✅ Part of test ID |
| **Zero-width non-joiner** | ✅ Part of test ID |
| **Invisible characters** | ⚠️ IDs look same but different |
| **Combining characters (é vs é)** | ⚠️ NFC vs NFD may differ |
| **Right-to-left (Hebrew/Arabic)** | ✅ Works but display confusing |
| **Bidirectional override** | ⚠️ Display security risk |
| **Emoji sequences** | ✅ Works (👨‍👩‍👧‍👦) |
| **Regional indicators** | ✅ Works (🇺🇸) |
| **Variation selectors** | ⚠️ Visually same, different bytes |

### Security & Permissions Edge Cases

| Scenario | Behavior |
|----------|----------|
| **SELinux enforcing** | ⚠️ May block file access |
| **AppArmor profile** | ⚠️ May restrict operations |
| **Read-only container** | ❌ Can't write files |
| **Non-root user** | ✅ Works with proper permissions |
| **UID mapping (rootless)** | ✅ Works in container |
| **Capabilities dropped** | ⚠️ Some operations may fail |
| **Seccomp filter** | ⚠️ Syscalls may be blocked |
| **No /tmp access** | ❌ Playwright may fail |

### Container/Kubernetes Edge Cases

| Scenario | Behavior |
|----------|----------|
| **Ephemeral container** | ⚠️ No persistent storage |
| **Pod eviction mid-test** | ❌ Test lost |
| **OOM killed** | ❌ No cleanup |
| **CPU throttling** | ⚠️ Tests run slowly |
| **Network policy blocks** | ❌ Can't reach services |
| **Init container setup** | ✅ Must complete first |
| **Sidecar container** | ✅ Runs alongside |
| **Shared PID namespace** | ⚠️ Process visibility |

### Cloud Provider Edge Cases

| Provider | Issue |
|----------|-------|
| **AWS Lambda** | ❌ Not suitable for Playwright |
| **AWS Fargate** | ⚠️ Limited resources |
| **GCP Cloud Run** | ⚠️ Cold start delays |
| **Azure Container Instances** | ✅ Works |
| **GitHub Actions (free)** | ⚠️ Resource limits |
| **GitHub Actions (large runner)** | ✅ Better performance |
| **Self-hosted runner** | ✅ Full control |

### Git/Version Control Edge Cases

| Scenario | Behavior |
|----------|----------|
| **Detached HEAD** | ✅ Works, branch name empty |
| **Shallow clone (depth=1)** | ✅ Works |
| **Sparse checkout** | ⚠️ Some files may be missing |
| **Git LFS files** | ⚠️ Must be fetched |
| **Submodules** | ⚠️ Must be initialized |
| **Worktree** | ✅ Works |
| **Bare repository** | ❌ No working directory |
| **Git hooks running** | ⚠️ May slow operations |

### Package Manager Edge Cases

| Scenario | Behavior |
|----------|----------|
| **npm ci** | ✅ Clean install |
| **npm install (no lock)** | ⚠️ Versions may differ |
| **pnpm** | ✅ Works |
| **yarn berry (PnP)** | ⚠️ May need configuration |
| **Bun** | ⚠️ Not all packages compatible |
| **Private registry** | ⚠️ Must configure auth |
| **Offline mode** | ❌ Can't install |

### IDE/Editor Edge Cases

| IDE | Behavior |
|-----|----------|
| **VS Code Test Explorer** | ✅ Shows all tests |
| **VS Code Playwright ext** | ⚠️ May not respect shard file |
| **IntelliJ/WebStorm** | ⚠️ Different test runner |
| **vim/neovim** | ✅ CLI works |
| **File watchers** | ⚠️ May trigger rebuilds |

### Report Format Edge Cases

| Format | Behavior |
|--------|----------|
| **HTML reporter** | ✅ Shows skipped tests |
| **JSON reporter** | ✅ Includes skip reason |
| **JUnit XML** | ✅ skipped count correct |
| **Line reporter** | ✅ Shows [skipped] |
| **Dot reporter** | ✅ Shows skipped dot |
| **List reporter** | ✅ Lists skipped |
| **GitHub Actions reporter** | ✅ Annotations work |
| **Allure reporter** | ✅ Compatible |

### Debugging Edge Cases

| Tool | Behavior |
|------|----------|
| **Playwright Inspector** | ⚠️ Opens for non-skipped only |
| **--debug flag** | ✅ Works with filtering |
| **--ui mode** | ⚠️ Shows all, filters on run |
| **Trace viewer** | ✅ Only for run tests |
| **VS Code debugger** | ⚠️ Breakpoints in skipped won't hit |
| **Chrome DevTools** | ✅ Works for run tests |
| **Node --inspect** | ✅ Works |

### Logging Edge Cases

| Scenario | Behavior |
|----------|----------|
| **console.log in test** | ✅ Only for run tests |
| **console.log in skipped** | ❌ Never called |
| **Debug library** | ✅ Works |
| **Verbose Playwright logs** | ✅ Shows filtering |
| **Log file rotation** | ⚠️ May split across files |
| **Structured logging (JSON)** | ✅ Works |
| **Syslog** | ✅ Works |

### Artifact Edge Cases

| Artifact | Behavior |
|----------|----------|
| **Screenshot on skip** | ❌ Not taken |
| **Video of skipped test** | ❌ Not recorded |
| **Trace of skipped test** | ❌ Not captured |
| **Download in skipped test** | ❌ Not downloaded |
| **Artifact path collision** | ⚠️ Overwritten |
| **Artifact > 5GB** | ⚠️ Upload may timeout |
| **Artifact name unicode** | ⚠️ May fail on Windows |

### Error Handling Edge Cases

| Error | Behavior |
|-------|----------|
| **SyntaxError in test file** | ❌ File doesn't load |
| **TypeError in reporter** | ❌ Run fails |
| **Unhandled Promise rejection** | ⚠️ May crash worker |
| **Stack overflow** | ❌ Process crashes |
| **Out of memory** | ❌ OOM killed |
| **EPERM (permission denied)** | ❌ Operation fails |
| **ENOENT (file not found)** | ✅ Graceful fallback |
| **ECONNREFUSED** | ✅ Test fails normally |

### Numeric Edge Cases

| Value | Behavior |
|-------|----------|
| **Number.MAX_SAFE_INTEGER** | ⚠️ May lose precision |
| **Number.MAX_VALUE** | ⚠️ May become Infinity |
| **Number.MIN_VALUE** | ✅ Works |
| **-0 (negative zero)** | ✅ Treated as 0 |
| **NaN in duration** | ⚠️ Sorting unpredictable |
| **BigInt duration** | ❌ JSON.stringify fails |

### String Edge Cases

| String | Behavior |
|--------|----------|
| **Empty string test ID** | ⚠️ May match unintended |
| **Very long string (1MB)** | ⚠️ Memory pressure |
| **String with null byte** | ⚠️ C-string termination |
| **String with BOM** | ⚠️ Invisible extra char |
| **Surrogate pairs** | ✅ UTF-16 handled |
| **Lone surrogates** | ⚠️ Invalid UTF-16 |

### Timing Measurement Edge Cases

| Scenario | Behavior |
|----------|----------|
| **Sub-millisecond test** | ✅ Recorded as 0-1ms |
| **Test runs for hours** | ⚠️ CI may timeout |
| **System sleep during test** | ⚠️ Elapsed time includes sleep |
| **VM migration** | ⚠️ Time may appear to jump |
| **Debugger pause** | ⚠️ Time includes pause |

### Empty Shard Handling

When a shard has no tests assigned:

```yaml
# get-shard action detects empty shard
- uses: NSXBet/playwright-orchestrator/.github/actions/get-shard@v0
  id: shard
  with:
    shard-files: ${{ needs.orchestrate.outputs.shard-files }}
    shard-index: ${{ matrix.shard }}
    shards: 4

# If shard is empty, falls back to native sharding
- run: npx playwright test ${{ steps.shard.outputs.test-args }}
  # test-args will be "--shard=N/M" if orchestrator assigned 0 tests
```

## Known Limitations

1. **Multiple projects**: Test ID may vary if using `--project` flag
2. **Test ID must match**: Orchestrator and reporter must generate identical IDs
3. **Conditional skips**: If test already has `test.skip()`, annotation may not apply
4. **Race conditions**: Tests added between orchestration and run are skipped

## Background

This solution was developed after 5 failed attempts to make test-level distribution work:

1. ❌ Raw test IDs as CLI args → Bash syntax error with `()`
2. ❌ Inline `--grep` pattern → Multi-layer escaping impossible
3. ⚠️ `--grep-file` → Substring collision (`login` matches `login with SSO`)
4. ❌ `file:line` locations → Breaks `test.each()` parameterized tests
5. ⚠️ Playwright `--list` → Still needs filtering mechanism

The Custom Reporter bypasses all shell escaping and uses exact `Set.has()` matching.
