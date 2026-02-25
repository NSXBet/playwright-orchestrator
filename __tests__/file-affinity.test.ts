import { describe, expect, test } from 'bun:test';
import { assignWithCKK } from '../src/core/ckk-algorithm.js';
import {
  calculateFileAffinityPenalty,
  DEFAULT_FILE_AFFINITY_PENALTY,
} from '../src/core/estimate.js';
import type { TestWithDuration, TimingData } from '../src/core/types.js';

function makeTimingData(
  tests: Record<string, { file: string; duration: number }>,
): TimingData {
  const entries: TimingData['tests'] = {};
  for (const [id, { file, duration }] of Object.entries(tests)) {
    entries[id] = { file, duration, runs: 1, lastRun: '2025-01-01T00:00:00Z' };
  }
  return { version: 2, updatedAt: '2025-01-01T00:00:00Z', tests: entries };
}

describe('calculateFileAffinityPenalty', () => {
  test('returns default when timing data is null', () => {
    expect(calculateFileAffinityPenalty(null)).toBe(
      DEFAULT_FILE_AFFINITY_PENALTY,
    );
  });

  test('returns default when timing data has no tests', () => {
    const td = makeTimingData({});
    expect(calculateFileAffinityPenalty(td)).toBe(
      DEFAULT_FILE_AFFINITY_PENALTY,
    );
  });

  test('computes P25 of per-file averages', () => {
    // file-a avg = (20000+25000+15000)/3 = 20000
    // file-b avg = (40000+50000)/2 = 45000
    // file-c avg = (8000+10000+12000)/3 = 10000
    // file-d avg = (30000+35000)/2 = 32500
    // sorted: [10000, 20000, 32500, 45000]
    // P25: index = 3 * 0.25 = 0.75 → lerp(10000, 20000, 0.75) = 17500
    const td = makeTimingData({
      'a::t1': { file: 'a.spec.ts', duration: 20000 },
      'a::t2': { file: 'a.spec.ts', duration: 25000 },
      'a::t3': { file: 'a.spec.ts', duration: 15000 },
      'b::t1': { file: 'b.spec.ts', duration: 40000 },
      'b::t2': { file: 'b.spec.ts', duration: 50000 },
      'c::t1': { file: 'c.spec.ts', duration: 8000 },
      'c::t2': { file: 'c.spec.ts', duration: 10000 },
      'c::t3': { file: 'c.spec.ts', duration: 12000 },
      'd::t1': { file: 'd.spec.ts', duration: 30000 },
      'd::t2': { file: 'd.spec.ts', duration: 35000 },
    });

    expect(calculateFileAffinityPenalty(td)).toBe(17500);
  });

  test('returns file average when only one file exists', () => {
    const td = makeTimingData({
      'a::t1': { file: 'a.spec.ts', duration: 10000 },
      'a::t2': { file: 'a.spec.ts', duration: 20000 },
    });
    // Single file, avg = 15000, P25 of [15000] = 15000
    expect(calculateFileAffinityPenalty(td)).toBe(15000);
  });

  test('handles two files correctly', () => {
    const td = makeTimingData({
      'a::t1': { file: 'a.spec.ts', duration: 10000 },
      'b::t1': { file: 'b.spec.ts', duration: 30000 },
    });
    // sorted: [10000, 30000]
    // P25: index = 1 * 0.25 = 0.25 → lerp(10000, 30000, 0.25) = 15000
    expect(calculateFileAffinityPenalty(td)).toBe(15000);
  });
});

