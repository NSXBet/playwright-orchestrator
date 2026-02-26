# Monorepo Example

This example simulates a real monorepo structure to test orchestrator path resolution and edge cases.

## Structure

```text
examples/monorepo/
├── apps/web/
│   ├── src/test/e2e/
│   │   ├── login.spec.ts             # Basic tests
│   │   ├── home.spec.ts              # Basic tests
│   │   ├── parameterized.spec.ts     # test.each patterns
│   │   ├── nested.spec.ts            # 4+ level describes
│   │   ├── special-chars.spec.ts     # Unicode, brackets
│   │   ├── separator-conflict.spec.ts # :: in titles
│   │   ├── skip-patterns.spec.ts     # skip, fixme, slow, tags
│   │   └── features/deep/
│   │       └── path.spec.ts          # Deep subdirectory
│   ├── playwright.config.ts
│   └── package.json
└── package.json
```

## How It Works

The orchestrator uses Playwright's `--test-list` flag for pre-execution filtering. No fixture or reporter integration is needed — `playwright.config.ts` uses only standard Playwright reporters.

### Test ID Path Resolution

When `testDir` differs from `rootDir` (common in monorepos), the orchestrator computes a `testDirPrefix` to convert internal test IDs (relative to `testDir`) to Playwright's `--test-list` format (relative to `rootDir`).

## Edge Cases

| File | Tests |
|------|-------|
| `parameterized.spec.ts` | `test.each` with arrays, objects, template literals |
| `nested.spec.ts` | 4+ levels deep, same names in different contexts |
| `special-chars.spec.ts` | Unicode (Japanese, Cyrillic), brackets, emojis |
| `separator-conflict.spec.ts` | `::` in test/describe titles |
| `skip-patterns.spec.ts` | `skip`, `fixme`, `slow`, `@smoke`, `[P0]` tags |
| `features/deep/path.spec.ts` | Tests in deep subdirectories |

## Running Tests

### Using GitHub Actions (via Act)

```bash
# From playwright-orchestrator root
make act-e2e-monorepo
```

This runs the full E2E workflow locally using Act, which simulates the GitHub Actions environment.
