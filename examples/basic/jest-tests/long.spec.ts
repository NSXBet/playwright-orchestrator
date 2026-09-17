/**
 * Long duration tests. Reduced to CI-friendly durations here.
 */

describe("Long Tests", () => {
  test("long test 1 (8s)", async () => {
    await new Promise((resolve) => setTimeout(resolve, 8_000));
    expect(true).toBe(true);
  });

  test("long test 2 (7s)", async () => {
    await new Promise((resolve) => setTimeout(resolve, 7_000));
    expect(true).toBe(true);
  });
});
