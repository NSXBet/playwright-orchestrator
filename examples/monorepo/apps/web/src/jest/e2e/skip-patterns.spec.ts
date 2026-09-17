// Edge cases: skip, todo, only, failing, tags in titles.
// Discovery must see ALL of these; execution follows their semantics.

describe("Skip Patterns", () => {
  test.skip("this test is skipped", () => {
    expect(false).toBe(true); // never runs
  });

  test.todo("implement this test later");

  test("normal test that runs", () => {
    expect(true).toBe(true);
  });
});

describe("Tags in Test Names", () => {
  test("@smoke @critical login flow", () => {
    expect("smoke").toBeTruthy();
  });

  test("[P0] critical path test", () => {
    expect("P0").toBeTruthy();
  });

  test("@regression [P1] #123 feature test", () => {
    expect("tags").toBeTruthy();
  });
});

describe("Slow Tests", () => {
  test("slow test with annotation", () => {
    // test.slow() is jest-circus no-op (no per-test timeout multiplier);
    // a plain timeout-controlled test still exercises the path.
    expect(true).toBe(true);
  });
});

describe("Failing Semantics", () => {
  test.failing("failing test marked as failing", () => {
    // test.failing inverts: an expectation failure marks it PASSED.
    expect(1).toBe(2);
  });
});
