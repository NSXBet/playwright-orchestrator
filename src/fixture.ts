/**
 * Playwright Orchestrator Fixture
 *
 * A Playwright fixture that filters tests based on a JSON shard file.
 * This provides actual test skipping (unlike the reporter which only adds metadata).
 *
 * Usage in your test setup file (e.g., tests/setup.ts):
 * ```typescript
 * import { test } from '@playwright/test';
 * import { setupOrchestratorFilter } from '@nsxbet/playwright-orchestrator/fixture';
 *
 * setupOrchestratorFilter(test);
 * ```
 *
 * Environment variables:
 * - ORCHESTRATOR_SHARD_FILE: Path to JSON file with array of test IDs
 * - ORCHESTRATOR_DEBUG: Set to "1" to enable debug logging
 *
 * @module @nsxbet/playwright-orchestrator/fixture
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { TestType } from '@playwright/test';

// Module initialization debug - this runs when the module is first imported
process.stderr.write(
  '[Fixture Module] Loading @nsxbet/playwright-orchestrator/fixture\n',
);

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
    process.stderr.write(
      `[Fixture] Loaded ${testIds.length} tests for this shard\n`,
    );
    // Also log first 3 test IDs for debugging
    if (process.env.ORCHESTRATOR_DEBUG === '1') {
      process.stderr.write(
        `[Fixture] Sample IDs from shard file: ${testIds.slice(0, 3).join(' | ')}\n`,
      );
    }
    return cachedAllowedTestIds;
  } catch (error) {
    console.error('[Orchestrator] Failed to load shard file:', error);
    throw error;
  }
}

function buildTestId(
  filePath: string,
  titlePath: string[],
  projectName?: string,
  testDir?: string,
): string {
  // Use testDir from project config if available, otherwise fall back to cwd
  // This ensures paths match what test-discovery produces from Playwright's JSON output
  const baseDir = testDir || process.cwd();
  const file = path.relative(baseDir, filePath).replace(/\\/g, '/');
  const fileName = path.basename(filePath);

  // Filter titlePath to exclude project name, filename, empty strings, and file paths
  // This MUST match the filtering logic in reporter.ts and test-discovery.ts
  const filteredTitles = titlePath.filter((title) => {
    if (!title || title === '') return false;
    if (title === projectName) return false;
    if (title === fileName) return false;
    // Filter out file paths (contain / or \ or end with .spec.ts/.test.ts)
    if (title.includes('/') || title.includes('\\')) return false;
    if (title.endsWith('.spec.ts') || title.endsWith('.test.ts')) return false;
    if (title.endsWith('.spec.js') || title.endsWith('.test.js')) return false;
    return true;
  });

  return [file, ...filteredTitles].join('::');
}

/**
 * Sets up the orchestrator filter as a beforeEach hook.
 * This will skip tests that are not in the current shard.
 *
 * @param test - The test object from @playwright/test
 */
export function setupOrchestratorFilter<T extends object, W extends object>(
  test: TestType<T, W>,
): void {
  process.stderr.write('[Fixture] setupOrchestratorFilter called\n');

  // biome-ignore lint/correctness/noEmptyPattern: Playwright requires empty destructuring for fixtures
  test.beforeEach(async ({}, testInfo) => {
    process.stderr.write(
      `[Fixture] beforeEach running for: ${testInfo.title}\n`,
    );
    const allowedTestIds = loadShardFile();

    if (allowedTestIds) {
      // Use project.testDir for consistent path resolution with test-discovery
      const testId = buildTestId(
        testInfo.file,
        testInfo.titlePath,
        testInfo.project.name,
        testInfo.project.testDir,
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
  });
}

/**
 * Check if a test should run based on the shard file.
 * Can be called manually in individual tests.
 *
 * @param testInfo - The testInfo object from Playwright
 * @returns true if the test should run, false if it should be skipped
 */
export function shouldRunTest(testInfo: {
  file: string;
  titlePath: string[];
  project: { name: string; testDir?: string };
}): boolean {
  const allowedTestIds = loadShardFile();
  if (!allowedTestIds) return true;

  const testId = buildTestId(
    testInfo.file,
    testInfo.titlePath,
    testInfo.project.name,
    testInfo.project.testDir,
  );

  return allowedTestIds.has(testId);
}
