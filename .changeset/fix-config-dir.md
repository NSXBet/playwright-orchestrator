---
"@nsxbet/playwright-orchestrator": patch
---

Add `--config-dir` flag to specify Playwright config location

The `discoverTests` function now accepts a `configDir` parameter that specifies where
`playwright.config.ts` is located. This fixes test discovery when the test directory
(`--test-dir`) is different from the Playwright config directory.

Previously, Playwright was run from the test directory, which failed to find the config
file and returned 0 tests, causing fallback to the less accurate regex-based parser.

Changes:
- Added `--config-dir` / `-c` flag to `assign` command
- Added `config-dir` input to the `orchestrate` GitHub Action
- Updated `discoverTests()` to accept optional `configDir` parameter
