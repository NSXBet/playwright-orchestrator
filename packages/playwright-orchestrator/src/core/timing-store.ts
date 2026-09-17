import * as fs from 'node:fs';
import type {
  ShardTimingArtifact,
  TestTimingData,
  TimingData,
} from './types.js';
import { createEmptyTimingData, TIMING_DATA_VERSION } from './types.js';

/**
 * Default EMA smoothing factor (alpha)
 * Higher values give more weight to recent measurements
 */
export const DEFAULT_EMA_ALPHA = 0.3;

/**
 * Default number of days after which to prune old entries
 */
export const DEFAULT_PRUNE_DAYS = 30;

/**
 * Load timing data from a JSON file
 *
 * @param filePath - Path to the timing data JSON file
 * @returns Timing data, or empty data if file doesn't exist or is invalid
 */
export function loadTimingData(filePath: string): TimingData {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(content) as {
      version: number;
      [key: string]: unknown;
    };

    // Only accept current version
    if (data.version === TIMING_DATA_VERSION) {
      return data as unknown as TimingData;
    }

    // Unknown or old version - return empty data
    console.warn(
      `Timing data version mismatch: expected ${TIMING_DATA_VERSION}, got ${data.version}. Using empty data.`,
    );
    return createEmptyTimingData();
  } catch {
    // File doesn't exist or is invalid - return empty data
    return createEmptyTimingData();
  }
}

/**
 * Save timing data to a JSON file
 */
export function saveTimingData(filePath: string, data: TimingData): void {
  const content = JSON.stringify(data, null, 2);
  fs.writeFileSync(filePath, content, 'utf-8');
}

/**
 * Calculate Exponential Moving Average for duration
 *
 * Formula: newDuration = α * measuredDuration + (1 - α) * oldDuration
 *
 * @param oldDuration - Previous duration value
 * @param newDuration - New measured duration
 * @param alpha - Smoothing factor (0-1), higher = more weight on new value
 */
export function calculateEMA(
  oldDuration: number,
  newDuration: number,
  alpha: number = DEFAULT_EMA_ALPHA,
): number {
  return Math.round(alpha * newDuration + (1 - alpha) * oldDuration);
}

/**
 * Merge new timing measurements into existing timing data using EMA
 *
 * @param existing - Existing timing data (or null for fresh start)
 * @param newMeasurements - New measurements from shard artifacts
 * @param alpha - EMA smoothing factor
 * @returns Updated timing data
 */
export function mergeTimingData(
  existing: TimingData | null,
  newMeasurements: ShardTimingArtifact[],
  alpha: number = DEFAULT_EMA_ALPHA,
): TimingData {
  const now = new Date().toISOString();

  const merged: TimingData = {
    version: TIMING_DATA_VERSION,
    updatedAt: now,
    tests: existing ? { ...existing.tests } : {},
  };

  for (const artifact of newMeasurements) {
    for (const [testId, duration] of Object.entries(artifact.tests)) {
      const existingData = merged.tests[testId];
      const file = extractFileFromTestId(testId);

      if (existingData) {
        // Apply EMA to existing data
        merged.tests[testId] = {
          file: existingData.file,
          duration: calculateEMA(existingData.duration, duration, alpha),
          runs: existingData.runs + 1,
          lastRun: now,
        };
      } else {
        // First measurement for this test
        merged.tests[testId] = {
          file,
          duration,
          runs: 1,
          lastRun: now,
        };
      }
    }
  }

  return merged;
}

/**
 * Extract file name from test ID
 */
function extractFileFromTestId(testId: string): string {
  const parts = testId.split('::');
  return parts[0] ?? '';
}

/**
 * Prune old entries from timing data
 *
 * Removes entries that:
 * 1. Haven't been run in more than `days` days
 * 2. No longer exist in the current tests (if provided)
 *
 * @param data - Timing data to prune
 * @param days - Number of days after which to remove entries
 * @param currentTestIds - Optional list of current test IDs (to remove deleted tests)
 * @returns Pruned timing data
 */
export function pruneTimingData(
  data: TimingData,
  days: number = DEFAULT_PRUNE_DAYS,
  currentTestIds?: string[],
): TimingData {
  const now = new Date();
  const cutoffDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const currentTestSet = currentTestIds ? new Set(currentTestIds) : null;

  const prunedTests: Record<string, TestTimingData> = {};

  for (const [testId, timing] of Object.entries(data.tests)) {
    const lastRun = new Date(timing.lastRun);

    // Skip if too old
    if (lastRun < cutoffDate) {
      continue;
    }

    // Skip if test no longer exists (when currentTestIds is provided)
    if (currentTestSet && !currentTestSet.has(testId)) {
      continue;
    }

    prunedTests[testId] = timing;
  }

  return {
    ...data,
    updatedAt: new Date().toISOString(),
    tests: prunedTests,
  };
}

/**
 * Get duration for a test from timing data
 *
 * @param data - Timing data
 * @param testId - Test ID
 * @returns Duration in ms, or undefined if not found
 */
export function getTestDuration(
  data: TimingData,
  testId: string,
): number | undefined {
  return data.tests[testId]?.duration;
}

/**
 * Get total duration for a file by aggregating all tests in that file
 *
 * @param data - Timing data
 * @param file - File path
 * @returns Total duration in ms, or undefined if no tests found
 */
export function getFileDuration(
  data: TimingData,
  file: string,
): number | undefined {
  const fileTests = Object.entries(data.tests).filter(
    ([, t]) => t.file === file,
  );
  if (fileTests.length === 0) {
    return undefined;
  }

  return fileTests.reduce((sum, [, t]) => sum + t.duration, 0);
}
