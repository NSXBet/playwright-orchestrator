---
"@nsxbet/playwright-orchestrator": minor
---

Add fixture-based test filtering for proper test skipping

The reporter-based approach only added metadata but didn't actually skip tests.
This adds a new fixture module that uses `test.skip()` to properly skip tests
not in the current shard.

### New Features

- **Fixture module** (`@nsxbet/playwright-orchestrator/fixture`):
  - `setupOrchestratorFilter(test)` - Sets up beforeEach hook for automatic filtering
  - `shouldRunTest(testInfo)` - Manual check if a test should run

### Usage

```typescript
// In your test utils or setup file
import { test } from '@playwright/test';
import { setupOrchestratorFilter } from '@nsxbet/playwright-orchestrator/fixture';

setupOrchestratorFilter(test);
```

### Bug Fixes

- Fixed reporter test ID generation to exclude project name and filename from titlePath
- Reporter now correctly builds test IDs matching the orchestrator format
