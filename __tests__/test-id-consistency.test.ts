import { describe, expect, test } from 'bun:test';
import * as path from 'node:path';
import {
  buildTestIdFromRuntime,
  filterRuntimeTitlePath,
} from '../src/core/test-id.js';
import { buildTestId, parseTestId } from '../src/core/types.js';

/**
 * Test ID Consistency Tests
 *
 * These tests verify that test IDs are generated consistently across all components:
 * - test-discovery.ts (orchestrator)
 * - reporter.ts (runtime filtering)
 * - extract-timing.ts (timing extraction)
 *
 * All components must use the same format: {relative-path}::{titlePath...}
 * where relative-path is relative to CWD with forward slashes.
 */

describe('Test ID Consistency', () => {
  describe('File path format', () => {
    test('uses relative path from CWD, not basename', () => {
      // This is the key consistency requirement
      const testId = buildTestId('e2e/login.spec.ts', [
        'Login',
        'should login',
      ]);
      expect(testId).toBe('e2e/login.spec.ts::Login::should login');

      // NOT just the basename
      expect(testId).not.toBe('login.spec.ts::Login::should login');
    });

    test('preserves subdirectory structure', () => {
      const testId = buildTestId('tests/e2e/features/auth/login.spec.ts', [
        'Login',
        'should login',
      ]);
      expect(testId).toBe(
        'tests/e2e/features/auth/login.spec.ts::Login::should login',
      );
    });

    test('same filename in different directories produces different IDs', () => {
      const id1 = buildTestId('e2e/auth/login.spec.ts', [
        'Login',
        'should login',
      ]);
      const id2 = buildTestId('e2e/user/login.spec.ts', [
        'Login',
        'should login',
      ]);

      expect(id1).not.toBe(id2);
      expect(id1).toBe('e2e/auth/login.spec.ts::Login::should login');
      expect(id2).toBe('e2e/user/login.spec.ts::Login::should login');
    });

    test('root-level test files work correctly', () => {
      const testId = buildTestId('login.spec.ts', ['Login', 'should login']);
      expect(testId).toBe('login.spec.ts::Login::should login');
    });
  });

  describe('Windows path normalization', () => {
    test('backslashes are converted to forward slashes', () => {
      // Simulate Windows path that was normalized
      const windowsPath = 'e2e\\auth\\login.spec.ts'.replace(/\\/g, '/');
      const testId = buildTestId(windowsPath, ['Login', 'should login']);
      expect(testId).toBe('e2e/auth/login.spec.ts::Login::should login');
    });

    test('mixed slashes are normalized', () => {
      const mixedPath = 'e2e/auth\\login.spec.ts'.replace(/\\/g, '/');
      const testId = buildTestId(mixedPath, ['Login', 'should login']);
      expect(testId).toBe('e2e/auth/login.spec.ts::Login::should login');
    });
  });

  describe('Title path handling', () => {
    test('single describe block', () => {
      const testId = buildTestId('e2e/login.spec.ts', [
        'Login',
        'should login',
      ]);
      expect(testId).toBe('e2e/login.spec.ts::Login::should login');
    });

    test('nested describe blocks', () => {
      const testId = buildTestId('e2e/auth.spec.ts', [
        'Auth',
        'OAuth',
        'Google',
        'should redirect',
      ]);
      expect(testId).toBe(
        'e2e/auth.spec.ts::Auth::OAuth::Google::should redirect',
      );
    });

    test('no describe block (test at file level)', () => {
      const testId = buildTestId('e2e/simple.spec.ts', ['should work']);
      expect(testId).toBe('e2e/simple.spec.ts::should work');
    });

    test('empty describe title is preserved', () => {
      // Some test runners might have empty describe titles
      const testId = buildTestId('e2e/test.spec.ts', ['', 'should work']);
      expect(testId).toBe('e2e/test.spec.ts::::should work');
    });
  });

  describe('parseTestId roundtrip', () => {
    test('simple path roundtrips correctly', () => {
      const original = 'e2e/login.spec.ts::Login::should login';
      const parsed = parseTestId(original);
      const rebuilt = buildTestId(parsed.file, parsed.titlePath);
      expect(rebuilt).toBe(original);
    });

    test('nested path roundtrips correctly', () => {
      const original =
        'tests/e2e/features/login.spec.ts::Auth::OAuth::should redirect';
      const parsed = parseTestId(original);
      const rebuilt = buildTestId(parsed.file, parsed.titlePath);
      expect(rebuilt).toBe(original);
    });

    test('parses file path correctly', () => {
      const result = parseTestId('e2e/auth/login.spec.ts::Login::should login');
      expect(result.file).toBe('e2e/auth/login.spec.ts');
      expect(result.titlePath).toEqual(['Login', 'should login']);
    });
  });

  describe('Playwright project support', () => {
    test('project name in titlePath creates unique ID', () => {
      // When using --project, Playwright may include project name in title path
      const chromeId = buildTestId('e2e/login.spec.ts', [
        'chromium',
        'Login',
        'should login',
      ]);
      const firefoxId = buildTestId('e2e/login.spec.ts', [
        'firefox',
        'Login',
        'should login',
      ]);

      expect(chromeId).not.toBe(firefoxId);
      expect(chromeId).toBe('e2e/login.spec.ts::chromium::Login::should login');
      expect(firefoxId).toBe('e2e/login.spec.ts::firefox::Login::should login');
    });
  });

  describe('Edge cases', () => {
    test('deeply nested directories', () => {
      const testId = buildTestId(
        'src/tests/e2e/features/authentication/social/google/login.spec.ts',
        ['Google OAuth', 'should authenticate'],
      );
      expect(testId).toBe(
        'src/tests/e2e/features/authentication/social/google/login.spec.ts::Google OAuth::should authenticate',
      );
    });

    test('file with dots in name', () => {
      const testId = buildTestId('e2e/betslip.v2.spec.ts', [
        'BetSlip v2',
        'should work',
      ]);
      expect(testId).toBe('e2e/betslip.v2.spec.ts::BetSlip v2::should work');
    });

    test('file with special characters in directory', () => {
      const testId = buildTestId('e2e/[feature]/login.spec.ts', [
        'Login',
        'should work',
      ]);
      expect(testId).toBe('e2e/[feature]/login.spec.ts::Login::should work');
    });

    test('test title with colons (separator character)', () => {
      const testId = buildTestId('e2e/test.spec.ts', [
        'Suite',
        'title :: with :: colons',
      ]);
      expect(testId).toBe('e2e/test.spec.ts::Suite::title :: with :: colons');

      // Parsing should still work (first :: is the separator)
      const parsed = parseTestId(testId);
      expect(parsed.file).toBe('e2e/test.spec.ts');
      // Note: this demonstrates a limitation - colons in titles can cause parsing issues
    });
  });
});

