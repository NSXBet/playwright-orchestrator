---
"@nsxbet/playwright-orchestrator": minor
---

Simplify orchestrate action by making inputs required

**Breaking changes to the `orchestrate` action:**

- `test-list` is now **required** - You must generate the test list using `npx playwright test --list --reporter=json > test-list.json` in your workflow before calling this action
- `timing-file` is now **required** - You must specify the path to your timing data file (the file doesn't need to exist on first run)

**Removed inputs:**

- `test-dir` - Removed to prevent incorrect usage
- `config-dir` - Removed to prevent incorrect usage  
- `glob-pattern` - Removed (was only used with test-dir)
- `project` - Removed from action (was only used with test-dir for discovery)

**Why this change:**

The previous optional inputs (`test-dir`, `config-dir`) allowed users to let the action discover tests internally, which often led to path resolution issues in monorepos. By requiring `test-list`, users must generate the test list from the correct working directory in their workflow, ensuring consistent test ID generation between discovery and runtime.

**Migration:**

Before:
```yaml
- uses: NSXBet/playwright-orchestrator/.github/actions/orchestrate@v0
  with:
    test-dir: ./e2e
    shards: 4
```

After:
```yaml
# Generate test list first (from the directory where tests run)
- run: npx playwright test --list --reporter=json > test-list.json

- uses: NSXBet/playwright-orchestrator/.github/actions/orchestrate@v0
  with:
    test-list: test-list.json
    timing-file: timing-data.json
    shards: 4
```
