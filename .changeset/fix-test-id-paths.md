---
"@nsxbet/playwright-orchestrator": patch
---

Fix test ID path resolution to match reporter format

The orchestrator was generating test IDs with incorrect file paths and duplicated filenames:
- File paths were just filenames instead of relative paths from CWD
- Root suite title (filename) was included in titlePath, causing duplication

Fixed by:
- Using `config.rootDir` from Playwright JSON to resolve relative file paths
- Skipping root suite title from titlePath (it's the filename, redundant with file)

Before: `account.spec.ts::account.spec.ts::Describe::test`
After: `src/test/e2e/account.spec.ts::Describe::test`

This ensures test IDs match between orchestrator (discovery) and reporter (runtime filtering).
