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
});
