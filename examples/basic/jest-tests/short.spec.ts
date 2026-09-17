/**
 * Short duration tests (~1 minute total)
 * Each test waits a controlled duration to simulate real test time.
 */

describe("Short Tests", () => {
  test("quick test 1 (2s)", async () => {
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    expect(true).toBe(true);
  });

  test("quick test 2 (3s)", async () => {
    await new Promise((resolve) => setTimeout(resolve, 3_000));
    expect(true).toBe(true);
  });

  test("quick test 3 (4s)", async () => {
    await new Promise((resolve) => setTimeout(resolve, 4_000));
    expect(true).toBe(true);
  });

  test("quick test 4 (3s)", async () => {
    await new Promise((resolve) => setTimeout(resolve, 3_000));
    expect(true).toBe(true);
  });
});
