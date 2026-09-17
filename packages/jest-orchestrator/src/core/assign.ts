import { assignWithCKK } from "./ckk-algorithm.js";
import { getHistoricalDuration } from "./discovery.js";
import { assignWithLPT } from "./lpt-algorithm.js";
import type { AssignResult, ShardPlan, TestWithDuration, TimingData } from "./types.js";
import { DEFAULT_PROJECT_NAME, identityFromKey, identityKey } from "./types.js";

/** Default duration for Jest tests with no usable timing history (10s). */
export const DEFAULT_TEST_DURATION = 10000;

/**
 * Create scheduling inputs for discovery results that have no measured duration.
 * Kept separate from `assignShards`: callers with measured inputs may legitimately
 * use a zero duration, while a CLI cold start must receive an estimate.
 */
export function createColdStartTests<T extends TestWithDuration>(tests: T[]): T[] {
  return tests.map((test) => ({ ...test, duration: DEFAULT_TEST_DURATION }));
}

export interface AssignOptions {
  tests: TestWithDuration[];
  timings: TimingData | null;
  shards: number;
  /** CKK smoothing budget in ms */
  timeoutMs?: number;
  /**
   * 'file' (default): atomicity unit = whole file; every test in an assigned
   * file runs in the same shard. Duration per file = sum of its tests.
   * 'test': balance per test, shard files may overlap.
   */
  level?: "test" | "file";
}

/**
 * Duration estimate with the fallback chain from
 * playwright-orchestrator: 1) per-test history, 2) same-file average,
 * 3) global average, 4) DEFAULT_TEST_DURATION.
 */
function estimateDuration(timings: TimingData, id: TestWithDuration): number {
  // The store is advisory data: corrupt keys and non-finite durations are
  // skipped everywhere so one bad entry cannot poison the whole plan.
  const known = Object.values(timings.projects[id.project]?.files ?? {}).filter(
    (duration) => Number.isFinite(duration.duration) && duration.duration >= 0,
  );
  if (known.length === 0) return DEFAULT_TEST_DURATION;

  const own = getHistoricalDuration(timings, id);
  if (own !== undefined) return own;

  // Same-file average: entries in the store whose decoded file matches.
  const sameFile: number[] = [];
  for (const [key, data] of Object.entries(timings.projects[id.project]?.files ?? {})) {
    try {
      if (
        identityFromKey(key).file === id.file &&
        Number.isFinite(data.duration) &&
        data.duration >= 0
      ) {
        sameFile.push(data.duration);
      }
    } catch {
      // unparseable key: ignore entry
    }
  }

  if (sameFile.length > 0) {
    return Math.round(sameFile.reduce((sum, duration) => sum + duration, 0) / sameFile.length);
  }

  // Global average.
  const sum = known.reduce((s, d) => s + d.duration, 0);
  return Math.round(sum / known.length);
}

export function assignShards(opts: AssignOptions): AssignResult {
  const { shards } = opts;
  if (shards < 1) throw new RangeError("shards must be >= 1");
  return opts.level === "test" ? assignTestLevel(opts) : assignFileLevel(opts);
}

/**
 * File-level: atomicity unit = whole file. Duration of a file = sum of
 * its tests (from the same per-test store used by test-level), LPT
 * balancing over files. Every discovered test is selected — the shim
 * allowlist simply covers all tests of the shard's files.
 */
function assignFileLevel(opts: AssignOptions): AssignResult {
  const { tests, shards } = opts;

  // Group tests by file, filling missing per-test durations with the same
  // exact-test -> same-file -> global -> default chain as test-level plans.
  const byFile = new Map<string, { file: string; tests: TestWithDuration[]; duration: number }>();
  for (const t of tests) {
    const duration = opts.timings ? estimateDuration(opts.timings, t) : t.duration;
    let entry = byFile.get(t.file);
    if (!entry) {
      entry = { file: t.file, tests: [], duration: 0 };
      byFile.set(t.file, entry);
    }
    entry.tests.push({ ...t, duration });
    entry.duration += duration;
  }

  const assignments = assignWithLPT(
    [...byFile.values()].map((f) => ({
      project: opts.tests[0]?.project ?? DEFAULT_PROJECT_NAME,
      file: f.file,
      fullName: f.file,
      duration: f.duration,
    })),
    shards,
  );

  const testsByFile = new Map([...byFile.values()].map((f) => [f.file, f.tests]));
  const shardPlans: ShardPlan[] = assignments.map((a) => {
    const selection: Array<{ file: string; fullName: string }> = [];
    const testIds: string[] = [];
    for (const unit of a.tests) {
      const fileTests = testsByFile.get(unit.file) ?? [];
      for (const t of fileTests) {
        selection.push({ file: t.file, fullName: t.fullName });
        testIds.push(identityKey(t));
      }
    }
    return {
      shard: a.shard,
      files: a.tests.map((t) => t.file).sort(),
      selection,
      testIds,
      expectedDuration: a.expectedDuration,
    };
  });

  const loads = assignments.map((a) => a.expectedDuration);
  const total = [...byFile.values()].reduce((s, f) => s + f.duration, 0);
  const balanced = loads.length > 0 ? Math.max(...loads) : 0;

  return {
    shards: shardPlans,
    unassigned: [],
    totalTests: tests.length,
    estimatedSavings:
      total > 0 && balanced > 0
        ? Math.max(0, Math.round((1 - total / shards / balanced) * 100))
        : null,
    level: "file",
  };
}

