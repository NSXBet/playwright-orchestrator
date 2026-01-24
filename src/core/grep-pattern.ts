import { parseTestId } from './types.js';

/**
 * Regex special characters that need escaping in grep patterns
 */
const REGEX_SPECIAL_CHARS = /[.*+?^${}()|[\]\\]/g;

/**
 * Maximum length for a grep pattern before switching to grep-file
 */
export const MAX_GREP_PATTERN_LENGTH = 4000;

/**
 * Escape regex special characters in a string
 *
 * @param str - String to escape
 * @returns Escaped string safe for use in regex
 */
export function escapeRegex(str: string): string {
  return str.replace(REGEX_SPECIAL_CHARS, '\\$&');
}

/**
 * Extract the test title from a test ID
 * The title is the last part of the titlePath
 *
 * @param testId - Test ID in format file::describe::testTitle
 * @returns The test title
 */
export function extractTitleFromTestId(testId: string): string {
  const { titlePath } = parseTestId(testId);
  return titlePath[titlePath.length - 1] || testId;
}

/**
 * Extract the full title path from a test ID
 * The full title path includes all describe blocks and test title,
 * joined with ' › ' as Playwright does internally.
 *
 * @param testId - Test ID in format file::describe::testTitle
 * @returns The full title path (e.g., "BetSlip v2 › should show message")
 */
export function extractFullTitleFromTestId(testId: string): string {
  const { titlePath } = parseTestId(testId);
  return titlePath.join(' › ') || testId;
}

/**
 * Generate a grep pattern from a list of test IDs
 *
 * Uses the full title path (describe blocks + test title) for matching.
 * This ensures exact matching even for tests with the same name in different describe blocks.
 * Escapes regex special characters to ensure exact matching.
 *
 * @param testIds - List of test IDs to include in pattern
 * @returns Grep pattern string that matches any of the tests
 */
export function generateGrepPattern(testIds: string[]): string {
  if (testIds.length === 0) {
    return '';
  }

  const titles = testIds.map((id) => {
    const fullTitle = extractFullTitleFromTestId(id);
    return escapeRegex(fullTitle);
  });

  // Use OR operator to match any of the titles
  return titles.join('|');
}

/**
 * Generate grep patterns for multiple shards
 *
 * @param shardTests - Map of shard index to list of test IDs
 * @returns Map of shard index to grep pattern
 */
export function generateGrepPatterns(
  shardTests: Record<number, string[]>,
): Record<number, string> {
  const patterns: Record<number, string> = {};

  for (const [shardIndex, testIds] of Object.entries(shardTests)) {
    patterns[Number(shardIndex)] = generateGrepPattern(testIds);
  }

  return patterns;
}

/**
 * Check if a grep pattern is too long and should use --grep-file instead
 *
 * @param pattern - Grep pattern to check
 * @returns True if pattern exceeds maximum length
 */
export function isPatternTooLong(pattern: string): boolean {
  return pattern.length > MAX_GREP_PATTERN_LENGTH;
}

/**
 * Generate content for a grep-file (one pattern per line)
 *
 * @param testIds - List of test IDs
 * @returns File content with one escaped full title per line
 */
export function generateGrepFileContent(testIds: string[]): string {
  const titles = testIds.map((id) => {
    const fullTitle = extractFullTitleFromTestId(id);
    return escapeRegex(fullTitle);
  });

  return titles.join('\n');
}

/**
 * Determine the best grep strategy for a list of tests
 *
 * @param testIds - List of test IDs
 * @returns Object with strategy ('pattern' or 'file') and content
 */
export function determineGrepStrategy(testIds: string[]): {
  strategy: 'pattern' | 'file';
  content: string;
} {
  if (testIds.length === 0) {
    return { strategy: 'pattern', content: '' };
  }

  const pattern = generateGrepPattern(testIds);

  if (isPatternTooLong(pattern)) {
    return {
      strategy: 'file',
      content: generateGrepFileContent(testIds),
    };
  }

  return { strategy: 'pattern', content: pattern };
}
