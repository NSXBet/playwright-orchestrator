import { expect, test } from '@playwright/test';

/**
 * Short duration tests (~1 minute total)
 * Each test waits a controlled duration to simulate real test time
 */

test.describe('Short Tests', () => {
  test('quick test 1 (10s)', async () => {
    await new Promise((resolve) => setTimeout(resolve, 10_000));
    expect(true).toBe(true);
  });

  test('quick test 2 (15s)', async () => {
    await new Promise((resolve) => setTimeout(resolve, 15_000));
    expect(true).toBe(true);
  });

  test('quick test 3 (20s)', async () => {
    await new Promise((resolve) => setTimeout(resolve, 20_000));
    expect(true).toBe(true);
  });

  test('quick test 4 (15s)', async () => {
    await new Promise((resolve) => setTimeout(resolve, 15_000));
    expect(true).toBe(true);
  });
});