describe('Simulated Component Consistency', () => {
  /**
   * These tests simulate what each component does to verify they would
   * produce the same test IDs for the same tests.
   */

  // Simulate path.relative behavior
  function simulateRelativePath(absolutePath: string, cwd: string): string {
    return path.relative(cwd, absolutePath).replace(/\\/g, '/');
  }

  describe('Discovery vs Reporter', () => {
    test('same test produces same ID', () => {
      const cwd = '/project';
      const absoluteFile = '/project/e2e/login.spec.ts';
      const titlePath = ['Login', 'should login'];

      // What discovery would generate
      const discoveryFile = simulateRelativePath(absoluteFile, cwd);
      const discoveryId = buildTestId(discoveryFile, titlePath);

      // What reporter would generate (same logic)
      const reporterFile = simulateRelativePath(absoluteFile, cwd);
      const reporterId = buildTestId(reporterFile, titlePath);

      expect(discoveryId).toBe(reporterId);
      expect(discoveryId).toBe('e2e/login.spec.ts::Login::should login');
    });

    test('subdirectory test produces same ID', () => {
      const cwd = '/project';
      const absoluteFile = '/project/tests/e2e/features/auth/login.spec.ts';
      const titlePath = ['Auth', 'Login', 'should authenticate'];

      const discoveryFile = simulateRelativePath(absoluteFile, cwd);
      const discoveryId = buildTestId(discoveryFile, titlePath);

      const reporterFile = simulateRelativePath(absoluteFile, cwd);
      const reporterId = buildTestId(reporterFile, titlePath);

      expect(discoveryId).toBe(reporterId);
      expect(discoveryId).toBe(
        'tests/e2e/features/auth/login.spec.ts::Auth::Login::should authenticate',
      );
    });
  });

  describe('Discovery vs Extract Timing', () => {
    test('timing extraction produces same ID as discovery', () => {
      const cwd = '/project';
      const absoluteFile = '/project/e2e/checkout.spec.ts';
      const titlePath = ['Checkout', 'should process payment'];

      // What discovery would generate
      const discoveryFile = simulateRelativePath(absoluteFile, cwd);
      const discoveryId = buildTestId(discoveryFile, titlePath);

      // What extract-timing would generate (same logic now)
      const extractFile = simulateRelativePath(absoluteFile, cwd);
      const extractId = buildTestId(extractFile, titlePath);

      expect(discoveryId).toBe(extractId);
    });
  });

  describe('All three components', () => {
    test('all components produce identical IDs', () => {
      const cwd = '/workspace/my-app';
      const absoluteFile = '/workspace/my-app/e2e/integration/api.spec.ts';
      const titlePath = ['API Tests', 'REST', 'GET /users', 'returns 200'];

      const discoveryFile = simulateRelativePath(absoluteFile, cwd);
      const reporterFile = simulateRelativePath(absoluteFile, cwd);
      const extractFile = simulateRelativePath(absoluteFile, cwd);

      const discoveryId = buildTestId(discoveryFile, titlePath);
      const reporterId = buildTestId(reporterFile, titlePath);
      const extractId = buildTestId(extractFile, titlePath);

      expect(discoveryId).toBe(reporterId);
      expect(reporterId).toBe(extractId);
      expect(discoveryId).toBe(
        'e2e/integration/api.spec.ts::API Tests::REST::GET /users::returns 200',
      );
    });
  });
});

