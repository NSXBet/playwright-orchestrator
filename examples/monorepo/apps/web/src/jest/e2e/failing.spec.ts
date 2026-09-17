// Edge case: one intentionally failing test. The orchestrator must
// survive failures: coverage verification counts failed tests as
// executed, and the shard job fails only if the assigned set is not
// exactly what ran. CI tolerates this file's failure (see workflow).

describe("Intentional Failure", () => {
  test("this test always fails", () => {
    expect("expected").toBe("actual");
  });

  test("this test passes and runs after the failure", () => {
    expect(true).toBe(true);
  });
});
