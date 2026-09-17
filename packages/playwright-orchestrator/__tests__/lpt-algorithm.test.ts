import { describe, expect, test } from 'bun:test';
import {
  assignWithLPT,
  calculateBalanceRatio,
  formatAssignResult,
} from '../src/core/lpt-algorithm.js';
import type { FileWithDuration } from '../src/core/types.js';

describe('assignWithLPT', () => {
  test('distributes files evenly across shards', () => {
    const files: FileWithDuration[] = [
      { file: 'a.spec.ts', duration: 1000, estimated: false },
      { file: 'b.spec.ts', duration: 1000, estimated: false },
      { file: 'c.spec.ts', duration: 1000, estimated: false },
      { file: 'd.spec.ts', duration: 1000, estimated: false },
    ];

    const result = assignWithLPT(files, 2);

    expect(result).toHaveLength(2);
    expect(result[0]?.files).toHaveLength(2);
    expect(result[1]?.files).toHaveLength(2);
    expect(result[0]?.expectedDuration).toBe(2000);
    expect(result[1]?.expectedDuration).toBe(2000);
  });

  test('assigns longest jobs first', () => {
    const files: FileWithDuration[] = [
      { file: 'a.spec.ts', duration: 3000, estimated: false },
      { file: 'b.spec.ts', duration: 2000, estimated: false },
      { file: 'c.spec.ts', duration: 1000, estimated: false },
    ];

    const result = assignWithLPT(files, 2);

    // Longest goes to shard 1, second longest to shard 2
    // Third goes to shard 2 (smaller load)
    expect(result[0]?.expectedDuration).toBe(3000);
    expect(result[1]?.expectedDuration).toBe(3000);
  });

  test('handles empty file list', () => {
    const result = assignWithLPT([], 3);

    expect(result).toHaveLength(3);
    for (const shard of result) {
      expect(shard.files).toHaveLength(0);
      expect(shard.expectedDuration).toBe(0);
    }
  });

  test('handles single file', () => {
    const files: FileWithDuration[] = [
      { file: 'a.spec.ts', duration: 5000, estimated: false },
    ];

    const result = assignWithLPT(files, 3);

    const totalFiles = result.reduce((sum, s) => sum + s.files.length, 0);
    expect(totalFiles).toBe(1);
    expect(result.find((s) => s.files.length > 0)?.expectedDuration).toBe(5000);
  });

  test('handles more shards than files', () => {
    const files: FileWithDuration[] = [
      { file: 'a.spec.ts', duration: 1000, estimated: false },
      { file: 'b.spec.ts', duration: 2000, estimated: false },
    ];

    const result = assignWithLPT(files, 5);

    expect(result).toHaveLength(5);
    const shardsWithFiles = result.filter((s) => s.files.length > 0);
    expect(shardsWithFiles).toHaveLength(2);
  });

  test('shard indices are 1-based', () => {
    const files: FileWithDuration[] = [
      { file: 'a.spec.ts', duration: 1000, estimated: false },
    ];

    const result = assignWithLPT(files, 3);

    expect(result[0]?.shardIndex).toBe(1);
    expect(result[1]?.shardIndex).toBe(2);
    expect(result[2]?.shardIndex).toBe(3);
  });
});

describe('formatAssignResult', () => {
  test('converts assignments to result format', () => {
    const files: FileWithDuration[] = [
      { file: 'a.spec.ts', duration: 1000, estimated: false },
      { file: 'b.spec.ts', duration: 2000, estimated: true },
    ];

    const assignments = assignWithLPT(files, 2);
    const result = formatAssignResult(assignments, ['b.spec.ts']);

    expect(result.totalFiles).toBe(2);
    expect(result.estimatedFiles).toEqual(['b.spec.ts']);
    expect(Object.keys(result.shards)).toHaveLength(2);
    expect(Object.keys(result.expectedDurations)).toHaveLength(2);
  });
});

describe('calculateBalanceRatio', () => {
  test('returns 1.0 for perfectly balanced shards', () => {
    const files: FileWithDuration[] = [
      { file: 'a.spec.ts', duration: 1000, estimated: false },
      { file: 'b.spec.ts', duration: 1000, estimated: false },
    ];

    const assignments = assignWithLPT(files, 2);
    const ratio = calculateBalanceRatio(assignments);

    expect(ratio).toBe(1.0);
  });

  test('returns ratio for unbalanced shards', () => {
    const files: FileWithDuration[] = [
      { file: 'a.spec.ts', duration: 3000, estimated: false },
      { file: 'b.spec.ts', duration: 1000, estimated: false },
    ];

    const assignments = assignWithLPT(files, 2);
    const ratio = calculateBalanceRatio(assignments);

    expect(ratio).toBe(3.0);
  });

  test('handles empty shards', () => {
    const assignments = assignWithLPT([], 2);
    const ratio = calculateBalanceRatio(assignments);

    expect(ratio).toBe(1.0);
  });
});
