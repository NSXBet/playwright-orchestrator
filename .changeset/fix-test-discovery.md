---
"@nsxbet/playwright-orchestrator": patch
---

Fix test discovery to use Playwright --list instead of regex parsing

The `assign` command was always using the fallback regex-based file parser (`discoverTestsFromFiles`) instead of using Playwright's `--list` command (`discoverTests`). This caused:

- Parameterized tests (using `test.each`, data-driven tests) to not be expanded
- Tests with template literals in names (e.g., `${variable}`) to appear as single tests
- Significant undercounting of tests (e.g., 88 discovered vs 177 actual tests)

Changes:
- `assign` command now tries `discoverTests()` (Playwright --list) first for accurate test discovery
- Falls back to `discoverTestsFromFiles()` only if Playwright --list fails
- Added `--project` flag to filter by Playwright project name
- Added `--use-fallback` flag to force the old regex-based behavior if needed
- Updated `orchestrate` action to accept and pass `project` parameter
