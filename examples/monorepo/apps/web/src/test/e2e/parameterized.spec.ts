import { expect, test } from './setup.js';

// Edge case: test.each with array of objects
const users = [
  { role: 'admin', canDelete: true },
  { role: 'user', canDelete: false },
  { role: 'guest', canDelete: false },
];

test.describe('Parameterized Tests', () => {
  // test.each with object destructuring
  for (const { role, canDelete } of users) {
    test(`${role} can delete: ${canDelete}`, async () => {
      expect(typeof role).toBe('string');
      expect(typeof canDelete).toBe('boolean');
    });
  }
});

test.describe('Template Literal Parameterized', () => {
  // Simulating test.each with template literal style using for loop
  const mathCases = [
    { a: 1, b: 2, expected: 3 },
    { a: 2, b: 3, expected: 5 },
    { a: 10, b: 20, expected: 30 },
  ];

  for (const { a, b, expected } of mathCases) {
    test(`${a} + ${b} = ${expected}`, async () => {
      expect(a + b).toBe(expected);
    });
  }
});

test.describe('Array Index Parameterized', () => {
  const browsers = ['chrome', 'firefox', 'safari'];

  for (let i = 0; i < browsers.length; i++) {
    test(`browser test #${i}: ${browsers[i]}`, async () => {
      expect(browsers[i]).toBeTruthy();
    });
  }
});
