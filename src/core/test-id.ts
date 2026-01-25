/**
 * Test ID Generation Module
 *
 * This module provides shared functions for generating consistent test IDs
 * across all orchestrator components (fixture, reporter).
 *
 * CRITICAL: All components MUST use these shared functions to ensure
 * test IDs match between shard assignment and runtime filtering.
 *
 * There are two contexts for test ID generation:
 * 1. Discovery context: Uses buildTestId from types.ts (data from Playwright JSON)
 * 2. Runtime context: Uses buildTestIdFromRuntime (data from testInfo.titlePath)
 *
 * @module @nsxbet/playwright-orchestrator/core/test-id
 */

import * as path from 'node:path';

/**
 * Options for filtering runtime titlePath
 */
export interface FilterTitlePathOptions {
  /** Playwright project name to exclude from titlePath */
  projectName?: string;
  /** File name (basename) to exclude from titlePath */
  fileName?: string;
}

/**
 * Filter titlePath from Playwright runtime (testInfo.titlePath) to get only
 * describe blocks and test title.
 *
 * Playwright's runtime titlePath includes:
 * - Project name (e.g., "chromium")
 * - File path or filename
 * - Describe block titles
 * - Test title
 *
 * This function removes non-meaningful elements to produce a clean titlePath
 * that matches what test-discovery produces from Playwright's JSON output.
 *
 * @param titlePath - Raw titlePath from testInfo.titlePath or test.titlePath()
 * @param options - Options for filtering
 * @returns Filtered titlePath containing only describe blocks and test title
 */
export function filterRuntimeTitlePath(
  titlePath: string[],
  options: FilterTitlePathOptions = {},
): string[] {
  const { projectName, fileName } = options;

  return titlePath.filter((title) => {
    // Filter empty strings
    if (!title || title === '') return false;

    // Filter project name
    if (projectName && title === projectName) return false;

    // Filter filename
    if (fileName && title === fileName) return false;

    // Filter out file paths (contain / or \)
    if (title.includes('/') || title.includes('\\')) return false;

    // Filter out spec/test file extensions
    if (title.endsWith('.spec.ts') || title.endsWith('.test.ts')) return false;
    if (title.endsWith('.spec.js') || title.endsWith('.test.js')) return false;

    return true;
  });
}

/**
 * Options for building a test ID from runtime data
 */
export interface BuildTestIdFromRuntimeOptions {
  /** Playwright project name to exclude from titlePath */
  projectName?: string;
  /** Base directory for relative path resolution (testDir or rootDir) */
  baseDir?: string;
}

/**
 * Build a test ID from Playwright runtime data (fixture or reporter context).
 *
 * This function:
 * 1. Converts the absolute file path to relative (using baseDir or cwd)
 * 2. Filters the titlePath to remove project name, filename, and file paths
 * 3. Joins file and filtered titles with "::"
 *
 * The resulting test ID format: {relative-file}::{describe1}::{describe2}::{testTitle}
 *
 * @param filePath - Absolute path to the test file (testInfo.file or test.location.file)
 * @param titlePath - Raw titlePath from testInfo.titlePath or test.titlePath()
 * @param options - Options for path resolution and filtering
 * @returns Test ID string
 *
 * @example
 * ```typescript
 * const testId = buildTestIdFromRuntime(
 *   '/project/e2e/login.spec.ts',
 *   ['chromium', 'login.spec.ts', 'Login', 'should work'],
 *   { projectName: 'chromium', baseDir: '/project' }
 * );
 * // Result: 'e2e/login.spec.ts::Login::should work'
 * ```
 */
export function buildTestIdFromRuntime(
  filePath: string,
  titlePath: string[],
  options: BuildTestIdFromRuntimeOptions = {},
): string {
  const { projectName, baseDir = process.cwd() } = options;

  // Convert absolute path to relative
  const file = path.relative(baseDir, filePath).replace(/\\/g, '/');

  // Get filename for filtering
  const fileName = path.basename(filePath);

  // Filter titlePath
  const filteredTitles = filterRuntimeTitlePath(titlePath, {
    projectName,
    fileName,
  });

  return [file, ...filteredTitles].join('::');
}
