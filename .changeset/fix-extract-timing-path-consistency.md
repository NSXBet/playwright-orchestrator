---
"@nsxbet/playwright-orchestrator": patch
---

Fix extract-timing path mismatch and duplicate filename bugs

**Path Mismatch Bug:**
- Fixed test ID generation in `extract-timing` where `suite.file` paths were not correctly resolved relative to `testDir`
- Now uses `config.rootDir` from the Playwright JSON report as the canonical base for resolving all paths
- This ensures consistent test IDs regardless of CI environment absolute paths (e.g., Docker container paths)

**Duplicate Filename Bug:**
- Fixed root suite title (filename) being incorrectly included in test IDs
- Test IDs were generated as `file.spec.ts::file.spec.ts::Describe::test` instead of `file.spec.ts::Describe::test`
- Added `isRootSuite` parameter to skip the root suite title, aligning with `test-discovery.ts` behavior

These bugs caused timing cache misses because test IDs from `extract-timing` didn't match test IDs from discovery/fixture.
