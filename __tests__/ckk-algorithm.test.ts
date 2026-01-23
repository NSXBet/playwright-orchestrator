import { describe, expect, test } from 'bun:test';
import {
  assignWithCKK,
  calculateLowerBound,
} from '../src/core/ckk-algorithm.js';
import type { TestWithDuration } from '../src/core/types.js';

describe('assignWithCKK', () => {
  test('finds optimal or near-optimal solution for small input', () => {
    const tests: TestWithDuration[] = [
      { testId: 'a::test1', file: 'a.spec.ts', duration: 10, estimated: false },
      { testId: 'a::test2', file: 'a.spec.ts', duration: 20, estimated: false },
      { testId: 'b::test1', file: 'b.spec.ts', duration: 30, estimated: false },
      { testId: 'b::test2', file: 'b.spec.ts', duration: 40, estimated: false },
    ];

    const result = assignWithCKK(tests, 2, 1000);

    // Optimal: {40, 10} vs {30, 20} = 50 vs 50
    // The algorithm should find a solution close to optimal
    expect(result.makespan).toBe(50);
    // Either optimal was found, or LPT fallback achieved the same result
    expect(result.assignments).toHaveLength(2);
  });

  test('distributes tests evenly', () => {
    const tests: TestWithDuration[] = [
      {
        testId: 'a::test1',
        file: 'a.spec.ts',
        duration: 100,
        estimated: false,
      },
      {
        testId: 'a::test2',
        file: 'a.spec.ts',
        duration: 100,
        estimated: false,
      },
      {
        testId: 'b::test1',
        file: 'b.spec.ts',
        duration: 100,
        estimated: false,
      },
      {
        testId: 'b::test2',
        file: 'b.spec.ts',
        duration: 100,
        estimated: false,
      },
    ];

    const result = assignWithCKK(tests, 2, 1000);

    expect(result.makespan).toBe(200);
    expect(result.assignments[0]?.expectedDuration).toBe(200);
    expect(result.assignments[1]?.expectedDuration).toBe(200);
  });

  test('handles empty input', () => {
    const result = assignWithCKK([], 3, 100);

    expect(result.assignments).toHaveLength(3);
    expect(result.makespan).toBe(0);
    expect(result.isOptimal).toBe(true);
  });

  test('handles single test', () => {
    const tests: TestWithDuration[] = [
      {
        testId: 'a::test1',
        file: 'a.spec.ts',
        duration: 100,
        estimated: false,
      },
    ];

    const result = assignWithCKK(tests, 2, 100);

    expect(result.makespan).toBe(100);
    expect(result.isOptimal).toBe(true);
  });

  test('handles more shards than tests', () => {
    const tests: TestWithDuration[] = [
      {
        testId: 'a::test1',
        file: 'a.spec.ts',
        duration: 100,
        estimated: false,
      },
      {
        testId: 'b::test1',
        file: 'b.spec.ts',
        duration: 200,
        estimated: false,
      },
    ];

    const result = assignWithCKK(tests, 5, 100);

    expect(result.assignments).toHaveLength(5);
    expect(result.makespan).toBe(200);
    expect(result.isOptimal).toBe(true);
  });

  test('throws on invalid shard count', () => {
    const tests: TestWithDuration[] = [
      {
        testId: 'a::test1',
        file: 'a.spec.ts',
        duration: 100,
        estimated: false,
      },
    ];

    expect(() => assignWithCKK(tests, 0, 100)).toThrow();
  });

  test('falls back to LPT on timeout', () => {
    // Create a moderately complex input that might timeout
    const tests: TestWithDuration[] = Array.from({ length: 30 }, (_, i) => ({
      testId: `test${i}::test`,
      file: `test${i}.spec.ts`,
      duration: Math.floor(Math.random() * 1000) + 100,
      estimated: false,
    }));

    // Very short timeout to force fallback
    const result = assignWithCKK(tests, 5, 1);

    expect(result.assignments).toHaveLength(5);
    // Should still produce valid distribution
    const totalTests = result.assignments.reduce(
      (sum, a) => sum + a.tests.length,
      0,
    );
    expect(totalTests).toBe(30);
  });
});

describe('calculateLowerBound', () => {
  test('returns 0 for empty input', () => {
    expect(calculateLowerBound([], 2)).toBe(0);
  });

  test('returns max single item when larger than average', () => {
    const tests: TestWithDuration[] = [
      {
        testId: 'a::test1',
        file: 'a.spec.ts',
        duration: 100,
        estimated: false,
      },
      { testId: 'b::test1', file: 'b.spec.ts', duration: 10, estimated: false },
    ];

    // Total = 110, shards = 2, average = 55
    // But max single = 100, so lower bound = 100
    expect(calculateLowerBound(tests, 2)).toBe(100);
  });

  test('returns ceiling of average when larger', () => {
    const tests: TestWithDuration[] = [
      { testId: 'a::test1', file: 'a.spec.ts', duration: 50, estimated: false },
      { testId: 'b::test1', file: 'b.spec.ts', duration: 50, estimated: false },
      { testId: 'c::test1', file: 'c.spec.ts', duration: 50, estimated: false },
    ];

    // Total = 150, shards = 2, average = 75
    // Max single = 50, so lower bound = 75
    expect(calculateLowerBound(tests, 2)).toBe(75);
  });
});
