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
 * These tests verify that extract-timing produces consistent test IDs
 * that match what test-discovery produces.
 *
 * CRITICAL BUG: Root-level suite titles (filename) should NOT be included
 * in the test ID titlePath, matching test-discovery behavior.
 */

describe('Extract Timing Command', () => {
  /**
   * Helper to run extract-timing command with a mock Playwright report
   */
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

      // Build and run the command
      execSync('bun run build', { cwd: process.cwd(), stdio: 'pipe' });
      execSync(
        `node ./bin/run.js extract-timing --report-file "${reportPath}" --output-file "${outputPath}" --shard 1 --project "${project}"`,
        { cwd: process.cwd(), stdio: 'pipe' },
      );

      const output = fs.readFileSync(outputPath, 'utf-8');
      return JSON.parse(output) as ShardTimingArtifact;
    } finally {
      // Cleanup
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }

  describe('BUG: Root suite title should be excluded from titlePath', () => {
    test('FAILS: filename appears twice in test ID (root suite title not filtered)', () => {
      /**
       * This test exposes the bug where root-level suite title (which is the filename)
       * is included in the test ID, causing duplicate filename like:
       *
       * EXPECTED: account.spec.ts::Account Page::should render
       * ACTUAL:   account.spec.ts::account.spec.ts::Account Page::should render
       */
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
            title: 'account.spec.ts', // Root suite title = filename (should be skipped)
            file: '/project/src/test/e2e/account.spec.ts',
            suites: [
              {
                title: 'Account Page', // Describe block
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

      // The test ID should NOT include the filename in titlePath
      // CORRECT format: file::describe::testTitle
      const expectedTestId =
        'account.spec.ts::Account Page::should render initial tab by default';

      // BUG: Currently produces:
      // account.spec.ts::account.spec.ts::Account Page::should render initial tab by default
      //                 ^^^^^^^^^^^^^^^^^ <-- This should NOT be here

      const testIds = Object.keys(result.tests);
      expect(testIds).toHaveLength(1);

      // This assertion will FAIL, exposing the bug
      expect(testIds[0]).toBe(expectedTestId);

      // Additional check: filename should NOT appear twice in the test ID
      const testId = testIds[0] ?? '';
      const parts = testId.split('::');
      expect(parts[0]).toBe('account.spec.ts'); // File path
      expect(parts[1]).not.toBe('account.spec.ts'); // Should be describe block, NOT filename again
    });

    test('FAILS: nested describe blocks work but root suite title leaks', () => {
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
            title: 'login.spec.ts', // Root suite = filename
            file: '/project/e2e/login.spec.ts',
            suites: [
              {
                title: 'Login', // Describe
                file: '/project/e2e/login.spec.ts',
                suites: [
                  {
                    title: 'OAuth', // Nested describe
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

      // EXPECTED: login.spec.ts::Login::OAuth::should redirect to provider
      // BUG produces: login.spec.ts::login.spec.ts::Login::OAuth::should redirect to provider
      const expectedTestId =
        'login.spec.ts::Login::OAuth::should redirect to provider';

      const testIds = Object.keys(result.tests);
      expect(testIds[0]).toBe(expectedTestId);
    });
  });

  describe('BUG: Path mismatch produces ../../../ relative paths', () => {
    test('FAILS: testDir vs suite.file path mismatch causes incorrect relative path', () => {
      /**
       * This test exposes the bug where if testDir and suite.file have
       * different path structures, path.relative() produces incorrect
       * traversal paths like "../../../../../account.spec.ts"
       *
       * This happens when:
       * - testDir is resolved from config relative to one directory
       * - suite.file is stored as absolute path from a different root
       */
      const report: PlaywrightReport = {
        config: {
          rootDir: '/github/workspace/apps/bet-client',
          projects: [
            {
              name: 'Mobile Chrome',
              // testDir resolved from playwright.config.ts location
              testDir: '/github/workspace/apps/bet-client/src/test/e2e',
            },
          ],
        },
        suites: [
          {
            title: 'account.spec.ts',
            // File path is correct relative to testDir
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

      // EXPECTED: account.spec.ts::Account Page::should render
      // (without the duplicate filename bug, see previous tests)
      const testIds = Object.keys(result.tests);
      const testId = testIds[0] ?? '';

      // The file path should NOT contain "../" traversals
      expect(testId.startsWith('../')).toBe(false);

      // The file path should be a clean relative path
      expect(testId.startsWith('account.spec.ts::')).toBe(true);
    });

    test('FAILS: deep directory structure should resolve correctly', () => {
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

      // File is in subdirectory of testDir, should have features/ prefix
      // EXPECTED: features/checkout.spec.ts::Checkout::should process payment
      const expectedTestId =
        'features/checkout.spec.ts::Checkout::should process payment';

      const testIds = Object.keys(result.tests);
      expect(testIds[0]).toBe(expectedTestId);
    });
  });

  describe('Consistency with test-discovery', () => {
    test('extract-timing should produce same IDs as test-discovery', () => {
      /**
       * The fundamental requirement: test IDs from extract-timing MUST match
       * test IDs from test-discovery for the same tests.
       *
       * test-discovery format: file::describe1::describe2::testTitle
       * extract-timing format: SHOULD BE THE SAME
       */
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

      // Same format as test-discovery produces:
      // file::describe1::describe2::testTitle
      const expectedTestId =
        'e2e/api.spec.ts::API::REST::GET /users returns 200';

      const testIds = Object.keys(result.tests);
      expect(testIds[0]).toBe(expectedTestId);
    });
  });
});
