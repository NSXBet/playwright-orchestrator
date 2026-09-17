// Edge case: parameterized titles (test.each + loop patterns)

const users = [
  { role: "admin", canDelete: true },
  { role: "user", canDelete: false },
  { role: "guest", canDelete: false },
];

describe("Parameterized Tests", () => {
  test.each(users)("$role can delete: $canDelete", ({ role, canDelete }) => {
    expect(typeof role).toBe("string");
    expect(typeof canDelete).toBe("boolean");
  });
});

describe("Template Literal Parameterized", () => {
  const mathCases = [
    { a: 1, b: 2, expected: 3 },
    { a: 2, b: 3, expected: 5 },
    { a: 10, b: 20, expected: 30 },
  ];

  for (const { a, b, expected } of mathCases) {
    test(`${a} + ${b} = ${expected}`, () => {
      expect(a + b).toBe(expected);
    });
  }
});

describe("Array Index Parameterized", () => {
  const browsers = ["chrome", "firefox", "safari"];

  for (let i = 0; i < browsers.length; i++) {
    test(`browser test #${i}: ${browsers[i]}`, () => {
      expect(browsers[i]).toBeTruthy();
    });
  }
});
