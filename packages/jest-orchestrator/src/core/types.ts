/**
 * Core types and identity for @nsxbet/jest-orchestrator
 *
 * A test identity is structured: project + file + fullName.
 * `fullName` is Jest's space-joined ancestor titles + test title
 * (circus `resolveTestCaseStartInfo`: ancestorTitles.join(' ')).
 *
 * Because fullName can contain arbitrary text (including ':', '::', newlines
 * via describe names, etc.), string keys use canonical JSON encoded as
 * base64url instead of a separator-joined string.
 */

export interface TestIdentity {
  /** Jest project displayName; 'default-project' when the config has no projects */
  project: string;
  /** Test file path relative to the project's rootDir, always '/'-separated */
  file: string;
  /** Jest fullName (ancestorTitles.join(' ')) */
  fullName: string;
}

export interface TestTimingData {
  /** EMA-smoothed duration in ms */
  duration: number;
  /** Number of measurements merged */
  runs: number;
  /** ISO timestamp of the last measurement */
  lastRun: string;
}

export interface ProjectTimings {
  files: Record<string, TestTimingData>;
}

export interface TimingData {
  version: number;
  updatedAt: string;
  projects: Record<string, ProjectTimings>;
}

/** Input unit for shard assignment */
export interface TestWithDuration extends TestIdentity {
  duration: number;
}

export interface ShardAssignment {
  shard: number;
  tests: TestWithDuration[];
  expectedDuration: number;
}

/**
 * One shard's executable selection. `selection` carries exact
 * (file, fullName) pairs consumed by the selection shim; files holds
 * the absolute paths to pass to --runTestsByPath.
 */
export interface ShardPlan {
  shard: number;
  files: string[];
  selection: Array<{ file: string; fullName: string }>;
  testIds: string[];
  expectedDuration: number;
}

/** Result of the assign step */
export interface AssignResult {
  shards: ShardPlan[];
  unassigned: TestWithDuration[];
  totalTests: number;
  estimatedSavings: number | null;
  /** Assignment granularity used */
  level: 'test' | 'file';
}

/** Per-shard timing artifact produced after a run */
export interface ShardTimingArtifact {
  project: string;
  shard: number;
  measurements: Array<{
    file: string;
    fullName: string;
    duration: number;
  }>;
}

/** JSON report of a Jest run (subset we consume) */
export interface JestJsonReport {
  numTotalTests: number;
  numPassedTests: number;
  numFailedTests: number;
  numPendingTests: number;
  numTodoTests: number;
  success: boolean;
  testResults: Array<{
    name: string;
    status: string;
    message?: string;
    startTime: number;
    endTime: number;
    assertionResults: Array<{
      ancestorTitles: string[];
      fullName: string;
      title: string;
      status: string;
      duration?: number | null;
      startAt?: number | null;
      failureMessages?: string[];
      location?: { column: number; line: number } | null;
    }>;
  }>;
}

export const TIMING_DATA_VERSION = 1;
export const DEFAULT_PROJECT_NAME = 'default-project';

/**
 * Split user-provided jest args on whitespace. A single quoted value
 * like `--jest-args "--config my.config.js"` must reach jest as two
 * argv tokens; passed verbatim, jest silently ignores the malformed
 * single token.
 */
export function splitJestArgs(args: string[]): string[] {
  return args.flatMap((arg) => arg.split(/\s+/).filter(Boolean));
}

const JSON_ENCODER = new TextEncoder();

/**
 * Canonical JSON key for a test identity (base64url of stable JSON).
 * Used where a flat string key is required (CLI args, store keys).
 */
export function identityKey(id: TestIdentity): string {
  const json = JSON.stringify([id.project, id.file, id.fullName]);
  return base64url(JSON_ENCODER.encode(json));
}

export function identityFromKey(key: string): TestIdentity {
  const json = new TextDecoder().decode(base64urlDecode(key));
  const arr: unknown = JSON.parse(json);
  if (
    !Array.isArray(arr) ||
    arr.length !== 3 ||
    typeof arr[0] !== 'string' ||
    typeof arr[1] !== 'string' ||
    typeof arr[2] !== 'string'
  ) {
    throw new Error(`Invalid identity key: ${key.slice(0, 40)}...`);
  }
  return { project: arr[0], file: arr[1], fullName: arr[2] };
}

function base64url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return Buffer.from(bin, 'binary').toString('base64url');
}

function base64urlDecode(s: string): Uint8Array {
  const bin = Buffer.from(s, 'base64url').toString('binary');
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Never-matching pattern used for discovery.
 * Discovery relies on circus marking pattern-missed tests as 'pending'
 * while still including them in the JSON report.
 */
export const DISCOVERY_PATTERN = '(?!x)x';
