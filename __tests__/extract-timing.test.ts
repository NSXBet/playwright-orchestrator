import { describe, expect, test } from 'bun:test';
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type {
  PlaywrightReport,
  ShardTimingArtifact,
} from '../src/core/types.js';

/**
 * Extract Timing Tests
 *
 * With --test-list filtering, Playwright reports are natively clean.
 * extract-timing extracts ALL tests from the report — no shard-file needed.
 */

describe('Extract Timing Command', () => {
  function runExtractTiming(
    report: PlaywrightReport,
    project = 'default',
  ): ShardTimingArtifact {
    const tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'extract-timing-test-'),
    );
    const reportPath = path.join(tmpDir, 'results.json');
    const outputPath = path.join(tmpDir, 'timing.json');

    try {
      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

      execSync('bun run build', { cwd: process.cwd(), stdio: 'pipe' });
      execSync(
        `node ./bin/run.js extract-timing --report-file "${reportPath}" --output-file "${outputPath}" --shard 1 --project "${project}"`,
        { cwd: process.cwd(), stdio: 'pipe' },
      );

      const output = fs.readFileSync(outputPath, 'utf-8');
      return JSON.parse(output) as ShardTimingArtifact;
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }

  describe('Root suite title excluded from titlePath', () => {
    test('filename does not appear twice in test ID', () => {
      const report: PlaywrightReport = {
        config: {
          rootDir: '/project',
          projects: [
            {
              name: 'Mobile Chrome',
              testDir: '/project/src/test/e2e',
            },
          ],
        },
        suites: [
          {
            title: 'account.spec.ts',
            file: '/project/src/test/e2e/account.spec.ts',
            suites: [
              {
                title: 'Account Page',
                file: '/project/src/test/e2e/account.spec.ts',
                specs: [
                  {
                    title: 'should render initial tab by default',
                    tests: [
                      { results: [{ duration: 1500, status: 'passed' }] },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      };

      const result = runExtractTiming(report, 'Mobile Chrome');

      const expectedTestId =
        'account.spec.ts::Account Page::should render initial tab by default';

      const testIds = Object.keys(result.tests);
      expect(testIds).toHaveLength(1);
      expect(testIds[0]).toBe(expectedTestId);

      const parts = (testIds[0] ?? '').split('::');
      expect(parts[0]).toBe('account.spec.ts');
      expect(parts[1]).not.toBe('account.spec.ts');
    });

    test('nested describe blocks work correctly', () => {
      const report: PlaywrightReport = {
        config: {
          rootDir: '/project',
          projects: [
            {
              name: 'default',
              testDir: '/project/e2e',
            },
          ],
        },
        suites: [
          {
            title: 'login.spec.ts',
            file: '/project/e2e/login.spec.ts',
            suites: [
              {
                title: 'Login',
                file: '/project/e2e/login.spec.ts',
                suites: [
                  {
                    title: 'OAuth',
                    file: '/project/e2e/login.spec.ts',
                    specs: [
                      {
                        title: 'should redirect to provider',
                        tests: [
                          { results: [{ duration: 2000, status: 'passed' }] },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      };

      const result = runExtractTiming(report);

      const expectedTestId =
        'login.spec.ts::Login::OAuth::should redirect to provider';
      const testIds = Object.keys(result.tests);
      expect(testIds[0]).toBe(expectedTestId);
    });
  });

  describe('Path resolution', () => {
    test('file paths are relative to testDir', () => {
      const report: PlaywrightReport = {
        config: {
          rootDir: '/github/workspace/apps/bet-client',
          projects: [
            {
              name: 'Mobile Chrome',
              testDir: '/github/workspace/apps/bet-client/src/test/e2e',
            },
          ],
        },
        suites: [
          {
            title: 'account.spec.ts',
            file: '/github/workspace/apps/bet-client/src/test/e2e/account.spec.ts',
            suites: [
              {
                title: 'Account Page',
                file: '/github/workspace/apps/bet-client/src/test/e2e/account.spec.ts',
                specs: [
                  {
                    title: 'should render',
                    tests: [
                      { results: [{ duration: 1000, status: 'passed' }] },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      };

      const result = runExtractTiming(report, 'Mobile Chrome');
      const testIds = Object.keys(result.tests);
      const testId = testIds[0] ?? '';

      expect(testId.startsWith('../')).toBe(false);
      expect(testId.startsWith('account.spec.ts::')).toBe(true);
    });

    test('deep directory structure resolves correctly', () => {
      const report: PlaywrightReport = {
        config: {
          rootDir: '/workspace/apps/web',
          projects: [
            {
              name: 'default',
              testDir: '/workspace/apps/web/src/test/e2e',
            },
          ],
        },
        suites: [
          {
            title: 'checkout.spec.ts',
            file: '/workspace/apps/web/src/test/e2e/features/checkout.spec.ts',
            suites: [
              {
                title: 'Checkout',
                file: '/workspace/apps/web/src/test/e2e/features/checkout.spec.ts',
                specs: [
                  {
                    title: 'should process payment',
                    tests: [
                      { results: [{ duration: 3000, status: 'passed' }] },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      };

      const result = runExtractTiming(report);
      const expectedTestId =
        'features/checkout.spec.ts::Checkout::should process payment';
      const testIds = Object.keys(result.tests);
      expect(testIds[0]).toBe(expectedTestId);
    });
  });

  describe('Consistency with test-discovery', () => {
    test('produces same IDs as test-discovery', () => {
      const report: PlaywrightReport = {
        config: {
          rootDir: '/project',
          projects: [
            {
              name: 'default',
              testDir: '/project/tests',
            },
          ],
        },
        suites: [
          {
            title: 'api.spec.ts',
            file: '/project/tests/e2e/api.spec.ts',
            suites: [
              {
                title: 'API',
                file: '/project/tests/e2e/api.spec.ts',
                suites: [
                  {
                    title: 'REST',
                    file: '/project/tests/e2e/api.spec.ts',
                    specs: [
                      {
                        title: 'GET /users returns 200',
                        tests: [
                          { results: [{ duration: 500, status: 'passed' }] },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      };

      const result = runExtractTiming(report);
      const expectedTestId =
        'e2e/api.spec.ts::API::REST::GET /users returns 200';
      const testIds = Object.keys(result.tests);
      expect(testIds[0]).toBe(expectedTestId);
    });
  });

  describe('Extracts all tests from clean report', () => {
    test('extracts all tests without shard-file filtering', () => {
      const report: PlaywrightReport = {
        config: {
          rootDir: '/project',
          projects: [{ name: 'default', testDir: '/project/tests' }],
        },
        suites: [
          {
            title: 'a.spec.ts',
            file: '/project/tests/a.spec.ts',
            suites: [
              {
                title: 'A',
                file: '/project/tests/a.spec.ts',
                specs: [
                  {
                    title: 'test 1',
                    tests: [{ results: [{ duration: 100, status: 'passed' }] }],
                  },
                  {
                    title: 'test 2',
                    tests: [{ results: [{ duration: 200, status: 'passed' }] }],
                  },
                ],
              },
            ],
          },
          {
            title: 'b.spec.ts',
            file: '/project/tests/b.spec.ts',
            suites: [
              {
                title: 'B',
                file: '/project/tests/b.spec.ts',
                specs: [
                  {
                    title: 'test 3',
                    tests: [{ results: [{ duration: 300, status: 'passed' }] }],
                  },
                  {
                    title: 'test 4',
                    tests: [{ results: [{ duration: 0, status: 'skipped' }] }],
                  },
                ],
              },
            ],
          },
        ],
      };

      const result = runExtractTiming(report);
      const testIds = Object.keys(result.tests);

      expect(testIds).toHaveLength(4);
      expect(testIds).toContain('a.spec.ts::A::test 1');
      expect(testIds).toContain('a.spec.ts::A::test 2');
      expect(testIds).toContain('b.spec.ts::B::test 3');
      expect(testIds).toContain('b.spec.ts::B::test 4');
    });
  });
});
