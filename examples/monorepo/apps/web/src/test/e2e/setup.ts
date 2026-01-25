/**
 * Test setup file - mirrors bet-app/apps/bet-client/src/test/e2e/utils.ts
 */

import { setupOrchestratorFilter } from '@nsxbet/playwright-orchestrator/fixture';
import { test as base, expect } from '@playwright/test';

// Set up orchestrator filter for shard-based test filtering
setupOrchestratorFilter(base);

export { base as test, expect };
