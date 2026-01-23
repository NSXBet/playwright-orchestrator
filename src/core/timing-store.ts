import * as fs from 'node:fs';
import type {
  FileTimingData,
  ShardTimingArtifact,
  TestShardTimingArtifact,
  TestTimingData,
  TimingData,
  TimingDataV1,
  TimingDataV2,
} from './types.js';
import {
  createEmptyTimingData,
  isTimingDataV1,
  isTimingDataV2,
  TIMING_DATA_VERSION,
  TIMING_DATA_VERSION_V1,
} from './types.js';

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
 * Supports both v1 (file-level) and v2 (test-level) formats.
 *
 * @param filePath - Path to the timing data JSON file
 * @returns Timing data, or empty data if file doesn't exist
 */
export function loadTimingData(filePath: string): TimingData {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(content) as {
      version: number;
      [key: string]: unknown;
    };

    // Handle v1 format
    if (data.version === TIMING_DATA_VERSION_V1) {
      // Return as-is for backwards compatibility
      return data as unknown as TimingDataV1;
    }

    // Handle v2 format
    if (data.version === TIMING_DATA_VERSION) {
      return data as unknown as TimingDataV2;
    }

    // Unknown version - return empty v2 data
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
 * Merge new timing measurements into existing timing data using EMA (v1 - file-level)
 *
 * @param existing - Existing timing data (v1)
 * @param newMeasurements - New measurements from shard artifacts
 * @param alpha - EMA smoothing factor
 * @returns Updated timing data
 */
export function mergeTimingData(
  existing: TimingData,
  newMeasurements: ShardTimingArtifact[],
  alpha: number = DEFAULT_EMA_ALPHA,
): TimingDataV1 {
  const now = new Date().toISOString();

  // Convert v2 to v1 if needed (lossy - just take file names)
  const existingFiles = isTimingDataV1(existing)
    ? existing.files
    : aggregateTestsToFiles(existing);

  const merged: TimingDataV1 = {
    version: TIMING_DATA_VERSION_V1,
    updatedAt: now,
    files: { ...existingFiles },
  };

  for (const artifact of newMeasurements) {
    for (const [file, duration] of Object.entries(artifact.files)) {
      const existingData = merged.files[file];

      if (existingData) {
        // Apply EMA to existing data
        merged.files[file] = {
          duration: calculateEMA(existingData.duration, duration, alpha),
          runs: existingData.runs + 1,
          lastRun: now,
        };
      } else {
        // First measurement for this file
        merged.files[file] = {
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
 * Merge new timing measurements into existing timing data using EMA (v2 - test-level)
 *
 * @param existing - Existing timing data (v2)
 * @param newMeasurements - New measurements from shard artifacts
 * @param alpha - EMA smoothing factor
 * @returns Updated timing data
 */
export function mergeTestTimingData(
  existing: TimingDataV2 | null,
  newMeasurements: TestShardTimingArtifact[],
  alpha: number = DEFAULT_EMA_ALPHA,
): TimingDataV2 {
  const now = new Date().toISOString();

  const merged: TimingDataV2 = {
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
 * Aggregate test-level timing to file-level (for backwards compatibility)
 */
function aggregateTestsToFiles(
  data: TimingDataV2,
): Record<string, FileTimingData> {
  const fileMap = new Map<
    string,
    { totalDuration: number; count: number; lastRun: string }
  >();

  for (const testData of Object.values(data.tests)) {
    const existing = fileMap.get(testData.file);
    if (existing) {
      existing.totalDuration += testData.duration;
      existing.count += 1;
      if (testData.lastRun > existing.lastRun) {
        existing.lastRun = testData.lastRun;
      }
    } else {
      fileMap.set(testData.file, {
        totalDuration: testData.duration,
        count: 1,
        lastRun: testData.lastRun,
      });
    }
  }

  const result: Record<string, FileTimingData> = {};
  for (const [file, stats] of fileMap) {
    result[file] = {
      duration: stats.totalDuration,
      runs: stats.count,
      lastRun: stats.lastRun,
    };
  }

  return result;
}

/**
 * Prune old entries from timing data (v1 - file-level)
 *
 * Removes entries that:
 * 1. Haven't been run in more than `days` days
 * 2. No longer exist in the current test files (if provided)
 *
 * @param data - Timing data to prune
 * @param days - Number of days after which to remove entries
 * @param currentFiles - Optional list of current test files (to remove deleted tests)
 * @returns Pruned timing data
 */
export function pruneTimingData(
  data: TimingData,
  days: number = DEFAULT_PRUNE_DAYS,
  currentFiles?: string[],
): TimingData {
  if (isTimingDataV2(data)) {
    return pruneTestTimingData(data, days, currentFiles);
  }

  const now = new Date();
  const cutoffDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const currentFileSet = currentFiles ? new Set(currentFiles) : null;

  const prunedFiles: Record<string, FileTimingData> = {};

  for (const [file, timing] of Object.entries(data.files)) {
    const lastRun = new Date(timing.lastRun);

    // Skip if too old
    if (lastRun < cutoffDate) {
      continue;
    }

    // Skip if file no longer exists (when currentFiles is provided)
    if (currentFileSet && !currentFileSet.has(file)) {
      continue;
    }

    prunedFiles[file] = timing;
  }

  return {
    ...data,
    updatedAt: new Date().toISOString(),
    files: prunedFiles,
  };
}

/**
 * Prune old entries from timing data (v2 - test-level)
 *
 * @param data - Timing data to prune
 * @param days - Number of days after which to remove entries
 * @param currentTestIds - Optional list of current test IDs (to remove deleted tests)
 * @returns Pruned timing data
 */
export function pruneTestTimingData(
  data: TimingDataV2,
  days: number = DEFAULT_PRUNE_DAYS,
  currentTestIds?: string[],
): TimingDataV2 {
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
 * Get duration for a file from timing data (v1)
 *
 * @param data - Timing data
 * @param file - File name
 * @returns Duration in ms, or undefined if not found
 */
export function getFileDuration(
  data: TimingData,
  file: string,
): number | undefined {
  if (isTimingDataV1(data)) {
    return data.files[file]?.duration;
  }

  // For v2 data, aggregate tests in this file
  const fileTests = Object.entries(data.tests).filter(
    ([, t]) => t.file === file,
  );
  if (fileTests.length === 0) {
    return undefined;
  }

  return fileTests.reduce((sum, [, t]) => sum + t.duration, 0);
}

/**
 * Get duration for a test from timing data (v2)
 *
 * @param data - Timing data (v2)
 * @param testId - Test ID
 * @returns Duration in ms, or undefined if not found
 */
export function getTestDuration(
  data: TimingDataV2,
  testId: string,
): number | undefined {
  return data.tests[testId]?.duration;
}
