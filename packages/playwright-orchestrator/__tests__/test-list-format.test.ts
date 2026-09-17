import { describe, expect, test } from 'bun:test';
import { toTestListFile, toTestListFormat } from '../src/core/test-id.js';

describe('toTestListFormat', () => {
  test('converts simple test entry (no describe block)', () => {
    expect(
      toTestListFormat({ file: 'simple.spec.ts', titlePath: ['should work'] }),
    ).toBe('simple.spec.ts › should work');
  });

  test('converts test entry with single describe', () => {
    expect(
      toTestListFormat({
        file: 'login.spec.ts',
        titlePath: ['Login', 'should login'],
      }),
    ).toBe('login.spec.ts › Login › should login');
  });

  test('converts test entry with nested describes', () => {
    expect(
      toTestListFormat({
        file: 'auth.spec.ts',
        titlePath: ['Auth', 'OAuth', 'Google', 'should redirect'],
      }),
    ).toBe('auth.spec.ts › Auth › OAuth › Google › should redirect');
  });

  test('prepends testDirPrefix for monorepo (testDir != rootDir)', () => {
    expect(
      toTestListFormat(
        { file: 'login.spec.ts', titlePath: ['Login', 'should login'] },
        'src/test/e2e',
      ),
    ).toBe('src/test/e2e/login.spec.ts › Login › should login');
  });

  test('handles empty testDirPrefix (testDir === rootDir)', () => {
    expect(
      toTestListFormat(
        { file: 'login.spec.ts', titlePath: ['Login', 'should login'] },
        '',
      ),
    ).toBe('login.spec.ts › Login › should login');
  });

  test('handles subdirectory file path with testDirPrefix', () => {
    expect(
      toTestListFormat(
        {
          file: 'features/deep/path.spec.ts',
          titlePath: ['Deep', 'should work'],
        },
        'src/test/e2e',
      ),
    ).toBe('src/test/e2e/features/deep/path.spec.ts › Deep › should work');
  });

  test('handles test name containing the › delimiter character', () => {
    expect(
      toTestListFormat({
        file: 'nav.spec.ts',
        titlePath: ['Breadcrumb', 'should show Home › Settings › Profile'],
      }),
    ).toBe('nav.spec.ts › Breadcrumb › should show Home › Settings › Profile');
  });

  test('handles special characters in test name', () => {
    expect(
      toTestListFormat({
        file: 'test.spec.ts',
        titlePath: ['Suite', 'should handle error (500)'],
      }),
    ).toBe('test.spec.ts › Suite › should handle error (500)');
  });

  test('handles parameterized test names', () => {
    expect(
      toTestListFormat({
        file: 'math.spec.ts',
        titlePath: ['Math', 'value 2 works'],
      }),
    ).toBe('math.spec.ts › Math › value 2 works');
  });

  test('strips trailing slash from testDirPrefix', () => {
    expect(
      toTestListFormat(
        { file: 'login.spec.ts', titlePath: ['Login', 'should login'] },
        'src/test/e2e/',
      ),
    ).toBe('src/test/e2e/login.spec.ts › Login › should login');
  });

  test('handles test name containing :: (internal separator)', () => {
    expect(
      toTestListFormat({
        file: 'separator.spec.ts',
        titlePath: ['Module::SubModule', 'login :: should authenticate user'],
      }),
    ).toBe(
      'separator.spec.ts › Module::SubModule › login :: should authenticate user',
    );
  });
});

describe('toTestListFile', () => {
  test('produces test-list content from array of test entries', () => {
    const result = toTestListFile([
      { file: 'login.spec.ts', titlePath: ['Login', 'should login'] },
      { file: 'home.spec.ts', titlePath: ['Home', 'should render'] },
    ]);
    expect(result).toBe(
      'login.spec.ts › Login › should login\nhome.spec.ts › Home › should render\n',
    );
  });

  test('produces test-list with testDirPrefix', () => {
    const result = toTestListFile(
      [
        { file: 'login.spec.ts', titlePath: ['Login', 'should login'] },
        { file: 'home.spec.ts', titlePath: ['Home', 'should render'] },
      ],
      'src/test/e2e',
    );
    expect(result).toBe(
      'src/test/e2e/login.spec.ts › Login › should login\nsrc/test/e2e/home.spec.ts › Home › should render\n',
    );
  });

  test('returns empty string for empty array', () => {
    expect(toTestListFile([])).toBe('');
  });

  test('handles single test', () => {
    const result = toTestListFile([
      { file: 'simple.spec.ts', titlePath: ['should work'] },
    ]);
    expect(result).toBe('simple.spec.ts › should work\n');
  });

  test('preserves :: in test names without corruption', () => {
    const result = toTestListFile([
      {
        file: 'separator.spec.ts',
        titlePath: [
          'Separator Conflict Tests',
          'login :: should authenticate user',
        ],
      },
      {
        file: 'separator.spec.ts',
        titlePath: ['Module::SubModule', 'nested::test'],
      },
    ]);
    expect(result).toBe(
      'separator.spec.ts › Separator Conflict Tests › login :: should authenticate user\n' +
        'separator.spec.ts › Module::SubModule › nested::test\n',
    );
  });
});