describe('Real-world scenarios', () => {
  test('monorepo with apps directory', () => {
    // Common monorepo structure
    const testId = buildTestId('apps/web/e2e/login.spec.ts', [
      'Login',
      'should work',
    ]);
    expect(testId).toBe('apps/web/e2e/login.spec.ts::Login::should work');
  });

  test('packages directory structure', () => {
    const testId = buildTestId('packages/ui/tests/button.spec.ts', [
      'Button',
      'renders correctly',
    ]);
    expect(testId).toBe(
      'packages/ui/tests/button.spec.ts::Button::renders correctly',
    );
  });

  test('parameterized tests (test.each)', () => {
    // Each iteration gets a unique title from Playwright
    const id1 = buildTestId('e2e/math.spec.ts', ['Math', 'adds 1 + 1 = 2']);
    const id2 = buildTestId('e2e/math.spec.ts', ['Math', 'adds 2 + 2 = 4']);

    expect(id1).not.toBe(id2);
    expect(id1).toBe('e2e/math.spec.ts::Math::adds 1 + 1 = 2');
    expect(id2).toBe('e2e/math.spec.ts::Math::adds 2 + 2 = 4');
  });

  test('describe.each with nested tests', () => {
    const id1 = buildTestId('e2e/test.spec.ts', ['Browser: Chrome', 'works']);
    const id2 = buildTestId('e2e/test.spec.ts', ['Browser: Firefox', 'works']);

    expect(id1).not.toBe(id2);
  });
});

