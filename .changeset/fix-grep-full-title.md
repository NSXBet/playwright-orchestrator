---
"@nsxbet/playwright-orchestrator": patch
---

Fix grep patterns to use full title path for exact test matching

- Use full title path (e.g., "describe › test title") instead of just test title
- This fixes duplicate test matching for tests with the same name in different describe blocks
- get-shard action now prefers grep patterns over file:line locations (file:line doesn't work reliably for parameterized tests)
