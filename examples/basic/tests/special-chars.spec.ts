/**
 * Tests with special characters in test names.
 * These test names previously caused issues with --grep and shell escaping.
 */
import { expect, test } from '@playwright/test';

test.describe('Special Characters', () => {
  test('should handle error (500)', async () => {
    // Parentheses - caused bash syntax errors
    expect(true).toBe(true);
  });

  test('should parse A | B | C', async () => {
    // Pipe characters - interpreted as bash pipes
    expect(true).toBe(true);
  });

  test('should format $100.00', async () => {
    // Dollar sign - bash variable expansion
    expect(true).toBe(true);
  });

  test('should render `code` blocks', async () => {
    // Backticks - bash command substitution
    expect(true).toBe(true);
  });

  test("should show 'warning' message", async () => {
    // Single quotes - string delimiter issues
    expect(true).toBe(true);
  });

  test('should handle "quoted" text', async () => {
    // Double quotes - string delimiter issues
    expect(true).toBe(true);
  });
});