describe('CKK with file affinity', () => {
  test('groups same-file tests when penalty is large', () => {
    // 4 tests from page-a (10s each) and 4 from page-b (10s each), 2 shards
    // With large penalty, should keep files together
    const tests: TestWithDuration[] = [
      { testId: 'a::t1', file: 'a.spec.ts', duration: 10000, estimated: false },
      { testId: 'a::t2', file: 'a.spec.ts', duration: 10000, estimated: false },
      { testId: 'a::t3', file: 'a.spec.ts', duration: 10000, estimated: false },
      { testId: 'a::t4', file: 'a.spec.ts', duration: 10000, estimated: false },
      { testId: 'b::t1', file: 'b.spec.ts', duration: 10000, estimated: false },
      { testId: 'b::t2', file: 'b.spec.ts', duration: 10000, estimated: false },
      { testId: 'b::t3', file: 'b.spec.ts', duration: 10000, estimated: false },
      { testId: 'b::t4', file: 'b.spec.ts', duration: 10000, estimated: false },
    ];

    const result = assignWithCKK(tests, 2, 1000, 30000);

    // Each shard should have all tests from one file
    for (const assignment of result.assignments) {
      if (assignment.tests.length === 0) continue;
      const files = new Set(assignment.tests.map((id) => id.split('::')[0]));
      expect(files.size).toBe(1);
    }
  });

  test('no penalty produces same result as before', () => {
    const tests: TestWithDuration[] = [
      { testId: 'a::t1', file: 'a.spec.ts', duration: 10, estimated: false },
      { testId: 'a::t2', file: 'a.spec.ts', duration: 20, estimated: false },
      { testId: 'b::t1', file: 'b.spec.ts', duration: 30, estimated: false },
      { testId: 'b::t2', file: 'b.spec.ts', duration: 40, estimated: false },
    ];

    const withPenalty = assignWithCKK(tests, 2, 1000, 0);
    const withoutPenalty = assignWithCKK(tests, 2, 1000);

    expect(withPenalty.makespan).toBe(withoutPenalty.makespan);
  });

  test('output expectedDurations reflect actual durations without penalties', () => {
    const tests: TestWithDuration[] = [
      { testId: 'a::t1', file: 'a.spec.ts', duration: 10000, estimated: false },
      { testId: 'b::t1', file: 'b.spec.ts', duration: 10000, estimated: false },
    ];

    const result = assignWithCKK(tests, 2, 1000, 50000);

    // With penalty=50s, each test on its own shard is best
    // Actual durations should be 10000 each, not inflated
    const totalActual = result.assignments.reduce(
      (sum, a) => sum + a.expectedDuration,
      0,
    );
    expect(totalActual).toBe(20000);
  });

  test('penalty affects LPT shard selection preference', () => {
    // Test the scenario from the spec:
    // shard 1: load 50s, has page-a tests
    // shard 2: load 48s, no page-a tests
    // next test: page-a, 10s, penalty 5s
    // shard 1 effective: 50+10=60, shard 2 effective: 48+10+5=63
    // Should prefer shard 1
    const tests: TestWithDuration[] = [
      // First set up shard loads: large test on shard 1, slightly smaller on shard 2
      {
        testId: 'a::big',
        file: 'a.spec.ts',
        duration: 50000,
        estimated: false,
      },
      {
        testId: 'c::big',
        file: 'c.spec.ts',
        duration: 48000,
        estimated: false,
      },
      // Now the test that should go to shard 1 (with page-a)
      {
        testId: 'a::small',
        file: 'a.spec.ts',
        duration: 10000,
        estimated: false,
      },
    ];

    const result = assignWithCKK(tests, 2, 1000, 5000);

    // Find which shard has a::big
    const shardWithA = result.assignments.find((a) =>
      a.tests.includes('a::big'),
    );
    // a::small should be on the same shard
    expect(shardWithA?.tests).toContain('a::small');
  });

  test('allows file split when makespan benefit exceeds penalty', () => {
    // heavy.spec.ts: 120s + 60s = 180s
    // light.spec.ts: 10s + 10s = 20s
    // With small penalty (5s), splitting heavy across shards is worth it
    const tests: TestWithDuration[] = [
      {
        testId: 'h::t1',
        file: 'heavy.spec.ts',
        duration: 120000,
        estimated: false,
      },
      {
        testId: 'h::t2',
        file: 'heavy.spec.ts',
        duration: 60000,
        estimated: false,
      },
      {
        testId: 'l::t1',
        file: 'light.spec.ts',
        duration: 10000,
        estimated: false,
      },
      {
        testId: 'l::t2',
        file: 'light.spec.ts',
        duration: 10000,
        estimated: false,
      },
    ];

    const result = assignWithCKK(tests, 2, 1000, 5000);

    // Optimal without penalty: {120, 10, 10} vs {60} = 140 vs 60
    // Better: {120} vs {60, 10, 10} = 120 vs 80
    // With 5s penalty, splitting heavy is still better than keeping together
    // Makespan should be close to 100 (optimal: {120} vs {60+10+10}=80)
    expect(result.makespan).toBeLessThanOrEqual(125000);
  });
});

