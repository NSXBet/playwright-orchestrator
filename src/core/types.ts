/**
 * Timing data for a single test
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
 * Complete timing data structure stored in cache (test-level)
 */
export interface TimingData {
  /** Schema version */
  version: 2;
  /** ISO timestamp of last update */
  updatedAt: string;
  /** Map of test IDs to their timing data */
  tests: Record<string, TestTimingData>;
}

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
 * Per-shard timing artifact uploaded after test run (test-level)
 */
export interface ShardTimingArtifact {
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

/**
 * Create an empty timing data structure
 */
export function createEmptyTimingData(): TimingData {
  return {
    version: TIMING_DATA_VERSION,
    updatedAt: new Date().toISOString(),
    tests: {},
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
