import { describe, expect, test } from 'bun:test';
import { slugify } from '../src/core/slugify.js';

describe('slugify', () => {
  test('converts to lowercase', () => {
    expect(slugify('UPPERCASE')).toBe('uppercase');
    expect(slugify('MixedCase')).toBe('mixedcase');
  });

  test('replaces spaces with hyphens', () => {
    expect(slugify('hello world')).toBe('hello-world');
    expect(slugify('multiple  spaces')).toBe('multiple-spaces');
  });

  test('replaces special characters with hyphens', () => {
    expect(slugify('feature/ABC-123')).toBe('feature-abc-123');
    expect(slugify('refs/heads/main')).toBe('refs-heads-main');
    expect(slugify('user@example.com')).toBe('user-example-com');
  });

  test('removes leading and trailing hyphens', () => {
    expect(slugify('-leading')).toBe('leading');
    expect(slugify('trailing-')).toBe('trailing');
    expect(slugify('-both-')).toBe('both');
  });

  test('removes consecutive hyphens', () => {
    expect(slugify('one--two')).toBe('one-two');
    expect(slugify('one---two')).toBe('one-two');
    expect(slugify('one----two')).toBe('one-two');
  });

  test('handles Playwright project names', () => {
    expect(slugify('Mobile Chrome')).toBe('mobile-chrome');
    expect(slugify('Desktop Firefox')).toBe('desktop-firefox');
    expect(slugify('chromium')).toBe('chromium');
  });

  test('handles Git branch names', () => {
    expect(slugify('feature/user-auth')).toBe('feature-user-auth');
    expect(slugify('fix/bug#123')).toBe('fix-bug-123');
    expect(slugify('refs/heads/main')).toBe('refs-heads-main');
  });

  test('handles empty string', () => {
    expect(slugify('')).toBe('');
  });

  test('handles string with only special characters', () => {
    expect(slugify('!!!@@@###')).toBe('');
  });
});
