import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import OrchestratorReporter from '../src/reporter.js';

describe('Reporter filterJson option', () => {
  let tmpDir: string;
  let originalEnv: string | undefined;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reporter-filter-test-'));
    originalEnv = process.env.ORCHESTRATOR_SHARD_FILE;
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    if (originalEnv === undefined) {
      delete process.env.ORCHESTRATOR_SHARD_FILE;
    } else {
      process.env.ORCHESTRATOR_SHARD_FILE = originalEnv;
    }
  });

  function writeJsonReport(filePath: string, suites: unknown[]): void {
    fs.writeFileSync(filePath, JSON.stringify({ suites }));
  }

  function writeShardFile(filePath: string, ids: string[]): void {
    fs.writeFileSync(filePath, JSON.stringify(ids));
  }

  function makeSpec(
    title: string,
    status: string,
    annotations: Array<{ type: string; description?: string }> = [],
  ) {
    return {
      title,
      tests: [{ status, annotations, results: [{ duration: 0, status }] }],
    };
  }

  test('onExit keeps only specs whose test IDs are in the shard file', async () => {
    const reportPath = path.join(tmpDir, 'results.json');
    const shardPath = path.join(tmpDir, 'shard.json');

    writeShardFile(shardPath, ['a.spec.ts::A::test 1']);
    writeJsonReport(reportPath, [
      {
        title: 'a.spec.ts',
        file: 'a.spec.ts',
        suites: [
          {
            title: 'A',
            file: 'a.spec.ts',
            specs: [
              makeSpec('test 1', 'passed'),
              makeSpec('orchestrator skip', 'skipped', [
                { type: 'skip', description: 'Not in shard' },
              ]),
            ],
          },
        ],
      },
    ]);

    process.env.ORCHESTRATOR_SHARD_FILE = shardPath;

    const reporter = new OrchestratorReporter({ filterJson: reportPath });

    const mockConfig = {
      rootDir: '/project',
      workers: 1,
      projects: [],
    } as never;
    const mockSuite = { allTests: () => [] } as never;
    reporter.onBegin(mockConfig, mockSuite);

    await reporter.onExit();

    const filtered = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
    const specs = filtered.suites[0]?.suites[0]?.specs ?? [];
    expect(specs).toHaveLength(1);
    expect(specs[0].title).toBe('test 1');
  });

  test('onExit removes genuinely skipped tests not in the shard file', async () => {
    const reportPath = path.join(tmpDir, 'results.json');
    const shardPath = path.join(tmpDir, 'shard.json');

    writeShardFile(shardPath, ['skip-patterns.spec.ts::Active::active test 1']);
    writeJsonReport(reportPath, [
      {
        title: 'skip-patterns.spec.ts',
        file: 'skip-patterns.spec.ts',
        suites: [
          {
            title: 'Active',
            file: 'skip-patterns.spec.ts',
            specs: [makeSpec('active test 1', 'passed')],
          },
          {
            title: 'Skipped Suite',
            file: 'skip-patterns.spec.ts',
            specs: [
              // Genuinely skipped by test.describe.skip — no "Not in shard" annotation
              makeSpec('test in skipped suite', 'skipped'),
              makeSpec('another test in skipped suite', 'skipped'),
            ],
          },
        ],
      },
    ]);

    process.env.ORCHESTRATOR_SHARD_FILE = shardPath;

    const reporter = new OrchestratorReporter({ filterJson: reportPath });

    const mockConfig = {
      rootDir: '/project',
      workers: 1,
      projects: [],
    } as never;
    const mockSuite = { allTests: () => [] } as never;
    reporter.onBegin(mockConfig, mockSuite);

    await reporter.onExit();

    const filtered = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
    expect(filtered.suites).toHaveLength(1);
    // Skipped Suite should be pruned (its specs are not in the shard file)
    expect(filtered.suites[0].suites).toHaveLength(1);
    expect(filtered.suites[0].suites[0].title).toBe('Active');
    expect(filtered.suites[0].suites[0].specs).toHaveLength(1);
    expect(filtered.suites[0].suites[0].specs[0].title).toBe('active test 1');
  });

  test('onExit resolves absolute file paths using testDir from report config', async () => {
    const reportPath = path.join(tmpDir, 'results.json');
    const shardPath = path.join(tmpDir, 'shard.json');
    const testDir = path.join(tmpDir, 'src', 'test', 'e2e');

    writeShardFile(shardPath, ['login.spec.ts::Login::should login']);

    const reportContent = {
      config: {
        projects: [{ name: 'chromium', testDir }],
      },
      suites: [
        {
          title: 'login.spec.ts',
          file: path.join(testDir, 'login.spec.ts'),
          suites: [
            {
              title: 'Login',
              file: path.join(testDir, 'login.spec.ts'),
              specs: [
                makeSpec('should login', 'passed'),
                makeSpec('other shard test', 'skipped', [
                  { type: 'skip', description: 'Not in shard' },
                ]),
              ],
            },
          ],
        },
      ],
    };
    fs.writeFileSync(reportPath, JSON.stringify(reportContent));

    process.env.ORCHESTRATOR_SHARD_FILE = shardPath;

    const reporter = new OrchestratorReporter({ filterJson: reportPath });

    const mockConfig = {
      rootDir: tmpDir,
      workers: 1,
      projects: [{ testDir }],
    } as never;
    const mockSuite = { allTests: () => [] } as never;
    reporter.onBegin(mockConfig, mockSuite);

    await reporter.onExit();

    const filtered = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
    const specs = filtered.suites[0]?.suites[0]?.specs ?? [];
    expect(specs).toHaveLength(1);
    expect(specs[0].title).toBe('should login');
  });

  test('onExit recalculates stats after filtering', async () => {
    const reportPath = path.join(tmpDir, 'results.json');
    const shardPath = path.join(tmpDir, 'shard.json');

    writeShardFile(shardPath, [
      'a.spec.ts::Suite::passes',
      'a.spec.ts::Suite::shard skip',
    ]);

    const reportContent = {
      stats: {
        startTime: '2026-01-01T00:00:00Z',
        duration: 5000,
        expected: 1,
        skipped: 3,
        unexpected: 0,
        flaky: 0,
      },
      suites: [
        {
          title: 'a.spec.ts',
          file: 'a.spec.ts',
          suites: [
            {
              title: 'Suite',
              file: 'a.spec.ts',
              specs: [
                {
                  title: 'passes',
                  tests: [{ status: 'expected', annotations: [], results: [] }],
                },
                {
                  title: 'shard skip',
                  tests: [{ status: 'skipped', annotations: [], results: [] }],
                },
                {
                  title: 'other shard',
                  tests: [{ status: 'skipped', annotations: [], results: [] }],
                },
                {
                  title: 'other shard 2',
                  tests: [{ status: 'skipped', annotations: [], results: [] }],
                },
              ],
            },
          ],
        },
      ],
    };
    fs.writeFileSync(reportPath, JSON.stringify(reportContent));

    process.env.ORCHESTRATOR_SHARD_FILE = shardPath;

    const reporter = new OrchestratorReporter({ filterJson: reportPath });

    const mockConfig = {
      rootDir: '/project',
      workers: 1,
      projects: [],
    } as never;
    const mockSuite = { allTests: () => [] } as never;
    reporter.onBegin(mockConfig, mockSuite);

    await reporter.onExit();

    const filtered = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
    expect(filtered.stats.expected).toBe(1);
    expect(filtered.stats.skipped).toBe(1);
    expect(filtered.stats.unexpected).toBe(0);
    expect(filtered.stats.flaky).toBe(0);
    expect(filtered.stats.startTime).toBe('2026-01-01T00:00:00Z');
    expect(filtered.stats.duration).toBe(5000);
  });

  test('onExit is a no-op when filterJson is omitted', async () => {
    const reportPath = path.join(tmpDir, 'results.json');
    const shardPath = path.join(tmpDir, 'shard.json');

    writeShardFile(shardPath, []);
    writeJsonReport(reportPath, [
      {
        title: 'a.spec.ts',
        file: 'a.spec.ts',
        specs: [
          makeSpec('orchestrator skip', 'skipped', [
            { type: 'skip', description: 'Not in shard' },
          ]),
        ],
      },
    ]);

    process.env.ORCHESTRATOR_SHARD_FILE = shardPath;

    const reporter = new OrchestratorReporter();
    const mockConfig = {
      rootDir: '/project',
      workers: 1,
      projects: [],
    } as never;
    const mockSuite = { allTests: () => [] } as never;
    reporter.onBegin(mockConfig, mockSuite);

    const beforeContent = fs.readFileSync(reportPath, 'utf-8');
    await reporter.onExit();
    const afterContent = fs.readFileSync(reportPath, 'utf-8');

    expect(afterContent).toBe(beforeContent);
  });
});
