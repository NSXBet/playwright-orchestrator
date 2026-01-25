import * as fs from 'node:fs';
import * as path from 'node:path';
import type { DiscoveredTest, TimingData } from './types.js';
import { parseTestId } from './types.js';

/**
 * Default milliseconds per line for duration estimation
 */
export const DEFAULT_MS_PER_LINE = 100;

/**
 * Default duration for a test when no estimation is possible (30 seconds)
 */
export const DEFAULT_TEST_DURATION = 30000;

/**
 * Count the number of lines in a file
 */
export function countLines(filePath: string): number {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return content.split('\n').length;
  } catch {
    // If file can't be read, return a reasonable default
    return 50;
  }
}

/**
 * Estimate the duration of a test file based on its line count
 *
 * @param filePath - Path to the test file
 * @param msPerLine - Milliseconds per line (default: 100)
 * @returns Estimated duration in milliseconds
 */
export function estimateDuration(
  filePath: string,
  msPerLine: number = DEFAULT_MS_PER_LINE,
): number {
  const lines = countLines(filePath);
  return lines * msPerLine;
}

/**
 * Estimate durations for multiple files
 *
 * @param testDir - Base test directory
 * @param files - List of file paths (relative to testDir)
 * @param msPerLine - Milliseconds per line
 * @returns Map of file paths to estimated durations
 */
export function estimateDurations(
  testDir: string,
  files: string[],
  msPerLine: number = DEFAULT_MS_PER_LINE,
): Map<string, number> {
  const estimates = new Map<string, number>();

  for (const file of files) {
    const fullPath = path.join(testDir, file);
    estimates.set(file, estimateDuration(fullPath, msPerLine));
  }

  return estimates;
}

/**
 * Estimate the duration of a single test using fallback strategy:
 * 1. Same-file average: Use average duration of known tests in the same file
 * 2. Global average: Use average duration across all known tests
 * 3. Default constant: Use DEFAULT_TEST_DURATION (30 seconds)
 *
 * @param testId - Test ID to estimate
 * @param timingData - Existing timing data
 * @returns Estimated duration in milliseconds
 */
export function estimateTestDuration(
  testId: string,
  timingData: TimingData | null,
): number {
  if (!timingData || Object.keys(timingData.tests).length === 0) {
    return DEFAULT_TEST_DURATION;
  }

  const { file } = parseTestId(testId);

  // Strategy 1: Same-file average
  const sameFileTests = Object.entries(timingData.tests).filter(
    ([, data]) => data.file === file,
  );

  if (sameFileTests.length > 0) {
    const sum = sameFileTests.reduce((acc, [, data]) => acc + data.duration, 0);
    return Math.round(sum / sameFileTests.length);
  }

  // Strategy 2: Global average
  const allTests = Object.values(timingData.tests);
  if (allTests.length > 0) {
    const sum = allTests.reduce((acc, data) => acc + data.duration, 0);
    return Math.round(sum / allTests.length);
  }

  // Strategy 3: Default constant
  return DEFAULT_TEST_DURATION;
}

/**
 * Get durations for a list of discovered tests
 *
 * Uses timing data when available, falls back to estimation
 *
 * @param tests - List of discovered tests
 * @param timingData - Existing timing data
 * @returns Array of tests with their durations and estimation flag
 */
export function getTestDurations(
  tests: DiscoveredTest[],
  timingData: TimingData | null,
): Array<{
  testId: string;
  file: string;
  duration: number;
  estimated: boolean;
}> {
  return tests.map((test) => {
    const existing = timingData?.tests[test.testId];

    if (existing) {
      return {
        testId: test.testId,
        file: test.file,
        duration: existing.duration,
        estimated: false,
      };
    }

    return {
      testId: test.testId,
      file: test.file,
      duration: estimateTestDuration(test.testId, timingData),
      estimated: true,
    };
  });
}

/**
 * Calculate average test duration from timing data
 *
 * @param timingData - Timing data
 * @returns Average duration in milliseconds, or DEFAULT_TEST_DURATION if no data
 */
export function calculateAverageTestDuration(
  timingData: TimingData | null,
): number {
  if (!timingData || Object.keys(timingData.tests).length === 0) {
    return DEFAULT_TEST_DURATION;
  }

  const durations = Object.values(timingData.tests).map((t) => t.duration);
  const sum = durations.reduce((acc, d) => acc + d, 0);
  return Math.round(sum / durations.length);
}

/**
 * Calculate average test duration for tests in a specific file
 *
 * @param file - File name
 * @param timingData - Timing data
 * @returns Average duration in milliseconds, or null if no tests found for file
 */
export function calculateFileAverageTestDuration(
  file: string,
  timingData: TimingData | null,
): number | null {
  if (!timingData) {
    return null;
  }

  const fileTests = Object.values(timingData.tests).filter(
    (t) => t.file === file,
  );

  if (fileTests.length === 0) {
    return null;
  }

  const sum = fileTests.reduce((acc, t) => acc + t.duration, 0);
  return Math.round(sum / fileTests.length);
}
