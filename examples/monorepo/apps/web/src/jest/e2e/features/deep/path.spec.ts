// Edge case: tests in a deep subdirectory — exercises path
// normalization. File path: features/deep/path.spec.ts

describe("Deep Path Feature", () => {
  test("test in deep subdirectory path", () => {
    expect("deep").toBeTruthy();
  });

  test("another test in deep path", () => {
    expect("path").toBeTruthy();
  });

  describe("Even Deeper", () => {
    test("deeply nested in subdirectory", () => {
      expect("nested").toBeTruthy();
    });
  });
});