describe('CKK dedup with file affinity', () => {
  test('explores shards with same load but different file sets', () => {
    // Setup: two shards with equal load but different files
    // Shard A: page-x (50s), Shard B: page-y (50s)
    // Next test: page-x (10s), penalty 30s
    // Without dedup fix: might skip shard B (same load) and miss that
    // shard A is better (no penalty for page-x)
    const tests: TestWithDuration[] = [
      {
        testId: 'x::t1',
        file: 'page-x.spec.ts',
        duration: 50000,
        estimated: false,
      },
      {
        testId: 'y::t1',
        file: 'page-y.spec.ts',
        duration: 50000,
        estimated: false,
      },
      {
        testId: 'x::t2',
        file: 'page-x.spec.ts',
        duration: 10000,
        estimated: false,
      },
    ];

    const result = assignWithCKK(tests, 2, 1000, 30000);

    // x::t2 should be on the same shard as x::t1 (no penalty)
    const shardWithX1 = result.assignments.find((a) =>
      a.tests.includes('x::t1'),
    );
    expect(shardWithX1?.tests).toContain('x::t2');
  });
});

describe('CKK secondary sort', () => {
  test('groups same-file tests adjacently via secondary sort', () => {
    // All tests have equal duration, so secondary sort by file matters
    const tests: TestWithDuration[] = [
      { testId: 'b::t1', file: 'b.spec.ts', duration: 10000, estimated: false },
      { testId: 'a::t1', file: 'a.spec.ts', duration: 10000, estimated: false },
      { testId: 'b::t2', file: 'b.spec.ts', duration: 10000, estimated: false },
      { testId: 'a::t2', file: 'a.spec.ts', duration: 10000, estimated: false },
    ];

    const result = assignWithCKK(tests, 2, 1000, 30000);

    // With secondary sort by file, same-file tests should be adjacent
    // and assigned together. Each shard should have one file.
    for (const assignment of result.assignments) {
      if (assignment.tests.length === 0) continue;
      const files = new Set(assignment.tests.map((id) => id.split('::')[0]));
      expect(files.size).toBe(1);
    }
  });
});

describe('LPT tiebreaking', () => {
  test('prefers shard with same file when loads are equal', () => {
    // Two shards with equal load, one has page-a, the other has page-b
    // Next test from page-a should go to the shard with page-a
    const tests: TestWithDuration[] = [
      {
        testId: 'a::t1',
        file: 'a.spec.ts',
        duration: 30000,
        estimated: false,
      },
      {
        testId: 'b::t1',
        file: 'b.spec.ts',
        duration: 30000,
        estimated: false,
      },
      // This test should go to shard with a::t1 (tiebreaker)
      {
        testId: 'a::t2',
        file: 'a.spec.ts',
        duration: 10000,
        estimated: false,
      },
      // This test should go to shard with b::t1 (tiebreaker)
      {
        testId: 'b::t2',
        file: 'b.spec.ts',
        duration: 10000,
        estimated: false,
      },
    ];

    const result = assignWithCKK(tests, 2, 1000, 5000);

    const shardWithA1 = result.assignments.find((a) =>
      a.tests.includes('a::t1'),
    );
    const shardWithB1 = result.assignments.find((a) =>
      a.tests.includes('b::t1'),
    );
    expect(shardWithA1?.tests).toContain('a::t2');
    expect(shardWithB1?.tests).toContain('b::t2');
  });
});

