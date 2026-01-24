import { describe, expect, test } from 'bun:test';
import {
  determineGrepStrategy,
  escapeRegex,
  extractTitleFromTestId,
  generateGrepFileContent,
  generateGrepPattern,
  generateGrepPatterns,
  isPatternTooLong,
  MAX_GREP_PATTERN_LENGTH,
} from '../src/core/grep-pattern.js';

describe('escapeRegex', () => {
  test('escapes special regex characters', () => {
    expect(escapeRegex('hello.world')).toBe('hello\\.world');
    expect(escapeRegex('test*')).toBe('test\\*');
    expect(escapeRegex('foo[bar]')).toBe('foo\\[bar\\]');
    expect(escapeRegex('(group)')).toBe('\\(group\\)');
    expect(escapeRegex('a+b')).toBe('a\\+b');
    expect(escapeRegex('a?b')).toBe('a\\?b');
    expect(escapeRegex('a^b$c')).toBe('a\\^b\\$c');
    expect(escapeRegex('a{1,2}')).toBe('a\\{1,2\\}');
    expect(escapeRegex('a|b')).toBe('a\\|b');
    expect(escapeRegex('a\\b')).toBe('a\\\\b');
  });

  test('leaves regular text unchanged', () => {
    expect(escapeRegex('hello world')).toBe('hello world');
    expect(escapeRegex('simple test')).toBe('simple test');
  });
});

describe('extractTitleFromTestId', () => {
  test('extracts test title from ID', () => {
    expect(extractTitleFromTestId('file.spec.ts::describe::test title')).toBe(
      'test title',
    );
    expect(
      extractTitleFromTestId('file.spec.ts::outer::inner::nested test'),
    ).toBe('nested test');
  });

  test('handles test ID with no describe blocks', () => {
    expect(extractTitleFromTestId('file.spec.ts::simple test')).toBe(
      'simple test',
    );
  });

  test('returns full ID if no separator', () => {
    expect(extractTitleFromTestId('simple')).toBe('simple');
  });
});

describe('generateGrepPattern', () => {
  test('generates pattern with full title path for single test', () => {
    const pattern = generateGrepPattern(['file.spec.ts::describe::test title']);
    // Full title path: "describe › test title"
    expect(pattern).toBe('describe › test title');
  });

  test('generates pattern with full title path for multiple tests', () => {
    const pattern = generateGrepPattern([
      'a.spec.ts::test 1',
      'b.spec.ts::test 2',
    ]);
    expect(pattern).toBe('test 1|test 2');
  });

  test('escapes regex special characters in full title path', () => {
    const pattern = generateGrepPattern([
      'file.spec.ts::describe::test (with parens)',
      'file.spec.ts::describe::test.with.dots',
    ]);
    expect(pattern).toBe(
      'describe › test \\(with parens\\)|describe › test\\.with\\.dots',
    );
  });

  test('returns empty string for empty input', () => {
    expect(generateGrepPattern([])).toBe('');
  });
});

describe('generateGrepPatterns', () => {
  test('generates patterns with full title paths for multiple shards', () => {
    const shardTests = {
      1: ['a.spec.ts::describe::test1', 'a.spec.ts::describe::test2'],
      2: ['b.spec.ts::suite::test3'],
    };

    const patterns = generateGrepPatterns(shardTests);

    expect(patterns[1]).toBe('describe › test1|describe › test2');
    expect(patterns[2]).toBe('suite › test3');
  });
});

describe('isPatternTooLong', () => {
  test('returns false for short patterns', () => {
    expect(isPatternTooLong('short pattern')).toBe(false);
  });

  test('returns true for long patterns', () => {
    const longPattern = 'a'.repeat(MAX_GREP_PATTERN_LENGTH + 1);
    expect(isPatternTooLong(longPattern)).toBe(true);
  });
});

describe('generateGrepFileContent', () => {
  test('generates one full title path per line', () => {
    const content = generateGrepFileContent([
      'a.spec.ts::describe::test1',
      'b.spec.ts::suite::test2',
    ]);
    expect(content).toBe('describe › test1\nsuite › test2');
  });

  test('escapes regex characters in file content', () => {
    const content = generateGrepFileContent([
      'file.spec.ts::describe::test (with parens)',
    ]);
    expect(content).toBe('describe › test \\(with parens\\)');
  });
});

describe('determineGrepStrategy', () => {
  test('returns pattern strategy for short list', () => {
    const result = determineGrepStrategy(['a.spec.ts::describe::test1']);
    expect(result.strategy).toBe('pattern');
    expect(result.content).toBe('describe › test1');
  });

  test('returns file strategy for long list', () => {
    // Create enough test IDs to exceed MAX_GREP_PATTERN_LENGTH
    const longTitle = 'a'.repeat(100);
    const testIds = Array.from(
      { length: 50 },
      (_, i) => `file.spec.ts::describe::${longTitle}${i}`,
    );

    const result = determineGrepStrategy(testIds);

    // With 50 titles of ~100+ chars each, the pattern would exceed MAX_GREP_PATTERN_LENGTH (4000)
    expect(result.strategy).toBe('file');
    expect(result.content).toContain('\n');
  });

  test('returns pattern strategy for empty input', () => {
    const result = determineGrepStrategy([]);
    expect(result.strategy).toBe('pattern');
    expect(result.content).toBe('');
  });
});
