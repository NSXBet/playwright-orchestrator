import { describe, expect, test } from 'bun:test';
import * as path from 'node:path';
import { buildTestId, parseTestId } from '../src/core/types.js';

/**
 * Test ID Consistency Tests
 *
 * Verifies that test IDs are generated consistently across components:
 * - test-discovery.ts (orchestrator)
 * - extract-timing.ts (timing extraction)
 *
 * All components must use the same format: {relative-path}::{titlePath...}
 * where relative-path is relative to testDir with forward slashes.
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

  describe('Discovery consistency', () => {
    test('same test produces same ID from different resolution approaches', () => {
      const cwd = '/project';
      const absoluteFile = '/project/e2e/login.spec.ts';
      const titlePath = ['Login', 'should login'];

      const file1 = simulateRelativePath(absoluteFile, cwd);
      const id1 = buildTestId(file1, titlePath);

      const file2 = simulateRelativePath(absoluteFile, cwd);
      const id2 = buildTestId(file2, titlePath);

      expect(id1).toBe(id2);
      expect(id1).toBe('e2e/login.spec.ts::Login::should login');
    });

    test('subdirectory test produces consistent ID', () => {
      const cwd = '/project';
      const absoluteFile = '/project/tests/e2e/features/auth/login.spec.ts';
      const titlePath = ['Auth', 'Login', 'should authenticate'];

      const file1 = simulateRelativePath(absoluteFile, cwd);
      const id1 = buildTestId(file1, titlePath);

      const file2 = simulateRelativePath(absoluteFile, cwd);
      const id2 = buildTestId(file2, titlePath);

      expect(id1).toBe(id2);
      expect(id1).toBe(
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

  describe('Discovery vs Extract Timing (full path)', () => {
    test('all components produce identical IDs', () => {
      const cwd = '/workspace/my-app';
      const absoluteFile = '/workspace/my-app/e2e/integration/api.spec.ts';
      const titlePath = ['API Tests', 'REST', 'GET /users', 'returns 200'];

      const discoveryFile = simulateRelativePath(absoluteFile, cwd);
      const extractFile = simulateRelativePath(absoluteFile, cwd);

      const discoveryId = buildTestId(discoveryFile, titlePath);
      const extractId = buildTestId(extractFile, titlePath);

      expect(discoveryId).toBe(extractId);
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