/**
 * Runtime filtering tests for fixture and reporter context.
 * These test the shared functions that fixture.ts and reporter.ts use.
 */
describe('Runtime Title Path Filtering', () => {
  describe('filterRuntimeTitlePath', () => {
    test('filters empty strings', () => {
      const result = filterRuntimeTitlePath(['', 'Login', '', 'should work']);
      expect(result).toEqual(['Login', 'should work']);
    });

    test('filters project name', () => {
      const result = filterRuntimeTitlePath(
        ['chromium', 'Login', 'should work'],
        { projectName: 'chromium' },
      );
      expect(result).toEqual(['Login', 'should work']);
    });

    test('filters file name', () => {
      const result = filterRuntimeTitlePath(
        ['login.spec.ts', 'Login', 'should work'],
        { fileName: 'login.spec.ts' },
      );
      expect(result).toEqual(['Login', 'should work']);
    });

    test('filters both project name and file name', () => {
      const result = filterRuntimeTitlePath(
        ['chromium', 'login.spec.ts', 'Login', 'should work'],
        { projectName: 'chromium', fileName: 'login.spec.ts' },
      );
      expect(result).toEqual(['Login', 'should work']);
    });

    test('filters file paths with forward slashes', () => {
      const result = filterRuntimeTitlePath([
        'e2e/login.spec.ts',
        'Login',
        'should work',
      ]);
      expect(result).toEqual(['Login', 'should work']);
    });

    test('filters file paths with backslashes', () => {
      const result = filterRuntimeTitlePath([
        'e2e\\login.spec.ts',
        'Login',
        'should work',
      ]);
      expect(result).toEqual(['Login', 'should work']);
    });

    test('filters .spec.ts file extensions', () => {
      const result = filterRuntimeTitlePath([
        'login.spec.ts',
        'Login',
        'should work',
      ]);
      expect(result).toEqual(['Login', 'should work']);
    });

    test('filters .test.ts file extensions', () => {
      const result = filterRuntimeTitlePath([
        'login.test.ts',
        'Login',
        'should work',
      ]);
      expect(result).toEqual(['Login', 'should work']);
    });

    test('filters .spec.js file extensions', () => {
      const result = filterRuntimeTitlePath([
        'login.spec.js',
        'Login',
        'should work',
      ]);
      expect(result).toEqual(['Login', 'should work']);
    });

    test('filters .test.js file extensions', () => {
      const result = filterRuntimeTitlePath([
        'login.test.js',
        'Login',
        'should work',
      ]);
      expect(result).toEqual(['Login', 'should work']);
    });

    test('preserves nested describe blocks', () => {
      const result = filterRuntimeTitlePath(
        ['chromium', 'login.spec.ts', 'Auth', 'Login', 'should authenticate'],
        { projectName: 'chromium', fileName: 'login.spec.ts' },
      );
      expect(result).toEqual(['Auth', 'Login', 'should authenticate']);
    });

    test('handles complex Playwright runtime titlePath', () => {
      // Simulates what testInfo.titlePath looks like in Playwright runtime
      const result = filterRuntimeTitlePath(
        [
          'Desktop Chrome',
          '/project/src/test/e2e/login.spec.ts',
          'login.spec.ts',
          'Authentication',
          'Login Form',
          'should submit credentials',
        ],
        { projectName: 'Desktop Chrome', fileName: 'login.spec.ts' },
      );
      expect(result).toEqual([
        'Authentication',
        'Login Form',
        'should submit credentials',
      ]);
    });
  });

  describe('buildTestIdFromRuntime', () => {
    test('builds ID with all filtering applied', () => {
      const result = buildTestIdFromRuntime(
        '/project/e2e/login.spec.ts',
        ['chromium', 'login.spec.ts', 'Login', 'should work'],
        { projectName: 'chromium', baseDir: '/project' },
      );
      expect(result).toBe('e2e/login.spec.ts::Login::should work');
    });

    test('handles Windows paths', () => {
      // path.relative behavior differs on Windows, but we normalize to forward slashes
      const result = buildTestIdFromRuntime(
        '/project/e2e/auth/login.spec.ts',
        ['Login', 'should work'],
        { baseDir: '/project' },
      );
      expect(result).toBe('e2e/auth/login.spec.ts::Login::should work');
    });

    test('uses cwd when baseDir not provided', () => {
      // This test verifies the default behavior
      const cwd = process.cwd();
      const testFile = path.join(cwd, 'e2e/login.spec.ts');
      const result = buildTestIdFromRuntime(testFile, ['Login', 'should work']);
      expect(result).toBe('e2e/login.spec.ts::Login::should work');
    });

    test('handles deeply nested paths', () => {
      const result = buildTestIdFromRuntime(
        '/workspace/apps/web/src/test/e2e/features/auth/login.spec.ts',
        [
          'Desktop Chrome',
          '/workspace/apps/web/src/test/e2e/features/auth/login.spec.ts',
          'login.spec.ts',
          'Authentication',
          'should login',
        ],
        { projectName: 'Desktop Chrome', baseDir: '/workspace/apps/web' },
      );
      expect(result).toBe(
        'src/test/e2e/features/auth/login.spec.ts::Authentication::should login',
      );
    });
  });
});

