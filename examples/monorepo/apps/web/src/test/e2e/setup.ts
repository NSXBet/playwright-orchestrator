/**
 * Test setup file - mirrors bet-app/apps/bet-client/src/test/e2e/utils.ts
 */

import { withOrchestratorFilter } from '@nsxbet/playwright-orchestrator/fixture';
import { test as base, expect } from '@playwright/test';

// Create extended test with orchestrator filtering (auto-fixture pattern)
// This ensures filtering works across ALL test files in the run
export const test = withOrchestratorFilter(base);

export { expect };
