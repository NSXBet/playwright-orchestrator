import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  calculateEMA,
  getFileDuration,
  getTestDuration,
  loadTimingData,
  mergeTestTimingData,
  mergeTimingData,
  pruneTestTimingData,
  pruneTimingData,
  saveTimingData,
} from '../src/core/timing-store.js';
import type {
  ShardTimingArtifact,
  TestShardTimingArtifact,
  TimingDataV1,
  TimingDataV2,
} from '../src/core/types.js';

describe('calculateEMA', () => {
  test('calculates EMA correctly with default alpha', () => {
    // alpha = 0.3
    // EMA = 0.3 * 100 + 0.7 * 200 = 30 + 140 = 170
    expect(calculateEMA(200, 100)).toBe(170);
  });

  test('calculates EMA with custom alpha', () => {
    // alpha = 0.5
    // EMA = 0.5 * 100 + 0.5 * 200 = 150
    expect(calculateEMA(200, 100, 0.5)).toBe(150);
  });

  test('weights recent value more with higher alpha', () => {
    const newValue = 100;
    const oldValue = 200;

    const lowAlpha = calculateEMA(oldValue, newValue, 0.1);
    const highAlpha = calculateEMA(oldValue, newValue, 0.9);

    expect(lowAlpha).toBeGreaterThan(highAlpha);
  });

  test('returns rounded integer', () => {
    // 0.3 * 101 + 0.7 * 200 = 30.3 + 140 = 170.3 -> 170
    expect(calculateEMA(200, 101)).toBe(170);
  });
});

describe('file operations', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'timing-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('loadTimingData returns empty data for non-existent file', () => {
    const result = loadTimingData(path.join(tempDir, 'nonexistent.json'));
    expect(result.version).toBe(2);
    expect('tests' in result && Object.keys(result.tests).length).toBe(0);
  });

  test('loadTimingData loads v1 data', () => {
    const data: TimingDataV1 = {
      version: 1,
      updatedAt: '2024-01-01T00:00:00Z',
      files: {
        'a.spec.ts': {
          duration: 1000,
          runs: 1,
          lastRun: '2024-01-01T00:00:00Z',
        },
      },
    };

    const filePath = path.join(tempDir, 'timing.json');
    fs.writeFileSync(filePath, JSON.stringify(data));

    const result = loadTimingData(filePath);
    expect(result.version).toBe(1);
    expect('files' in result && result.files['a.spec.ts']?.duration).toBe(1000);
  });

  test('loadTimingData loads v2 data', () => {
    const data: TimingDataV2 = {
      version: 2,
      updatedAt: '2024-01-01T00:00:00Z',
      tests: {
        'a.spec.ts::test1': {
          file: 'a.spec.ts',
          duration: 1000,
          runs: 1,
          lastRun: '2024-01-01T00:00:00Z',
        },
      },
    };

    const filePath = path.join(tempDir, 'timing.json');
    fs.writeFileSync(filePath, JSON.stringify(data));

    const result = loadTimingData(filePath);
    expect(result.version).toBe(2);
    expect(
      'tests' in result && result.tests['a.spec.ts::test1']?.duration,
    ).toBe(1000);
  });

  test('saveTimingData writes valid JSON', () => {
    const data: TimingDataV2 = {
      version: 2,
      updatedAt: '2024-01-01T00:00:00Z',
      tests: {
        'a.spec.ts::test1': {
          file: 'a.spec.ts',
          duration: 1000,
          runs: 1,
          lastRun: '2024-01-01T00:00:00Z',
        },
      },
    };

    const filePath = path.join(tempDir, 'timing.json');
    saveTimingData(filePath, data);

    const content = fs.readFileSync(filePath, 'utf-8');
    const loaded = JSON.parse(content);
    expect(loaded.version).toBe(2);
  });
});

describe('mergeTimingData (file-level)', () => {
  test('adds new files', () => {
    const existing: TimingDataV1 = {
      version: 1,
      updatedAt: '2024-01-01T00:00:00Z',
      files: {},
    };

    const artifact: ShardTimingArtifact = {
      shard: 1,
      project: 'default',
      files: {
        'a.spec.ts': 1000,
      },
    };

    const result = mergeTimingData(existing, [artifact]);

    expect(result.files['a.spec.ts']?.duration).toBe(1000);
    expect(result.files['a.spec.ts']?.runs).toBe(1);
  });

  test('applies EMA to existing files', () => {
    const existing: TimingDataV1 = {
      version: 1,
      updatedAt: '2024-01-01T00:00:00Z',
      files: {
        'a.spec.ts': {
          duration: 200,
          runs: 5,
          lastRun: '2024-01-01T00:00:00Z',
        },
      },
    };

    const artifact: ShardTimingArtifact = {
      shard: 1,
      project: 'default',
      files: {
        'a.spec.ts': 100,
      },
    };

    const result = mergeTimingData(existing, [artifact]);

    // EMA: 0.3 * 100 + 0.7 * 200 = 170
    expect(result.files['a.spec.ts']?.duration).toBe(170);
    expect(result.files['a.spec.ts']?.runs).toBe(6);
  });
});

