/**
 * Test ID Generation Module
 *
 * Provides shared functions for generating consistent test IDs
 * and converting them to Playwright's --test-list format.
 *
 * @module @nsxbet/playwright-orchestrator/core/test-id
 */

const TEST_LIST_SEPARATOR = ' › ';

/**
 * Minimal test entry for test-list format conversion.
 * Uses the structured data from Playwright's --list JSON directly,
 * avoiding the lossy parseTestId round-trip (test names may contain `::`)
 */
export interface TestListEntry {
  file: string;
  titlePath: string[];
}

/**
 * Convert a test entry to Playwright's --test-list format.
 *
 * Test-list format: `file › describe › test`
 *
 * When testDirPrefix is provided (monorepo case where testDir != rootDir),
 * the prefix is prepended to the file path so paths are relative to rootDir.
 *
 * @param entry - Test entry with file and titlePath from Playwright discovery
 * @param testDirPrefix - Relative path from rootDir to testDir (e.g. `src/test/e2e`)
 * @returns Test-list formatted string (e.g. `src/test/e2e/login.spec.ts › Login › should login`)
 */
export function toTestListFormat(
  entry: TestListEntry,
  testDirPrefix?: string,
): string {
  const cleanPrefix = (testDirPrefix ?? '')
    .replace(/\\/g, '/')
    .replace(/\/+$/, '');
  const normalizedFile = entry.file.replace(/\\/g, '/');
  const fullPath = cleanPrefix
    ? `${cleanPrefix}/${normalizedFile}`
    : normalizedFile;

  return [fullPath, ...entry.titlePath].join(TEST_LIST_SEPARATOR);
}

/**
 * Convert an array of test entries to a complete test-list file content.
 *
 * Each line is one test in Playwright's --test-list format, with a trailing newline.
 * Returns empty string for an empty array.
 *
 * @param entries - Array of test entries from Playwright discovery
 * @param testDirPrefix - Relative path from rootDir to testDir
 * @returns Ready-to-write test-list file content
 */
export function toTestListFile(
  entries: TestListEntry[],
  testDirPrefix?: string,
): string {
  if (entries.length === 0) return '';
  return `${entries.map((e) => toTestListFormat(e, testDirPrefix)).join('\n')}\n`;
}
