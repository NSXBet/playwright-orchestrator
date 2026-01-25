---
"@nsxbet/playwright-orchestrator": minor
---

Remove backward compatibility with legacy models and add reporter as package export

### New Features

- **Reporter as package export**: Import the reporter directly without copying files:
  ```typescript
  reporter: [['@nsxbet/playwright-orchestrator/reporter'], ['html']]
  ```

### Breaking Changes

- **Timing Data V1 no longer supported**: Only V2 (test-level) format is accepted. V1 files will be treated as empty data.
- **Grep patterns removed**: The `--grep` based filtering is removed in favor of reporter-based filtering.
- **File:line locations removed**: The `buildTestLocation()` function and related outputs are removed.
- **Actions outputs changed**:
  - `orchestrate`: Removed `grep-patterns`, `test-locations` outputs
  - `get-shard`: Removed `test-args`, `grep-file` outputs; use `shard-file` instead

### Migration

1. Add the reporter to your `playwright.config.ts`:

   ```typescript
   reporter: [['@nsxbet/playwright-orchestrator/reporter'], ['html']]
   ```

2. Update workflows to use `shard-file` output:

   ```yaml
   - run: npx playwright test
     env:
       ORCHESTRATOR_SHARD_FILE: ${{ steps.shard.outputs.shard-file }}
   ```

3. Delete any V1 timing cache files and let them regenerate
