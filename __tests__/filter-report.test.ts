import { describe, expect, test } from 'bun:test';
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

describe('Filter Report Command', () => {
  function runFilterReport(report: object): object {
    const tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'filter-report-test-'),
    );
    const reportPath = path.join(tmpDir, 'results.json');
    const outputPath = path.join(tmpDir, 'filtered.json');

    try {
      fs.writeFileSync(reportPath, JSON.stringify(report));

      execSync('bun run build', { cwd: process.cwd(), stdio: 'pipe' });
      execSync(
        `node ./bin/run.js filter-report --report-file "${reportPath}" --output-file "${outputPath}"`,
        { cwd: process.cwd(), stdio: 'pipe' },
      );

      return JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
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

  const orchestratorSkipAnnotation = [
    { type: 'skip', description: 'Not in shard' },
  ];

  /**
   * Build a spec whose single test has multiple results (simulates merged blob report).
   * Each entry in `resultEntries` is [status, annotations].
   */
  function makeMergedSpec(
    title: string,
    testStatus: string,
    testAnnotations: Array<{ type: string; description?: string }>,
    resultEntries: Array<{ status: string }>,
  ) {
    return {
      title,
      tests: [
        {
          status: testStatus,
          annotations: testAnnotations,
          results: resultEntries,
        },
      ],
    };
  }

  test('removes orchestrator-skipped tests and preserves genuine skips', () => {
    const report = {
      suites: [
        {
          title: 'a.spec.ts',
          file: 'a.spec.ts',
          suites: [
            {
              title: 'Suite A',
              file: 'a.spec.ts',
              specs: [
                makeSpec('passed test', 'passed'),
                makeSpec(
                  'orchestrator skipped',
                  'skipped',
                  orchestratorSkipAnnotation,
                ),
                makeSpec('user skipped', 'skipped', [
                  { type: 'skip', description: 'not ready yet' },
                ]),
                makeSpec('fixme test', 'skipped', [{ type: 'fixme' }]),
              ],
            },
          ],
        },
      ],
    };

    const result = runFilterReport(report) as {
      suites: Array<{
        suites: Array<{ specs: Array<{ title: string }> }>;
      }>;
    };

    const specs = result.suites[0]?.suites[0]?.specs ?? [];
    const titles = specs.map((s) => s.title);

    expect(titles).toContain('passed test');
    expect(titles).toContain('user skipped');
    expect(titles).toContain('fixme test');
    expect(titles).not.toContain('orchestrator skipped');
    expect(specs).toHaveLength(3);
  });

  test('report with no orchestrator skips is unchanged', () => {
    const report = {
      suites: [
        {
          title: 'b.spec.ts',
          file: 'b.spec.ts',
          suites: [
            {
              title: 'Suite B',
              file: 'b.spec.ts',
              specs: [
                makeSpec('test 1', 'passed'),
                makeSpec('test 2', 'failed'),
                makeSpec('user skipped', 'skipped', [
                  { type: 'skip', description: 'WIP' },
                ]),
              ],
            },
          ],
        },
      ],
    };

    const result = runFilterReport(report) as {
      suites: Array<{
        suites: Array<{ specs: Array<{ title: string }> }>;
      }>;
    };

    const specs = result.suites[0]?.suites[0]?.specs ?? [];
    expect(specs).toHaveLength(3);
  });

  test('prunes empty suites after filtering', () => {
    const report = {
      suites: [
        {
          title: 'all-skipped.spec.ts',
          file: 'all-skipped.spec.ts',
          suites: [
            {
              title: 'All Skipped Suite',
              file: 'all-skipped.spec.ts',
              specs: [
                makeSpec('skip 1', 'skipped', orchestratorSkipAnnotation),
                makeSpec('skip 2', 'skipped', orchestratorSkipAnnotation),
              ],
            },
          ],
        },
        {
          title: 'has-tests.spec.ts',
          file: 'has-tests.spec.ts',
          specs: [makeSpec('real test', 'passed')],
        },
      ],
    };

    const result = runFilterReport(report) as {
      suites: Array<{ title: string }>;
    };

    expect(result.suites).toHaveLength(1);
    expect(result.suites[0]?.title).toBe('has-tests.spec.ts');
  });

  test('merged-tests model: strips orchestrator-skipped results from mixed test', () => {
    // Simulates merge-reports output: 1 test with 3 results (1 passed + 2 skipped)
    const report = {
      suites: [
        {
          title: 'login.spec.ts',
          file: 'login.spec.ts',
          suites: [
            {
              title: 'Login',
              file: 'login.spec.ts',
              specs: [
                makeMergedSpec(
                  'should login',
                  'expected', // merged status reflects best outcome
                  orchestratorSkipAnnotation,
                  [
                    { status: 'passed' },
                    { status: 'skipped' },
                    { status: 'skipped' },
                  ],
                ),
              ],
            },
          ],
        },
      ],
    };

    const result = runFilterReport(report) as {
      suites: Array<{
        suites: Array<{
          specs: Array<{
            title: string;
            tests: Array<{ results: Array<{ status: string }> }>;
          }>;
        }>;
      }>;
    };

    const specs = result.suites[0]?.suites[0]?.specs ?? [];
    expect(specs).toHaveLength(1);
    expect(specs[0]?.title).toBe('should login');
    // Only the passed result should remain
    const results = specs[0]?.tests[0]?.results ?? [];
    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe('passed');
  });

  test('mixed spec: strips orchestrator-skipped tests and results independently', () => {
    // Spec with 2 tests: one with mixed results, one fully orchestrator-skipped
    const report = {
      suites: [
        {
          title: 'dashboard.spec.ts',
          file: 'dashboard.spec.ts',
          suites: [
            {
              title: 'Dashboard',
              file: 'dashboard.spec.ts',
              specs: [
                {
                  title: 'should load',
                  tests: [
                    {
                      status: 'expected',
                      annotations: orchestratorSkipAnnotation,
                      results: [{ status: 'passed' }, { status: 'skipped' }],
                    },
                    {
                      status: 'skipped',
                      annotations: orchestratorSkipAnnotation,
                      results: [{ status: 'skipped' }, { status: 'skipped' }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const result = runFilterReport(report) as {
      suites: Array<{
        suites: Array<{
          specs: Array<{
            title: string;
            tests: Array<{
              status: string;
              results: Array<{ status: string }>;
            }>;
          }>;
        }>;
      }>;
    };

    const specs = result.suites[0]?.suites[0]?.specs ?? [];
    expect(specs).toHaveLength(1);
    // The fully-skipped test should be removed, mixed-result test kept
    const tests = specs[0]?.tests ?? [];
    expect(tests).toHaveLength(1);
    expect(tests[0]?.results).toHaveLength(1);
    expect(tests[0]?.results[0]?.status).toBe('passed');
  });

  test('all-orchestrator-skipped results: removes entire test and spec', () => {
    const report = {
      suites: [
        {
          title: 'removed.spec.ts',
          file: 'removed.spec.ts',
          suites: [
            {
              title: 'Removed',
              file: 'removed.spec.ts',
              specs: [
                makeMergedSpec(
                  'should be removed',
                  'skipped',
                  orchestratorSkipAnnotation,
                  [
                    { status: 'skipped' },
                    { status: 'skipped' },
                    { status: 'skipped' },
                  ],
                ),
              ],
            },
          ],
        },
        {
          title: 'kept.spec.ts',
          file: 'kept.spec.ts',
          specs: [makeSpec('real test', 'passed')],
        },
      ],
    };

    const result = runFilterReport(report) as {
      suites: Array<{ title: string }>;
    };

    expect(result.suites).toHaveLength(1);
    expect(result.suites[0]?.title).toBe('kept.spec.ts');
  });

  test('preserves genuine user-skipped results in merged tests', () => {
    const report = {
      suites: [
        {
          title: 'mix.spec.ts',
          file: 'mix.spec.ts',
          suites: [
            {
              title: 'Mix',
              file: 'mix.spec.ts',
              specs: [
                // User-skipped test (no "Not in shard" annotation)
                makeSpec('user skipped', 'skipped', [
                  { type: 'skip', description: 'not ready yet' },
                ]),
                // Test with mixed results but user-skip annotation (not orchestrator)
                makeMergedSpec(
                  'user skipped with results',
                  'skipped',
                  [{ type: 'skip', description: 'WIP' }],
                  [{ status: 'skipped' }, { status: 'skipped' }],
                ),
              ],
            },
          ],
        },
      ],
    };

    const result = runFilterReport(report) as {
      suites: Array<{
        suites: Array<{
          specs: Array<{
            title: string;
            tests: Array<{ results: Array<{ status: string }> }>;
          }>;
        }>;
      }>;
    };

    const specs = result.suites[0]?.suites[0]?.specs ?? [];
    expect(specs).toHaveLength(2);
    // User-skipped results should be preserved
    expect(specs[0]?.title).toBe('user skipped');
    expect(specs[1]?.title).toBe('user skipped with results');
    expect(specs[1]?.tests[0]?.results).toHaveLength(2);
  });

  test('separate-specs model: continues to remove fully-skipped spec entries', () => {
    // Regression guard: 3 separate spec entries for same test (1 passed, 2 skipped)
    const report = {
      suites: [
        {
          title: 'login.spec.ts',
          file: 'login.spec.ts',
          suites: [
            {
              title: 'Login',
              file: 'login.spec.ts',
              specs: [
                makeSpec('should login', 'passed'),
                makeSpec('should login', 'skipped', orchestratorSkipAnnotation),
                makeSpec('should login', 'skipped', orchestratorSkipAnnotation),
              ],
            },
          ],
        },
      ],
    };

    const result = runFilterReport(report) as {
      suites: Array<{
        suites: Array<{ specs: Array<{ title: string }> }>;
      }>;
    };

    const specs = result.suites[0]?.suites[0]?.specs ?? [];
    expect(specs).toHaveLength(1);
    expect(specs[0]?.title).toBe('should login');
  });
});