/**
 * Test-level: balance per test; duplicate fullNames collapse into
 * atomic units (the allowlist matches (file, fullName), so equal
 * (file, fullName) pairs cannot be separated).
 */
function assignTestLevel(opts: AssignOptions): AssignResult {
  const { tests, shards } = opts;
  // Collapse duplicates (same file+fullName) into atomic units.
  const byKey = new Map<string, TestWithDuration & { count: number }>();
  for (const t of tests) {
    const key = identityKey(t);
    const existing = byKey.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      byKey.set(key, { ...t, count: 1 });
    }
  }
  const units = [...byKey.values()];

  // timings === null means "trust the input durations" (the caller may
  // have applied the store already); a provided store fills in
  // historical durations using the same fallback chain as
  // playwright-orchestrator: per-test history -> same-file average ->
  // global average -> constant.
  const timed = units.map((u) =>
    opts.timings ? { ...u, duration: estimateDuration(opts.timings, u) } : u,
  );

  const ckk = assignWithCKK(timed, shards, opts.timeoutMs);

  const shardPlans: ShardPlan[] = ckk.assignments.map((a) => {
    const files = [...new Set(a.tests.map((t) => t.file))].sort();
    // One selection entry / testId per ORIGINAL test (units with count
    // > 1 expand back): the shim's allowlist matches by (file,
    // fullName), and each occurrence must be verified as executed.
    const selection: Array<{ file: string; fullName: string }> = [];
    const testIds: string[] = [];
    for (const t of a.tests) {
      const count = (t as unknown as { count?: number }).count ?? 1;
      for (let i = 0; i < count; i++) {
        selection.push({ file: t.file, fullName: t.fullName });
        testIds.push(identityKey(t));
      }
    }
    return {
      shard: a.shard,
      files,
      selection,
      testIds,
      expectedDuration: a.expectedDuration,
    };
  });
  const assignedCount = ckk.assignments.reduce(
    (s, a) =>
      s + a.tests.reduce((s2, t) => s2 + ((t as unknown as { count: number }).count ?? 1), 0),
    0,
  );
  const unassigned = assignedCount < tests.length ? timed : [];

  const loads = ckk.assignments.map((a) => a.expectedDuration);
  const ideal = timed.reduce((s, t) => s + t.duration, 0) / shards;
  const balanced = loads.length > 0 ? Math.max(...loads) : 0;

  return {
    shards: shardPlans,
    unassigned,
    totalTests: tests.length,
    estimatedSavings:
      ideal > 0 && balanced > 0 ? Math.max(0, Math.round((1 - ideal / balanced) * 100)) : null,
    level: "test",
  };
}

/**
 * Post-run verification: executed tests (status passed/failed) must
 * exactly equal the expected selection. Keys are (file, fullName)
 * pairs — fullNames alone can collide across files, and Set-based
 * verification would then pass even if one file never ran the test.
 */
export function verifyShardRun(params: {
  expected: Array<{ file: string; fullName: string }>;
  executed: Array<{ file: string; fullName: string }>;
  shard: number;
}): string[] {
  const key = (f: string, n: string) => `${f}::${n}`;
  const expected = countByKey(params.expected, (item) => key(item.file, item.fullName));
  const executed = countByKey(params.executed, (item) => key(item.file, item.fullName));
  const problems: string[] = [];
  for (const e of params.expected) {
    const id = key(e.file, e.fullName);
    const available = executed.get(id) ?? 0;
    if (available > 0) {
      executed.set(id, available - 1);
    } else {
      problems.push(
        `shard ${params.shard}: expected test was NOT executed: "${e.fullName}" (${e.file})`,
      );
    }
  }
  for (const x of params.executed) {
    const id = key(x.file, x.fullName);
    const available = expected.get(id) ?? 0;
    if (available > 0) {
      expected.set(id, available - 1);
    } else {
      problems.push(
        `shard ${params.shard}: unexpected test WAS executed: "${x.fullName}" (${x.file})`,
      );
    }
  }
  return problems;
}

function countByKey<T>(values: T[], key: (value: T) => string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) {
    const id = key(value);
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}
