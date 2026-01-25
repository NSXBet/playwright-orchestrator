import { expect, test } from './setup.js';

// Edge case: Deeply nested describe blocks (4+ levels)
test.describe('Level 1', () => {
  test.describe('Level 2', () => {
    test.describe('Level 3', () => {
      test.describe('Level 4', () => {
        test('deeply nested test at level 4', async () => {
          expect(true).toBe(true);
        });

        test.describe('Level 5', () => {
          test('extremely nested test at level 5', async () => {
            expect(1 + 1).toBe(2);
          });
        });
      });

      test('test at level 3', async () => {
        expect('level3').toBe('level3');
      });
    });

    // Edge case: Same test name in different describe context
    test('shared name', async () => {
      expect('context A').toBeTruthy();
    });
  });

  test.describe('Another Level 2', () => {
    // Edge case: Same test name, different describe (should have different ID)
    test('shared name', async () => {
      expect('context B').toBeTruthy();
    });
  });

  test('test at level 1', async () => {
    expect(true).toBe(true);
  });
});

// Edge case: Multiple root-level describes with same nested structure
test.describe('Parallel Structure', () => {
  test.describe('Nested', () => {
    test('shared name', async () => {
      expect('context C').toBeTruthy();
    });
  });
});
