---
"@nsxbet/playwright-orchestrator": patch
---

Fix test ID path mismatch in monorepo setups

When the orchestrator runs from a monorepo root but tests run from a subdirectory, the test IDs would not match because both used `process.cwd()` to generate relative paths:

- Orchestrator (CWD: repo root): `apps/bet-client/src/test/e2e/login.spec.ts::...`
- Fixture (CWD: `apps/bet-client/`): `src/test/e2e/login.spec.ts::...`

This caused all tests to be skipped because no IDs matched the shard file.

**Fix:** The test discovery now generates paths relative to Playwright's `rootDir` (from the test-list.json config), not relative to `process.cwd()`. This ensures consistent test IDs regardless of where the orchestrator runs from.

**Before:** All tests skipped (path mismatch)
**After:** Correct sharding - both orchestrator and fixture generate identical test IDs like `src/test/e2e/login.spec.ts::...`
