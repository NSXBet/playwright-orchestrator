---
"@nsxbet/playwright-orchestrator": minor
---

Add `--test-list` flag to accept pre-generated Playwright test list

This is the recommended approach for CI environments where Playwright is already set up.
Instead of the orchestrator trying to discover tests internally (which requires running
`npx playwright test --list`), the workflow can generate the test list and pass it directly.

New workflow pattern:
```yaml
- name: Generate test list
  run: npx playwright test --list --reporter=json --project="My Project" > test-list.json
  working-directory: my-app

- name: Orchestrate tests
  uses: NSXBet/playwright-orchestrator/.github/actions/orchestrate@v0
  with:
    test-list: my-app/test-list.json
    shards: 4
```

Benefits:
- More robust: Uses the same Playwright setup that runs tests
- More debuggable: If `--list` fails, it fails visibly in the workflow step
- Simpler action: No internal test discovery, just assignment algorithm
