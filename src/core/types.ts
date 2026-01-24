/**
 * Timing data for a single test file (legacy v1 format)
 */
export interface FileTimingData {
  /** Duration in milliseconds */
  duration: number;
  /** Number of times this file has been measured */
  runs: number;
  /** ISO timestamp of last measurement */
  lastRun: string;
}

/**
 * Timing data for a single test (v2 format - test-level)
 */
export interface TestTimingData {
  /** Source file containing this test */
  file: string;
  /** Duration in milliseconds */
  duration: number;
  /** Number of times this test has been measured */
  runs: number;
  /** ISO timestamp of last measurement */
  lastRun: string;
}

/**
 * Complete timing data structure stored in cache (v1 - file-level)
 */
export interface TimingDataV1 {
  /** Schema version (1) */
  version: 1;
  /** ISO timestamp of last update */
  updatedAt: string;
  /** Map of file names to their timing data */
  files: Record<string, FileTimingData>;
}

/**
 * Complete timing data structure stored in cache (v2 - test-level)
 */
export interface TimingDataV2 {
  /** Schema version (2) */
  version: 2;
  /** ISO timestamp of last update */
  updatedAt: string;
  /** Map of test IDs to their timing data */
  tests: Record<string, TestTimingData>;
}

/**
 * Union type for timing data (supports both versions)
 */
export type TimingData = TimingDataV1 | TimingDataV2;

/**
 * Input for the shard assignment algorithm (file-level)
 */
export interface FileWithDuration {
  /** File path (relative to test directory) */
  file: string;
  /** Duration in milliseconds */
  duration: number;
  /** Whether the duration was estimated (no historical data) */
  estimated: boolean;
}

/**
 * Input for the shard assignment algorithm (test-level)
 */
export interface TestWithDuration {
  /** Test ID in format: file::describe::testTitle */
  testId: string;
  /** Source file */
  file: string;
  /** Duration in milliseconds */
  duration: number;
  /** Whether the duration was estimated (no historical data) */
  estimated: boolean;
}

/**
 * Output of the shard assignment algorithm (file-level)
 */
export interface ShardAssignment {
  /** Shard index (1-based) */
  shardIndex: number;
  /** List of test files assigned to this shard */
  files: string[];
  /** Expected total duration in milliseconds */
  expectedDuration: number;
}

/**
 * Output of the shard assignment algorithm (test-level)
 */
export interface TestShardAssignment {
  /** Shard index (1-based) */
  shardIndex: number;
  /** List of test IDs assigned to this shard */
  tests: string[];
  /** Expected total duration in milliseconds */
  expectedDuration: number;
}

/**
 * Complete result from the assign command (file-level)
 */
export interface AssignResult {
  /** Map of shard index to list of files */
  shards: Record<number, string[]>;
  /** Expected duration per shard */
  expectedDurations: Record<number, number>;
  /** Total number of files */
  totalFiles: number;
  /** Files that had no timing data (estimated) */
  estimatedFiles: string[];
}

/**
 * Complete result from the assign command (test-level)
 */
export interface TestAssignResult {
  /** Map of shard index to list of test IDs */
  shards: Record<number, string[]>;
  /** Map of shard index to grep pattern */
  grepPatterns: Record<number, string>;
  /** Map of shard index to test locations (file:line format) */
  testLocations: Record<number, string[]>;
  /** Expected duration per shard */
  expectedDurations: Record<number, number>;
  /** Total number of tests */
  totalTests: number;
  /** Tests that had no timing data (estimated) */
  estimatedTests: string[];
  /** Whether CKK found optimal solution (false = fell back to LPT) */
  isOptimal: boolean;
}

/**
 * Per-shard timing artifact uploaded after test run (file-level, v1)
 */
export interface ShardTimingArtifact {
  /** Shard index (1-based) */
  shard: number;
  /** Browser project name */
  project: string;
  /** Map of file names to duration in ms */
  files: Record<string, number>;
}

/**
 * Per-shard timing artifact uploaded after test run (test-level, v2)
 */
export interface TestShardTimingArtifact {
  /** Shard index (1-based) */
  shard: number;
  /** Browser project name */
  project: string;
  /** Map of test IDs to duration in ms */
  tests: Record<string, number>;
}

/**
 * Information about a discovered test
 */
export interface DiscoveredTest {
  /** Source file path */
  file: string;
  /** Test title */
  title: string;
  /** Full title path (describe blocks + test title) */
  titlePath: string[];
  /** Unique test ID: file::describe::testTitle */
  testId: string;
  /** Line number in source file */
  line: number;
  /** Column number in source file */
  column: number;
}

/**
 * Playwright JSON report structure (relevant fields only)
 */
export interface PlaywrightReport {
  suites: PlaywrightSuite[];
}

export interface PlaywrightSuite {
  title: string;
  file: string;
  suites?: PlaywrightSuite[];
  specs?: PlaywrightSpec[];
}

export interface PlaywrightSpec {
  title: string;
  tests: PlaywrightTest[];
}

export interface PlaywrightTest {
  results: PlaywrightTestResult[];
}

export interface PlaywrightTestResult {
  duration: number;
  status: string;
}

/**
 * Playwright --list JSON output structure
 */
export interface PlaywrightListOutput {
  config: {
    projects: Array<{
      name: string;
      testDir: string;
    }>;
  };
  suites: PlaywrightListSuite[];
}

export interface PlaywrightListSuite {
  title: string;
  file: string;
  suites?: PlaywrightListSuite[];
  specs?: PlaywrightListSpec[];
}

export interface PlaywrightListSpec {
  title: string;
  file: string;
  line: number;
  column: number;
}

/** Current schema version for timing data */
export const TIMING_DATA_VERSION = 2;

/** Legacy schema version */
export const TIMING_DATA_VERSION_V1 = 1;

/**
 * Create an empty timing data structure (v2 - test-level)
 */
export function createEmptyTimingData(): TimingDataV2 {
  return {
    version: TIMING_DATA_VERSION,
    updatedAt: new Date().toISOString(),
    tests: {},
  };
}

/**
 * Create an empty timing data structure (v1 - file-level, for backwards compatibility)
 */
export function createEmptyTimingDataV1(): TimingDataV1 {
  return {
    version: TIMING_DATA_VERSION_V1,
    updatedAt: new Date().toISOString(),
    files: {},
  };
}

/**
 * Build a test ID from file and title path
 * Format: file::describe1::describe2::testTitle
 */
export function buildTestId(file: string, titlePath: string[]): string {
  return [file, ...titlePath].join('::');
}

/**
 * Build a test location from file and line
 * Format: file:line (used for exact test filtering in Playwright)
 */
export function buildTestLocation(file: string, line: number): string {
  return `${file}:${line}`;
}

/**
 * Parse a test ID back to file and title path
 */
export function parseTestId(testId: string): {
  file: string;
  titlePath: string[];
} {
  const parts = testId.split('::');
  return {
    file: parts[0] ?? '',
    titlePath: parts.slice(1),
  };
}

/**
 * Check if timing data is v2 (test-level)
 */
export function isTimingDataV2(data: TimingData): data is TimingDataV2 {
  return data.version === 2;
}

/**
 * Check if timing data is v1 (file-level)
 */
export function isTimingDataV1(data: TimingData): data is TimingDataV1 {
  return data.version === 1;
}
