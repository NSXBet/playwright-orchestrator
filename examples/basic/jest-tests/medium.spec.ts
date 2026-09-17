/**
 * Medium duration tests (~6 minutes total with original values).
 * Reduced to CI-friendly durations here.
 */

describe("Medium Tests", () => {
  test("medium test 1 (5s)", async () => {
    await new Promise((resolve) => setTimeout(resolve, 5_000));
    expect(true).toBe(true);
  });

  test("medium test 2 (6s)", async () => {
    await new Promise((resolve) => setTimeout(resolve, 6_000));
    expect(true).toBe(true);
  });
});
