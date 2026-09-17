// Edge case: titles and describe names containing `::` — the visual
// separator this repo's docs reference. Identity is structured JSON, so
// these must be handled as plain text.

describe("Separator Conflict Tests", () => {
  test("login :: should authenticate user", () => {
    expect("login").toBeTruthy();
  });

  test("user::admin permissions check", () => {
    expect("admin").toBeTruthy();
  });

  test("path::to::resource::value", () => {
    expect("path").toBeTruthy();
  });

  test("::edge::case::", () => {
    expect("edge").toBeTruthy();
  });
});

describe("Module::SubModule", () => {
  test("nested::test", () => {
    expect("nested").toBeTruthy();
  });

  test("normal test in module::submodule", () => {
    expect(true).toBe(true);
  });
});
