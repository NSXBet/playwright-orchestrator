// Edge case: deeply nested describe blocks (5 levels) and same test
// name in different describe contexts.

describe("Level 1", () => {
  describe("Level 2", () => {
    describe("Level 3", () => {
      describe("Level 4", () => {
        test("deeply nested test at level 4", () => {
          expect(true).toBe(true);
        });

        describe("Level 5", () => {
          test("extremely nested test at level 5", () => {
            expect(1 + 1).toBe(2);
          });
        });
      });

      test("test at level 3", () => {
        expect("level3").toBe("level3");
      });

      // Same name as the sibling describe's test — both must be
      // independently selectable (allowlist keys on (file, fullName)).
      test("shared name", () => {
        expect("context A").toBeTruthy();
      });
    });
  });

  describe("Another Level 2", () => {
    test("shared name", () => {
      expect("context B").toBeTruthy();
    });
  });
});
