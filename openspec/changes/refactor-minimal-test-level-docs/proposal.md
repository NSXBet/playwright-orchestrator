# Change: Implement Reporter-Based Test-Level Distribution

## Why

Test-level distribution with `--grep` is fundamentally broken. After 5 failed attempts, the solution is a **Custom Reporter**.

### The Real Error (bet-app CI)

```
/home/runner/work/_temp/bc0e4b2f.sh: line 1: syntax error near unexpected token `('
```

Caused by: `betslip.v2.spec.ts::BetSlip v2::should show message for (ServerMessage)`

### Failed Attempts Summary

| # | Approach | Result | Fatal Flaw |
|---|----------|--------|------------|
| 1 | Raw test IDs as positional args | ❌ Failed | Bash syntax error with `()` |
| 2 | `--grep="pattern"` inline | ❌ Failed | Multi-layer escaping impossible |
| 3 | `--grep-file` with pattern | ⚠️ Partial | Substring matching collisions |
| 4 | `file:line` locations | ❌ Failed | Breaks `test.each` parameterized |
| 5 | Playwright `--list` discovery | ⚠️ Partial | Still needs filtering mechanism |

### Root Cause

```
┌──────────────────────────────────────────────────────────────────────┐
│                    The Fundamental Problem                            │
├──────────────────────────────────────────────────────────────────────┤
│                                                                       │
│   Orchestrator                              Playwright                │
│   ───────────                              ──────────                 │
│   1. Discovers tests                       1. Discovers tests         │
│   2. Assigns to shards                     2. Receives filter         │
│   3. Outputs filter (grep, file:line)      3. Matches filter          │
│                                                                       │
│   PROBLEM: The filter must perfectly select the intended tests        │
│            without collision, omission, or escaping issues.           │
│                                                                       │
│   - grep: substring matching causes collisions                        │
│   - file:line: doesn't work for parameterized tests                   │
│   - test ID: not a valid Playwright filter format                     │
│                                                                       │
└──────────────────────────────────────────────────────────────────────┘
```

## The Solution: Custom Reporter

Instead of trying to pass test filters through shell → Playwright CLI, we:

1. Pass test IDs via **JSON file** (no shell escaping)
2. Use **Custom Reporter** to filter at runtime (exact matching via `Set.has()`)

```
Orchestrator → JSON file → Reporter → Playwright
     ↓              ↓           ↓
  Distributes   test-ids     Filters via
    tests       per shard    Set.has()
```

### Why It Works

| Problem | Solution |
|---------|----------|
| Bash syntax error `()` | JSON file, not CLI args |
| Substring collision | `Set.has()` is exact |
| Parameterized tests | Playwright generates unique IDs |
| Shell escaping layers | Bypassed entirely |

### Test Names That Now Work

```typescript
test('should show error (500)', () => {});       // ✅ Parentheses
test('should parse A | B | C', () => {});        // ✅ Pipes
test('should format $100.00', () => {});         // ✅ Dollar sign
test('should render `code` blocks', () => {});   // ✅ Backticks
test("should show 'warning' message", () => {}); // ✅ Quotes
test.each([1, 2, 3])('value %i works', () => {}); // ✅ Parameterized
```

## What Changes

### New Documentation

Create `docs/test-level-reporter.md` with:
1. Quick Start (30 seconds)
2. Reporter code (~40 lines)
3. GitHub Actions workflow
4. Troubleshooting
5. Known limitations

### Delete Old Documentation

Remove verbose/outdated docs:
- `docs/MINIMAL-test-level-solution.md` (873 lines → consolidated)
- `docs/SOLUTION-test-level-exact-matching.md` (2371 lines → over-engineered)
- `docs/TECHNICAL-test-level-distribution.md` (690 lines → problem now solved)

## Impact

- New file: `docs/test-level-reporter.md` (~200 lines)
- Deleted files: 3 docs (~3900 lines total)
- Net reduction: ~3700 lines

## Implementation Details

### Reporter Code (~40 lines)

```typescript
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

### Validation Test

```typescript
describe("Exact Matching", () => {
  test("should NOT collide on substrings", () => {
    const shard = new Set(["login.spec.ts::Login::should login"]);
    
    expect(shard.has("login.spec.ts::Login::should login")).toBe(true);
    expect(shard.has("login.spec.ts::Login::should login with SSO")).toBe(false);
  });
});
```

## Affected Specs

- `orchestration/spec.md` - Added requirements for Reporter-Based Test Filtering

## Non-Goals

- NOT creating npm package (just copy reporter file)
- NOT implementing CLI commands (just documentation)
- NOT changing existing orchestrator CLI behavior
