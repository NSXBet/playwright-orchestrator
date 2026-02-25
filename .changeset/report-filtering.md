---
"@nsxbet/playwright-orchestrator": minor
---

Add report filtering to remove orchestrator-skipped tests

- Added `filterJson` reporter option to remove non-shard specs from JSON reports using test-ID matching, with stats recalculation
- Added `filter-report` CLI command and GitHub Action to remove orchestrator-skipped tests from merged reports
