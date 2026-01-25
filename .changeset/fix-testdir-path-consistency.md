---
"@nsxbet/playwright-orchestrator": patch
---

fix: resolve test ID path mismatch (rootDir vs testDir)

All components now consistently use `project.testDir` as the single source of truth for path resolution:

- `test-discovery.ts`: Uses `project.testDir` from JSON config (no fallback to `config.rootDir`)
- `fixture.ts`: Validates `testInfo.project.testDir` is defined
- `reporter.ts`: Requires `project.testDir` (no fallback chain)
- `extract-timing.ts`: Throws error if `testDir` not found in report
- `test-id.ts`: `baseDir` is now required (no `process.cwd()` fallback)

This prevents silent test ID mismatches in monorepo setups where `testDir` is a subdirectory of `rootDir`.
