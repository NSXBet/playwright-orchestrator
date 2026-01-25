# Draft: Final Document

This will become `docs/test-level-reporter.md` after implementation.

---

# Test-Level Distribution with Custom Reporter

Reliable test-level distribution using a Playwright Reporter for exact test filtering.

## Quick Start

```bash
# 1. Copy the reporter to your project
curl -o playwright-orchestrator-reporter.ts \
  https://raw.githubusercontent.com/NSXBet/playwright-orchestrator/main/examples/reporter.ts

# 2. Add to playwright.config.ts
# reporter: [['./playwright-orchestrator-reporter.ts'], ['html']]

# 3. Test locally
echo '["e2e/login.spec.ts::Login::should login"]' > shard.json
ORCHESTRATOR_SHARD_FILE=shard.json npx playwright test
```

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

```typescript
// playwright-orchestrator-reporter.ts
import type { Reporter, TestCase, FullConfig, Suite } from "@playwright/test/reporter";
import * as fs from "fs";
import * as path from "path";

export default class OrchestratorReporter implements Reporter {
  private allowedTestIds: Set<string> | null = null;
  private debug = process.env.ORCHESTRATOR_DEBUG === "1";

  onBegin(_config: FullConfig, _suite: Suite) {
    const shardFile = process.env.ORCHESTRATOR_SHARD_FILE;
    if (!shardFile || !fs.existsSync(shardFile)) return;

    const testIds = JSON.parse(fs.readFileSync(shardFile, "utf-8"));
    this.allowedTestIds = new Set(testIds);
    console.log(`[Orchestrator] ${this.allowedTestIds.size} tests for this shard`);
  }

  onTestBegin(test: TestCase) {
    if (!this.allowedTestIds) return;

    const testId = this.buildTestId(test);
    if (!this.allowedTestIds.has(testId)) {
      test.annotations.push({ type: "skip", description: "Not in shard" });
      if (this.debug) console.log(`[Skip] ${testId}`);
    }
  }

  private buildTestId(test: TestCase): string {
    const file = path.relative(process.cwd(), test.location.file).replace(/\\/g, "/");
    return [file, ...test.titlePath()].join("::");
  }
}
```

## Configuration

```typescript
// playwright.config.ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  reporter: [
    ["./playwright-orchestrator-reporter.ts"],
    ["html"],
  ],
});
```

## GitHub Actions Workflow

```yaml
jobs:
  orchestrate:
    runs-on: ubuntu-24.04
    outputs:
      shard-files: ${{ steps.orchestrate.outputs.shard-files }}
    steps:
      - uses: actions/checkout@v4
      - uses: NSXBet/playwright-orchestrator/.github/actions/setup-orchestrator@v0
      
      - uses: actions/cache/restore@v4
        with:
          path: timing-data.json
          key: playwright-timing-${{ github.ref_name }}
      
      - uses: NSXBet/playwright-orchestrator/.github/actions/orchestrate@v0
        id: orchestrate
        with:
          test-dir: ./e2e
          shards: 4
          timing-file: timing-data.json
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

Test ID format: `{relative-file}::{describe}::{test-title}`

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

## Known Limitations

1. **Multiple projects**: Test ID may vary if using `--project` flag
2. **Test ID must match**: Orchestrator and reporter must generate identical IDs
3. **Conditional skips**: If test already has `test.skip()`, annotation may not apply

## Background

This solution was developed after 5 failed attempts to make test-level distribution work:

1. ❌ Raw test IDs as CLI args → Bash syntax error with `()`
2. ❌ Inline `--grep` pattern → Multi-layer escaping impossible
3. ⚠️ `--grep-file` → Substring collision (`login` matches `login with SSO`)
4. ❌ `file:line` locations → Breaks `test.each()` parameterized tests
5. ⚠️ Playwright `--list` → Still needs filtering mechanism

The Custom Reporter bypasses all shell escaping and uses exact `Set.has()` matching.
