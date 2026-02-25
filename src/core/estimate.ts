import * as fs from 'node:fs';
import * as path from 'node:path';
import type { DiscoveredTest, TimingData } from './types.js';
import { parseTestId } from './types.js';

/**
 * Default file affinity penalty when no timing data exists (30 seconds)
 */
export const DEFAULT_FILE_AFFINITY_PENALTY = 30000;

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
 * Calculate file affinity penalty from timing data.
 *
 * Computes the P25 (25th percentile) of per-file average durations.
 * Falls back to DEFAULT_FILE_AFFINITY_PENALTY when no timing data exists.
 */
export function calculateFileAffinityPenalty(
  timingData: TimingData | null,
): number {
  if (!timingData || Object.keys(timingData.tests).length === 0) {
    return DEFAULT_FILE_AFFINITY_PENALTY;
  }

  // Group tests by file and compute average duration per file
  const fileTests = new Map<string, number[]>();
  for (const test of Object.values(timingData.tests)) {
    const durations = fileTests.get(test.file);
    if (durations) {
      durations.push(test.duration);
    } else {
      fileTests.set(test.file, [test.duration]);
    }
  }

  const fileAverages: number[] = [];
  for (const durations of fileTests.values()) {
    const sum = durations.reduce((acc, d) => acc + d, 0);
    fileAverages.push(sum / durations.length);
  }

  if (fileAverages.length === 0) {
    return DEFAULT_FILE_AFFINITY_PENALTY;
  }

  // P25 of per-file averages
  fileAverages.sort((a, b) => a - b);
  const index = (fileAverages.length - 1) * 0.25;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const lowerVal = fileAverages[lower] ?? 0;
  const upperVal = fileAverages[upper] ?? lowerVal;
  const penalty = lowerVal + (upperVal - lowerVal) * (index - lower);

  return Math.round(penalty);
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
