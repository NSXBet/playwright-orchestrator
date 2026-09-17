/**
 * Tests with special characters in test names.
 * These test names previously caused issues with --grep / regex
 * selection and shell escaping. The exact-allowlist shim handles them
 * as plain text.
 */

describe("Special Characters", () => {
  test("should handle error (500)", () => {
    // Parentheses - caused regex/bash issues
    expect(true).toBe(true);
  });

  test("should parse A | B | C", () => {
    // Pipe characters - regex alternation hazard
    expect(true).toBe(true);
  });

  test("should format $100.00", () => {
    // Dollar sign - regex end-anchor hazard
    expect(true).toBe(true);
  });

  test("regex \\d+ pattern", () => {
    // Backslash and digit quantifier
    expect(true).toBe(true);
  });

  test("Should Login", () => {
    // Case variant of a common name; must not collide with "should login"
    expect(true).toBe(true);
  });

  test("should login", () => {
    // Case-variant sibling; both must be independently selectable
    expect(true).toBe(true);
  });
});