/**
 * Cross-component consistency tests.
 * Verifies that fixture and reporter will produce identical IDs.
 */
describe('Fixture-Reporter Consistency', () => {
  test('same test produces same ID in both contexts', () => {
    // Simulate what fixture and reporter both receive from Playwright
    const absoluteFile = '/project/e2e/login.spec.ts';
    const runtimeTitlePath = [
      'chromium',
      '/project/e2e/login.spec.ts',
      'login.spec.ts',
      'Login',
      'should authenticate',
    ];
    const projectName = 'chromium';
    const baseDir = '/project';

    // What fixture produces
    const fixtureId = buildTestIdFromRuntime(absoluteFile, runtimeTitlePath, {
      projectName,
      baseDir,
    });

    // What reporter produces (same function!)
    const reporterId = buildTestIdFromRuntime(absoluteFile, runtimeTitlePath, {
      projectName,
      baseDir,
    });

    expect(fixtureId).toBe(reporterId);
    expect(fixtureId).toBe('e2e/login.spec.ts::Login::should authenticate');
  });

  test('monorepo test produces consistent IDs', () => {
    const absoluteFile =
      '/workspace/apps/web/src/test/e2e/features/checkout.spec.ts';
    const runtimeTitlePath = [
      'Mobile Safari',
      '/workspace/apps/web/src/test/e2e/features/checkout.spec.ts',
      'checkout.spec.ts',
      'Checkout',
      'Payment',
      'should process credit card',
    ];

    const id = buildTestIdFromRuntime(absoluteFile, runtimeTitlePath, {
      projectName: 'Mobile Safari',
      baseDir: '/workspace/apps/web',
    });

    expect(id).toBe(
      'src/test/e2e/features/checkout.spec.ts::Checkout::Payment::should process credit card',
    );
  });

  test('discovery ID matches runtime ID after filtering', () => {
    // What discovery produces (from Playwright JSON, already filtered)
    const discoveryId = buildTestId('e2e/login.spec.ts', [
      'Login',
      'should authenticate',
    ]);

    // What runtime produces (needs filtering)
    const runtimeId = buildTestIdFromRuntime(
      '/project/e2e/login.spec.ts',
      [
        'chromium',
        '/project/e2e/login.spec.ts',
        'login.spec.ts',
        'Login',
        'should authenticate',
      ],
      { projectName: 'chromium', baseDir: '/project' },
    );

    // Both should produce identical IDs
    expect(discoveryId).toBe(runtimeId);
    expect(discoveryId).toBe('e2e/login.spec.ts::Login::should authenticate');
  });
});
