/**
 * Playwright Orchestrator Fixture
 *
 * A Playwright fixture that filters tests based on a JSON shard file.
 * This provides actual test skipping (unlike the reporter which only adds metadata).
 *
 * Usage in your test setup file (e.g., tests/setup.ts):
 * ```typescript
 * import { test as base } from '@playwright/test';
 * import { withOrchestratorFilter } from '@nsxbet/playwright-orchestrator/fixture';
 *
 * // Create extended test with orchestrator filtering
 * export const test = withOrchestratorFilter(base);
 * export { expect } from '@playwright/test';
 * ```
 *
 * Then in your test files:
 * ```typescript
 * import { test, expect } from './setup';
 *
 * test('my test', async ({ page }) => {
 *   // ...
 * });
 * ```
 *
 * Environment variables:
 * - ORCHESTRATOR_SHARD_FILE: Path to JSON file with array of test IDs
 * - ORCHESTRATOR_DEBUG: Set to "1" to enable debug logging
 *
 * @module @nsxbet/playwright-orchestrator/fixture
 */

import * as fs from 'node:fs';
import type { TestType } from '@playwright/test';
import { buildTestIdFromRuntime } from './core/test-id.js';

// Module initialization debug - only in debug mode
if (process.env.ORCHESTRATOR_DEBUG === '1') {
  process.stderr.write('[Fixture Module] Loading orchestrator fixture\n');
}

// Cache the shard file to avoid re-reading on every test
let cachedAllowedTestIds: Set<string> | null = null;
let cacheInitialized = false;

function loadShardFile(): Set<string> | null {
  if (cacheInitialized) return cachedAllowedTestIds;

  cacheInitialized = true;
  const shardFile = process.env.ORCHESTRATOR_SHARD_FILE;

  if (!shardFile || !fs.existsSync(shardFile)) {
    if (process.env.ORCHESTRATOR_DEBUG === '1') {
      console.log('[Orchestrator] No shard file, running all tests');
    }
    return null;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(shardFile, 'utf-8'));

    // Validate shard file format
    if (
      !Array.isArray(parsed) ||
      !parsed.every((id) => typeof id === 'string')
    ) {
      throw new Error(
        '[Orchestrator] Shard file must be a JSON array of strings',
      );
    }

    const testIds: string[] = parsed;
    cachedAllowedTestIds = new Set(testIds);
    if (process.env.ORCHESTRATOR_DEBUG === '1') {
      process.stderr.write(
        `[Orchestrator] Loaded ${testIds.length} tests for this shard\n`,
      );
      process.stderr.write(
        `[Orchestrator] Sample IDs: ${testIds.slice(0, 3).join(' | ')}\n`,
      );
    }
    return cachedAllowedTestIds;
  } catch (error) {
    console.error('[Orchestrator] Failed to load shard file:', error);
    throw error;
  }
}

/**
 * Creates an extended test with orchestrator filtering as an auto-fixture.
 * This ensures tests not in the current shard are skipped.
 *
 * IMPORTANT: Use this function to create your test object, then export it.
 * All test files should import the extended test, not the base test.
 *
 * @param test - The base test object from @playwright/test
 * @returns Extended test with orchestrator filtering
 *
 * @example
 * ```typescript
 * // In setup.ts
 * import { test as base } from '@playwright/test';
 * import { withOrchestratorFilter } from '@nsxbet/playwright-orchestrator/fixture';
 *
 * export const test = withOrchestratorFilter(base);
 *
 * // In your.spec.ts
 * import { test } from './setup';
 * test('example', async ({ page }) => { ... });
 * ```
 */
export function withOrchestratorFilter<T extends object, W extends object>(
  test: TestType<T, W>,
): TestType<T & { _orchestratorFilter: void }, W> {
  return test.extend<{ _orchestratorFilter: void }>({
    // @ts-expect-error - Playwright's auto fixture typing is complex
    _orchestratorFilter: [
      // biome-ignore lint/correctness/noEmptyPattern: Playwright requires empty destructuring
      async ({}, use: () => Promise<void>, testInfo: { file: string; titlePath: string[]; project: { name: string; testDir: string } }) => {
        const allowedTestIds = loadShardFile();

        if (allowedTestIds) {
          // CRITICAL: Use project.testDir for consistent path resolution with test-discovery
          // No fallback to process.cwd() - this causes path mismatch bugs
          const testDir = testInfo.project.testDir;

          if (!testDir) {
            throw new Error(
              '[Orchestrator Fixture] Could not determine project testDir. ' +
                'Ensure your playwright.config.ts has projects configured with testDir.',
            );
          }

          const testId = buildTestIdFromRuntime(
            testInfo.file,
            testInfo.titlePath,
            {
              projectName: testInfo.project.name,
              baseDir: testDir,
            },
          );

          const isAllowed = allowedTestIds.has(testId);

          // Debug: Write to stderr for visibility in CI logs
          if (process.env.ORCHESTRATOR_DEBUG === '1') {
            process.stderr.write(
              `[Fixture] testDir=${testInfo.project.testDir} | testId=${testId} | allowed=${isAllowed}\n`,
            );
          }

          if (!isAllowed) {
            test.skip(true, 'Not in shard');
          }
        }

        await use();
      },
      { auto: true },
    ],
  });
}

/**
 * @deprecated Use `withOrchestratorFilter` instead. This function uses beforeEach
 * which only works for the first test file processed, not subsequent files.
 *
 * Sets up the orchestrator filter as a beforeEach hook.
 * This will skip tests that are not in the current shard.
 *
 * @param test - The test object from @playwright/test
 */
export function setupOrchestratorFilter<T extends object, W extends object>(
  test: TestType<T, W>,
): void {
  // biome-ignore lint/correctness/noEmptyPattern: Playwright requires empty destructuring for fixtures
  test.beforeEach(async ({}, testInfo) => {
    const allowedTestIds = loadShardFile();

    if (allowedTestIds) {
      // CRITICAL: Use project.testDir for consistent path resolution with test-discovery
      // No fallback to process.cwd() - this causes path mismatch bugs
      const testDir = testInfo.project.testDir;

      if (!testDir) {
        throw new Error(
          '[Orchestrator Fixture] Could not determine project testDir. ' +
            'Ensure your playwright.config.ts has projects configured with testDir.',
        );
      }

      const testId = buildTestIdFromRuntime(testInfo.file, testInfo.titlePath, {
        projectName: testInfo.project.name,
        baseDir: testDir,
      });

      const isAllowed = allowedTestIds.has(testId);

      // Debug: Write to stderr for visibility in CI logs
      if (process.env.ORCHESTRATOR_DEBUG === '1') {
        process.stderr.write(
          `[Fixture] testDir=${testInfo.project.testDir} | testId=${testId} | allowed=${isAllowed}\n`,
        );
      }

      if (!isAllowed) {
        test.skip(true, 'Not in shard');
      }
    }
  });
}

/**
 * Check if a test should run based on the shard file.
 * Can be called manually in individual tests.
 *
 * @param testInfo - The testInfo object from Playwright
 * @returns true if the test should run, false if it should be skipped
 * @throws Error if project testDir is not configured
 */
export function shouldRunTest(testInfo: {
  file: string;
  titlePath: string[];
  project: { name: string; testDir: string };
}): boolean {
  const allowedTestIds = loadShardFile();
  if (!allowedTestIds) return true;

  const testId = buildTestIdFromRuntime(testInfo.file, testInfo.titlePath, {
    projectName: testInfo.project.name,
    baseDir: testInfo.project.testDir,
  });

  return allowedTestIds.has(testId);
}
