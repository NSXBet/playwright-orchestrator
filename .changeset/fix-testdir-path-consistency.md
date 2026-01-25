---
"@nsxbet/playwright-orchestrator": minor
---

fix: resolve test ID path mismatch and fixture multi-file support

**Path Resolution:**
All components now consistently use `project.testDir` as the single source of truth:

- `test-discovery.ts`: Uses `project.testDir` from JSON config (no fallback to `config.rootDir`)
- `fixture.ts`: Validates `testInfo.project.testDir` is defined
- `reporter.ts`: Requires `project.testDir` (no fallback chain)
- `extract-timing.ts`: Throws error if `testDir` not found in report
- `test-id.ts`: `baseDir` is now required (no `process.cwd()` fallback)

**Fixture Multi-File Support (BREAKING):**
Added `withOrchestratorFilter()` function that uses auto-fixture pattern instead of `beforeEach`.
The old `setupOrchestratorFilter()` only worked for the first test file processed.

Migration:
```typescript
// OLD (deprecated - broken for multi-file)
setupOrchestratorFilter(base);
export { base as test };

// NEW (works correctly)
export const test = withOrchestratorFilter(base);
```