describe('Penalty amortization', () => {
  test('last remaining test from file gets reduced penalty', () => {
    // file-a has 5 tests. If 4 are already on shard 1,
    // the 5th should have a small penalty for going to shard 2
    // (amortized: 30s * 1/5 = 6s)
    //
    // We set up so that without amortization the last test would stay
    // on shard 1 (full 30s penalty to shard 2), but with amortization
    // it can move to shard 2 (only 6s penalty) for better balance
    const tests: TestWithDuration[] = [
      { testId: 'a::t1', file: 'a.spec.ts', duration: 20000, estimated: false },
      { testId: 'a::t2', file: 'a.spec.ts', duration: 20000, estimated: false },
      { testId: 'a::t3', file: 'a.spec.ts', duration: 20000, estimated: false },
      { testId: 'a::t4', file: 'a.spec.ts', duration: 20000, estimated: false },
      { testId: 'a::t5', file: 'a.spec.ts', duration: 20000, estimated: false },
      { testId: 'b::t1', file: 'b.spec.ts', duration: 50000, estimated: false },
    ];

    const result = assignWithCKK(tests, 2, 1000, 30000);

    // With amortization, the algorithm can split a::t5 to shard 2
    // since the penalty for the last test is only 6s (30 * 1/5)
    // Optimal: shard1={a::t1..t4}=80s, shard2={b::t1,a::t5}=70s
    // vs keeping together: shard1={a::t1..t5}=100s, shard2={b::t1}=50s
    expect(result.makespan).toBeLessThanOrEqual(85000);
  });

  test('full penalty for first test from a many-test file', () => {
    // When all tests from a file are unassigned, the penalty should be
    // the full amount (remaining/total = 1.0)
    const tests: TestWithDuration[] = [
      { testId: 'a::t1', file: 'a.spec.ts', duration: 10000, estimated: false },
      { testId: 'b::t1', file: 'b.spec.ts', duration: 10000, estimated: false },
    ];

    // With large penalty, each file should stay on its own shard
    const result = assignWithCKK(tests, 2, 1000, 50000);
    const totalActual = result.assignments.reduce(
      (sum, a) => sum + a.expectedDuration,
      0,
    );
    expect(totalActual).toBe(20000);
  });
});

describe('CKK lower bound with penalties', () => {
  test('prunes branches accounting for new file penalties', () => {
    // Many files with small tests. Without penalty-aware lower bound,
    // CKK would explore many branches. With it, it prunes faster.
    // We verify the result is still correct and isOptimal.
    const tests: TestWithDuration[] = [];
    for (let i = 0; i < 10; i++) {
      tests.push({
        testId: `f${i}::t1`,
        file: `f${i}.spec.ts`,
        duration: 10000,
        estimated: false,
      });
    }

    const result = assignWithCKK(tests, 2, 2000, 5000);

    // Should still produce a valid assignment
    const totalTests = result.assignments.reduce(
      (sum, a) => sum + a.tests.length,
      0,
    );
    expect(totalTests).toBe(10);
    // Actual makespan: 5 tests per shard = 50000
    expect(result.makespan).toBe(50000);
  });
});

describe('CKK defensive copy of fileRemaining', () => {
  test('LPT does not corrupt fileRemaining for CKK search', () => {
    // If fileRemaining were shared without copy, LPT would decrement it
    // and CKK would start with wrong remaining counts.
    // This test verifies CKK still produces correct results by checking
    // that penalty amortization works correctly (depends on correct remaining).
    const tests: TestWithDuration[] = [
      { testId: 'a::t1', file: 'a.spec.ts', duration: 30000, estimated: false },
      { testId: 'a::t2', file: 'a.spec.ts', duration: 30000, estimated: false },
      { testId: 'a::t3', file: 'a.spec.ts', duration: 30000, estimated: false },
      { testId: 'b::t1', file: 'b.spec.ts', duration: 30000, estimated: false },
      { testId: 'b::t2', file: 'b.spec.ts', duration: 30000, estimated: false },
      { testId: 'b::t3', file: 'b.spec.ts', duration: 30000, estimated: false },
    ];

    const result = assignWithCKK(tests, 2, 1000, 20000);

    // With correct remaining counts and penalty, files should group
    for (const assignment of result.assignments) {
      if (assignment.tests.length === 0) continue;
      const files = new Set(assignment.tests.map((id) => id.split('::')[0]));
      expect(files.size).toBe(1);
    }
    // Each shard gets 3 tests = 90000 actual
    expect(result.makespan).toBe(90000);
  });
});
