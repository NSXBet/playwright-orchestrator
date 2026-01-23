import { expect, test } from '@playwright/test';

/**
 * Medium duration tests (~2 minutes total)
 * Each test waits a controlled duration to simulate real test time
 */

test.describe('Medium Tests', () => {
  test('medium test 1 (30s)', async () => {
    await new Promise((resolve) => setTimeout(resolve, 30_000));
    expect(true).toBe(true);
  });

  test('medium test 2 (45s)', async () => {
    await new Promise((resolve) => setTimeout(resolve, 45_000));
    expect(true).toBe(true);
  });

  test('medium test 3 (25s)', async () => {
    await new Promise((resolve) => setTimeout(resolve, 25_000));
    expect(true).toBe(true);
  });

  test('medium test 4 (20s)', async () => {
    await new Promise((resolve) => setTimeout(resolve, 20_000));
    expect(true).toBe(true);
  });
});