describe('mergeTestTimingData', () => {
  test('adds new tests', () => {
    const artifact: TestShardTimingArtifact = {
      shard: 1,
      project: 'default',
      tests: {
        'a.spec.ts::test1': 1000,
      },
    };

    const result = mergeTestTimingData(null, [artifact]);

    expect(result.tests['a.spec.ts::test1']?.duration).toBe(1000);
    expect(result.tests['a.spec.ts::test1']?.runs).toBe(1);
    expect(result.tests['a.spec.ts::test1']?.file).toBe('a.spec.ts');
  });

  test('applies EMA to existing tests', () => {
    const existing: TimingDataV2 = {
      version: 2,
      updatedAt: '2024-01-01T00:00:00Z',
      tests: {
        'a.spec.ts::test1': {
          file: 'a.spec.ts',
          duration: 200,
          runs: 5,
          lastRun: '2024-01-01T00:00:00Z',
        },
      },
    };

    const artifact: TestShardTimingArtifact = {
      shard: 1,
      project: 'default',
      tests: {
        'a.spec.ts::test1': 100,
      },
    };

    const result = mergeTestTimingData(existing, [artifact]);

    // EMA: 0.3 * 100 + 0.7 * 200 = 170
    expect(result.tests['a.spec.ts::test1']?.duration).toBe(170);
    expect(result.tests['a.spec.ts::test1']?.runs).toBe(6);
  });
});

describe('pruneTimingData', () => {
  test('removes old entries', () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 60); // 60 days ago

    const data: TimingDataV1 = {
      version: 1,
      updatedAt: new Date().toISOString(),
      files: {
        'old.spec.ts': {
          duration: 1000,
          runs: 1,
          lastRun: oldDate.toISOString(),
        },
        'recent.spec.ts': {
          duration: 2000,
          runs: 1,
          lastRun: new Date().toISOString(),
        },
      },
    };

    const result = pruneTimingData(data, 30);

    expect('files' in result && result.files['old.spec.ts']).toBeUndefined();
    expect('files' in result && result.files['recent.spec.ts']).toBeDefined();
  });

  test('removes files not in current file list', () => {
    const data: TimingDataV1 = {
      version: 1,
      updatedAt: new Date().toISOString(),
      files: {
        'deleted.spec.ts': {
          duration: 1000,
          runs: 1,
          lastRun: new Date().toISOString(),
        },
        'exists.spec.ts': {
          duration: 2000,
          runs: 1,
          lastRun: new Date().toISOString(),
        },
      },
    };

    const result = pruneTimingData(data, 30, ['exists.spec.ts']);

    expect(
      'files' in result && result.files['deleted.spec.ts'],
    ).toBeUndefined();
    expect('files' in result && result.files['exists.spec.ts']).toBeDefined();
  });
});

describe('pruneTestTimingData', () => {
  test('removes old test entries', () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 60);

    const data: TimingDataV2 = {
      version: 2,
      updatedAt: new Date().toISOString(),
      tests: {
        'old.spec.ts::test1': {
          file: 'old.spec.ts',
          duration: 1000,
          runs: 1,
          lastRun: oldDate.toISOString(),
        },
        'recent.spec.ts::test1': {
          file: 'recent.spec.ts',
          duration: 2000,
          runs: 1,
          lastRun: new Date().toISOString(),
        },
      },
    };

    const result = pruneTestTimingData(data, 30);

    expect(result.tests['old.spec.ts::test1']).toBeUndefined();
    expect(result.tests['recent.spec.ts::test1']).toBeDefined();
  });
});

describe('getFileDuration', () => {
  test('returns duration from v1 data', () => {
    const data: TimingDataV1 = {
      version: 1,
      updatedAt: '2024-01-01T00:00:00Z',
      files: {
        'a.spec.ts': {
          duration: 1000,
          runs: 1,
          lastRun: '2024-01-01T00:00:00Z',
        },
      },
    };

    expect(getFileDuration(data, 'a.spec.ts')).toBe(1000);
    expect(getFileDuration(data, 'nonexistent.spec.ts')).toBeUndefined();
  });
});

describe('getTestDuration', () => {
  test('returns duration from v2 data', () => {
    const data: TimingDataV2 = {
      version: 2,
      updatedAt: '2024-01-01T00:00:00Z',
      tests: {
        'a.spec.ts::test1': {
          file: 'a.spec.ts',
          duration: 1000,
          runs: 1,
          lastRun: '2024-01-01T00:00:00Z',
        },
      },
    };

    expect(getTestDuration(data, 'a.spec.ts::test1')).toBe(1000);
    expect(getTestDuration(data, 'nonexistent')).toBeUndefined();
  });
});
