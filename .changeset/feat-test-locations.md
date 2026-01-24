---
"@nsxbet/playwright-orchestrator": minor
---

Add test locations output for exact test filtering

- Add `line` and `column` fields to `DiscoveredTest` interface
- Extract line/column from Playwright JSON output
- Add `testLocations` output (file:line format) to assign command
- Add `test-locations` output to orchestrate action
- Update get-shard action to prefer test-locations over grep-patterns

This enables exact test filtering using Playwright's native `file:line` syntax,
which guarantees 100% accurate test matching without duplicates.
