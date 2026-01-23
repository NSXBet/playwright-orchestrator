---
"@nsxbet/playwright-orchestrator": patch
---

Fix test-level distribution to use --grep patterns instead of raw test IDs

The get-shard action now accepts a `grep-patterns` input from the orchestrate action.
When provided, it outputs `--grep="<pattern>"` as test-args instead of space-separated
test IDs, preventing bash syntax errors from special characters in test names.
