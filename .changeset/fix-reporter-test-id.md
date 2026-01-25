---
"@nsxbet/playwright-orchestrator": patch
---

Fix reporter test ID matching to exclude project name and filename from titlePath

The reporter's `buildTestId` was incorrectly including the project name and filename from `titlePath()`, causing test IDs to mismatch between orchestrator and reporter.

Before: `src/test/e2e/account.spec.ts::Mobile Chrome::account.spec.ts::Describe::test`
After: `src/test/e2e/account.spec.ts::Describe::test`

This ensures tests are correctly filtered during shard execution.
