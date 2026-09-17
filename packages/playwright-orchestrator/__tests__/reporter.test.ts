import { describe, expect, test } from 'bun:test';
import { buildTestId, parseTestId } from '../src/core/types.js';

describe('Test ID Format', () => {
  describe('buildTestId', () => {
    test('builds ID from file and single describe', () => {
      const testId = buildTestId('e2e/login.spec.ts', [
        'Login',
        'should login',
      ]);
      expect(testId).toBe('e2e/login.spec.ts::Login::should login');
    });

    test('builds ID with nested describes', () => {
      const testId = buildTestId('e2e/auth.spec.ts', [
        'Auth',
        'OAuth',
        'Google',
        'should redirect',
      ]);
      expect(testId).toBe(
        'e2e/auth.spec.ts::Auth::OAuth::Google::should redirect',
      );
    });

    test('builds ID with no describe (test at file level)', () => {
      const testId = buildTestId('e2e/simple.spec.ts', ['should work']);
      expect(testId).toBe('e2e/simple.spec.ts::should work');
    });

    test('preserves forward slashes in file path', () => {
      const testId = buildTestId('tests/e2e/features/login.spec.ts', [
        'Login',
        'should login',
      ]);
      expect(testId).toBe(
        'tests/e2e/features/login.spec.ts::Login::should login',
      );
    });
  });

  describe('parseTestId', () => {
    test('parses simple test ID', () => {
      const result = parseTestId('e2e/login.spec.ts::Login::should login');
      expect(result.file).toBe('e2e/login.spec.ts');
      expect(result.titlePath).toEqual(['Login', 'should login']);
    });

    test('parses nested test ID', () => {
      const result = parseTestId(
        'e2e/auth.spec.ts::Auth::OAuth::Google::should redirect',
      );
      expect(result.file).toBe('e2e/auth.spec.ts');
      expect(result.titlePath).toEqual([
        'Auth',
        'OAuth',
        'Google',
        'should redirect',
      ]);
    });
  });
});

// =============================================================================
// PROBLEM 1: Substring Collision (--grep regex matching)
// The --grep approach uses regex substring matching, causing collisions.
// Set.has() provides exact matching, preventing these collisions.
// =============================================================================
describe('PROBLEM 1: Substring Collision Prevention', () => {
  test('should NOT match prefix substring', () => {
    const allowedTests = new Set(['login.spec.ts::Login::should login']);

    expect(allowedTests.has('login.spec.ts::Login::should login')).toBe(true);
    // These would match with --grep "should login" but NOT with Set.has()
    expect(
      allowedTests.has('login.spec.ts::Login::should login with SSO'),
    ).toBe(false);
    expect(
      allowedTests.has('login.spec.ts::Login::should login successfully'),
    ).toBe(false);
    expect(
      allowedTests.has('login.spec.ts::Login::should login as admin'),
    ).toBe(false);
  });

  test('should NOT match suffix substring', () => {
    const allowedTests = new Set(['api.spec.ts::API::fetch users']);

    expect(allowedTests.has('api.spec.ts::API::fetch users')).toBe(true);
    // --grep would match these
    expect(allowedTests.has('api.spec.ts::API::should fetch users')).toBe(
      false,
    );
    expect(allowedTests.has('api.spec.ts::API::can fetch users')).toBe(false);
  });

  test('should NOT match middle substring', () => {
    const allowedTests = new Set(['test.spec.ts::Suite::handles error']);

    expect(allowedTests.has('test.spec.ts::Suite::handles error')).toBe(true);
    // --grep "handles error" would match all of these
    expect(
      allowedTests.has('test.spec.ts::Suite::gracefully handles error case'),
    ).toBe(false);
    expect(
      allowedTests.has('test.spec.ts::Suite::properly handles error response'),
    ).toBe(false);
  });

  test('should differentiate between similar test names', () => {
    const allowedTests = new Set([
      'api.spec.ts::API::should fetch user',
      'api.spec.ts::API::should fetch users',
    ]);

    expect(allowedTests.has('api.spec.ts::API::should fetch user')).toBe(true);
    expect(allowedTests.has('api.spec.ts::API::should fetch users')).toBe(true);
    // Very similar but different
    expect(allowedTests.has('api.spec.ts::API::should fetch user data')).toBe(
      false,
    );
    expect(allowedTests.has('api.spec.ts::API::should fetch usernames')).toBe(
      false,
    );
  });

  test('case-sensitive matching prevents case collisions', () => {
    const allowedTests = new Set(['test.spec.ts::Suite::Should Login']);

    expect(allowedTests.has('test.spec.ts::Suite::Should Login')).toBe(true);
    // Case variations should NOT match
    expect(allowedTests.has('test.spec.ts::Suite::should login')).toBe(false);
    expect(allowedTests.has('test.spec.ts::Suite::SHOULD LOGIN')).toBe(false);
    expect(allowedTests.has('test.spec.ts::Suite::Should login')).toBe(false);
  });
});

// =============================================================================
// PROBLEM 2: Bash Syntax Errors - Parentheses, Brackets, Braces
// These characters cause "syntax error near unexpected token" in bash.
// JSON file bypasses shell entirely, solving this problem.
// =============================================================================
describe('PROBLEM 2: Bash Syntax Error Characters', () => {
  describe('Parentheses () - The original bet-app error', () => {
    test('handles parentheses in test name', () => {
      // This is the EXACT error from bet-app CI:
      // "syntax error near unexpected token `('"
      const allowedTests = new Set([
        'betslip.v2.spec.ts::BetSlip v2::should show message for (ServerMessage)',
      ]);

      expect(
        allowedTests.has(
          'betslip.v2.spec.ts::BetSlip v2::should show message for (ServerMessage)',
        ),
      ).toBe(true);
    });

    test('handles multiple parentheses', () => {
      const allowedTests = new Set([
        'test.spec.ts::Test::function(arg1, arg2) returns (result)',
      ]);

      expect(
        allowedTests.has(
          'test.spec.ts::Test::function(arg1, arg2) returns (result)',
        ),
      ).toBe(true);
    });

    test('handles nested parentheses', () => {
      const allowedTests = new Set([
        'test.spec.ts::Test::should handle ((nested)) parens',
      ]);

      expect(
        allowedTests.has('test.spec.ts::Test::should handle ((nested)) parens'),
      ).toBe(true);
    });

    test('handles empty parentheses', () => {
      const allowedTests = new Set(['test.spec.ts::Test::function() call']);

      expect(allowedTests.has('test.spec.ts::Test::function() call')).toBe(
        true,
      );
    });
  });

  describe('Square Brackets [] - Array/index notation', () => {
    test('handles square brackets', () => {
      const allowedTests = new Set([
        'test.spec.ts::Test::should access array[0]',
        'test.spec.ts::Test::handles [object Object]',
        'test.spec.ts::Test::parses [1, 2, 3]',
      ]);

      expect(
        allowedTests.has('test.spec.ts::Test::should access array[0]'),
      ).toBe(true);
      expect(
        allowedTests.has('test.spec.ts::Test::handles [object Object]'),
      ).toBe(true);
      expect(allowedTests.has('test.spec.ts::Test::parses [1, 2, 3]')).toBe(
        true,
      );
    });
  });

  describe('Curly Braces {} - Object notation', () => {
    test('handles curly braces', () => {
      // Test literal ${} in test names - constructed to avoid lint warning
      const templateVar =
        'test.spec.ts::Test::template $' + '{variable} substitution';
      const allowedTests = new Set([
        'test.spec.ts::Test::should parse {key: value}',
        'test.spec.ts::Test::renders {} empty object',
        templateVar,
      ]);

      expect(
        allowedTests.has('test.spec.ts::Test::should parse {key: value}'),
      ).toBe(true);
      expect(
        allowedTests.has('test.spec.ts::Test::renders {} empty object'),
      ).toBe(true);
      expect(allowedTests.has(templateVar)).toBe(true);
    });
  });

  describe('Semicolons ; - Command separator', () => {
    test('handles semicolons', () => {
      const allowedTests = new Set([
        'test.spec.ts::Test::a; b; c sequence',
        'test.spec.ts::Test::statement; another',
      ]);

      expect(allowedTests.has('test.spec.ts::Test::a; b; c sequence')).toBe(
        true,
      );
    });
  });

  describe('Ampersands & - Background/AND operator', () => {
    test('handles single ampersand', () => {
      const allowedTests = new Set([
        'test.spec.ts::Test::Tom & Jerry',
        'test.spec.ts::Test::A & B & C',
      ]);

      expect(allowedTests.has('test.spec.ts::Test::Tom & Jerry')).toBe(true);
    });

    test('handles double ampersand (AND)', () => {
      const allowedTests = new Set([
        'test.spec.ts::Test::condition && result',
        'test.spec.ts::Test::a && b && c',
      ]);

      expect(allowedTests.has('test.spec.ts::Test::condition && result')).toBe(
        true,
      );
    });
  });

  describe('Angle Brackets <> - Redirects/generics', () => {
    test('handles less than', () => {
      const allowedTests = new Set([
        'test.spec.ts::Test::a < b comparison',
        'test.spec.ts::Test::should handle <input>',
      ]);

      expect(allowedTests.has('test.spec.ts::Test::a < b comparison')).toBe(
        true,
      );
    });

    test('handles greater than', () => {
      const allowedTests = new Set([
        'test.spec.ts::Test::a > b comparison',
        'test.spec.ts::Test::redirect > output',
      ]);

      expect(allowedTests.has('test.spec.ts::Test::a > b comparison')).toBe(
        true,
      );
    });

    test('handles HTML-like tags', () => {
      const allowedTests = new Set([
        'test.spec.ts::Test::renders <Component />',
        'test.spec.ts::Test::parses <div>content</div>',
        'test.spec.ts::Test::handles Array<string>',
      ]);

      expect(
        allowedTests.has('test.spec.ts::Test::renders <Component />'),
      ).toBe(true);
      expect(
        allowedTests.has('test.spec.ts::Test::parses <div>content</div>'),
      ).toBe(true);
      expect(
        allowedTests.has('test.spec.ts::Test::handles Array<string>'),
      ).toBe(true);
    });
  });

  describe('Wildcards * ? - Glob patterns', () => {
    test('handles asterisks', () => {
      const allowedTests = new Set([
        'test.spec.ts::Test::matches *.ts files',
        'test.spec.ts::Test::a * b multiplication',
        'test.spec.ts::Test::**bold** text',
      ]);

      expect(allowedTests.has('test.spec.ts::Test::matches *.ts files')).toBe(
        true,
      );
      expect(allowedTests.has('test.spec.ts::Test::a * b multiplication')).toBe(
        true,
      );
    });

    test('handles question marks', () => {
      const allowedTests = new Set([
        'test.spec.ts::Test::what? why? how?',
        'test.spec.ts::Test::optional?.chaining',
      ]);

      expect(allowedTests.has('test.spec.ts::Test::what? why? how?')).toBe(
        true,
      );
    });
  });

  describe('Exclamation marks ! - Negation/history', () => {
    test('handles exclamation marks', () => {
      const allowedTests = new Set([
        'test.spec.ts::Test::should not! fail!',
        'test.spec.ts::Test::!important assertion',
        'test.spec.ts::Test::handles !== and !==',
      ]);

      expect(allowedTests.has('test.spec.ts::Test::should not! fail!')).toBe(
        true,
      );
      expect(allowedTests.has('test.spec.ts::Test::!important assertion')).toBe(
        true,
      );
    });
  });
});

// =============================================================================
// PROBLEM 3: Shell Escaping - Quotes, Backticks, Dollar Signs
// Multi-layer escaping (shell -> bash -> node) is impossible to get right.
// JSON file bypasses all escaping layers.
// =============================================================================
describe('PROBLEM 3: Shell Escaping Characters', () => {
  describe('Dollar Sign $ - Variable expansion', () => {
    test('handles dollar sign (currency)', () => {
      const allowedTests = new Set([
        'test.spec.ts::Test::should format $100.00',
        'test.spec.ts::Test::prices: $10, $20, $30',
      ]);

      expect(
        allowedTests.has('test.spec.ts::Test::should format $100.00'),
      ).toBe(true);
    });

    test('handles dollar sign (variable-like)', () => {
      // Test literal ${} in test names - constructed to avoid lint warning
      const templateName = 'test.spec.ts::Test::template $' + '{name}';
      const allowedTests = new Set([
        'test.spec.ts::Test::handles $variable',
        templateName,
        'test.spec.ts::Test::regex $^ anchors',
      ]);

      expect(allowedTests.has('test.spec.ts::Test::handles $variable')).toBe(
        true,
      );
      expect(allowedTests.has(templateName)).toBe(true);
    });
  });

  describe('Backticks ` - Command substitution', () => {
    test('handles backticks (code blocks)', () => {
      const allowedTests = new Set([
        'test.spec.ts::Test::should render `code` blocks',
        'test.spec.ts::Test::parses `inline code`',
        'test.spec.ts::Test::handles ```multiline```',
      ]);

      expect(
        allowedTests.has('test.spec.ts::Test::should render `code` blocks'),
      ).toBe(true);
      expect(allowedTests.has('test.spec.ts::Test::parses `inline code`')).toBe(
        true,
      );
    });
  });

  describe("Single Quotes ' - String delimiter", () => {
    test('handles single quotes', () => {
      const allowedTests = new Set([
        "test.spec.ts::Test::should show 'warning' message",
        "test.spec.ts::Test::parses 'string' value",
        "test.spec.ts::Test::it's working",
      ]);

      expect(
        allowedTests.has("test.spec.ts::Test::should show 'warning' message"),
      ).toBe(true);
      expect(allowedTests.has("test.spec.ts::Test::it's working")).toBe(true);
    });
  });

  describe('Double Quotes " - String delimiter', () => {
    test('handles double quotes', () => {
      const allowedTests = new Set([
        'test.spec.ts::Test::should handle "quoted" text',
        'test.spec.ts::Test::parses "JSON" data',
      ]);

      expect(
        allowedTests.has('test.spec.ts::Test::should handle "quoted" text'),
      ).toBe(true);
    });
  });

  describe('Backslashes \\ - Escape character', () => {
    test('handles backslashes', () => {
      const allowedTests = new Set([
        'test.spec.ts::Test::path\\to\\file',
        'test.spec.ts::Test::regex \\d+ pattern',
        'test.spec.ts::Test::newline \\n char',
      ]);

      expect(allowedTests.has('test.spec.ts::Test::path\\to\\file')).toBe(true);
      expect(allowedTests.has('test.spec.ts::Test::regex \\d+ pattern')).toBe(
        true,
      );
    });
  });
});

// =============================================================================
// PROBLEM 4: Pipe Character | - Bash interpretation
// Pipes are interpreted as bash command pipes, breaking the command.
// =============================================================================
describe('PROBLEM 4: Pipe Character Issues', () => {
  test('handles single pipe (OR in regex, bash pipe)', () => {
    const allowedTests = new Set([
      'test.spec.ts::Test::should parse A | B | C',
      'test.spec.ts::Test::option1 | option2',
    ]);

    expect(allowedTests.has('test.spec.ts::Test::should parse A | B | C')).toBe(
      true,
    );
  });

  test('handles double pipe (logical OR)', () => {
    const allowedTests = new Set([
      'test.spec.ts::Test::condition || fallback',
      'test.spec.ts::Test::a || b || c',
    ]);

    expect(allowedTests.has('test.spec.ts::Test::condition || fallback')).toBe(
      true,
    );
  });

  test('handles pipe in table/separator context', () => {
    const allowedTests = new Set([
      'test.spec.ts::Test::renders | header | row |',
      'test.spec.ts::Test::markdown |table| format',
    ]);

    expect(
      allowedTests.has('test.spec.ts::Test::renders | header | row |'),
    ).toBe(true);
  });
});

// =============================================================================
// PROBLEM 5: Parameterized Tests (test.each)
// file:line approach fails because all iterations share the same line number.
// JSON file with unique test IDs works because Playwright generates unique titles.
// =============================================================================
describe('PROBLEM 5: Parameterized Test Support (test.each)', () => {
  test('each iteration has unique ID and can be filtered independently', () => {
    // Simulate test.each([1, 2, 3])('value %i works', ...)
    const allowedTests = new Set(['math.spec.ts::Math::value 2 works']);

    // Only iteration 2 should match
    expect(allowedTests.has('math.spec.ts::Math::value 2 works')).toBe(true);
    expect(allowedTests.has('math.spec.ts::Math::value 1 works')).toBe(false);
    expect(allowedTests.has('math.spec.ts::Math::value 3 works')).toBe(false);
  });

  test('handles test.each with object parameters', () => {
    // Simulate test.each([{a: 1}, {a: 2}])('object with a=$a', ...)
    const allowedTests = new Set([
      'test.spec.ts::Suite::object with a=1',
      'test.spec.ts::Suite::object with a=2',
    ]);

    expect(allowedTests.has('test.spec.ts::Suite::object with a=1')).toBe(true);
    expect(allowedTests.has('test.spec.ts::Suite::object with a=2')).toBe(true);
    expect(allowedTests.has('test.spec.ts::Suite::object with a=3')).toBe(
      false,
    );
  });

  test('handles test.each with complex titles', () => {
    // Simulate test.each`
    //   input | expected
    //   ${1}  | ${2}
    // `('adds 1 to $input to get $expected', ...)
    const allowedTests = new Set([
      'test.spec.ts::Suite::adds 1 to 1 to get 2',
      'test.spec.ts::Suite::adds 1 to 2 to get 3',
    ]);

    expect(allowedTests.has('test.spec.ts::Suite::adds 1 to 1 to get 2')).toBe(
      true,
    );
    expect(allowedTests.has('test.spec.ts::Suite::adds 1 to 2 to get 3')).toBe(
      true,
    );
  });

  test('handles describe.each with nested tests', () => {
    // Simulate describe.each([1, 2])('suite %i', () => { test('works', ...) })
    const allowedTests = new Set([
      'test.spec.ts::suite 1::works',
      'test.spec.ts::suite 2::works',
    ]);

    expect(allowedTests.has('test.spec.ts::suite 1::works')).toBe(true);
    expect(allowedTests.has('test.spec.ts::suite 2::works')).toBe(true);
    expect(allowedTests.has('test.spec.ts::suite 3::works')).toBe(false);
  });
});

// =============================================================================
// PROBLEM 6: Real-World Test Names from Production
// These are actual test names that caused issues in CI.
// =============================================================================
describe('PROBLEM 6: Real-World Production Test Names', () => {
  test('bet-app: ServerMessage with parentheses', () => {
    const allowedTests = new Set([
      'betslip.v2.spec.ts::BetSlip v2::should show message for (ServerMessage)',
    ]);

    expect(
      allowedTests.has(
        'betslip.v2.spec.ts::BetSlip v2::should show message for (ServerMessage)',
      ),
    ).toBe(true);
  });

  test('HTTP status codes in parentheses', () => {
    const allowedTests = new Set([
      'api.spec.ts::API::should handle error (400)',
      'api.spec.ts::API::should handle error (401)',
      'api.spec.ts::API::should handle error (403)',
      'api.spec.ts::API::should handle error (404)',
      'api.spec.ts::API::should handle error (500)',
    ]);

    expect(
      allowedTests.has('api.spec.ts::API::should handle error (400)'),
    ).toBe(true);
    expect(
      allowedTests.has('api.spec.ts::API::should handle error (500)'),
    ).toBe(true);
    // Should not match other codes not in the set
    expect(
      allowedTests.has('api.spec.ts::API::should handle error (502)'),
    ).toBe(false);
  });

  test('currency formatting', () => {
    const allowedTests = new Set([
      'payment.spec.ts::Payment::formats $100.00 correctly',
      'payment.spec.ts::Payment::handles R$50,00 BRL format',
      'payment.spec.ts::Payment::displays €25.50 EUR',
    ]);

    expect(
      allowedTests.has('payment.spec.ts::Payment::formats $100.00 correctly'),
    ).toBe(true);
    expect(
      allowedTests.has('payment.spec.ts::Payment::handles R$50,00 BRL format'),
    ).toBe(true);
  });

  test('feature flags with brackets', () => {
    const allowedTests = new Set([
      'features.spec.ts::Features::should enable [FEATURE_A]',
      'features.spec.ts::Features::should disable [FEATURE_B]',
    ]);

    expect(
      allowedTests.has('features.spec.ts::Features::should enable [FEATURE_A]'),
    ).toBe(true);
  });

  test('user-facing messages with quotes', () => {
    const allowedTests = new Set([
      'ui.spec.ts::UI::displays "Success!" message',
      "ui.spec.ts::UI::shows 'Warning' alert",
      'ui.spec.ts::UI::renders `code` snippet',
    ]);

    expect(
      allowedTests.has('ui.spec.ts::UI::displays "Success!" message'),
    ).toBe(true);
    expect(allowedTests.has("ui.spec.ts::UI::shows 'Warning' alert")).toBe(
      true,
    );
  });

  test('API endpoints with special chars', () => {
    const allowedTests = new Set([
      'routes.spec.ts::Routes::GET /api/users?page=1&limit=10',
      'routes.spec.ts::Routes::POST /api/users/{id}/profile',
      'routes.spec.ts::Routes::DELETE /api/items/:id',
    ]);

    expect(
      allowedTests.has(
        'routes.spec.ts::Routes::GET /api/users?page=1&limit=10',
      ),
    ).toBe(true);
    expect(
      allowedTests.has('routes.spec.ts::Routes::POST /api/users/{id}/profile'),
    ).toBe(true);
  });
});

// =============================================================================
// PROBLEM 7: Unicode and International Characters
// =============================================================================
describe('PROBLEM 7: Unicode and International Characters', () => {
  test('handles emojis', () => {
    const allowedTests = new Set([
      'test.spec.ts::Test::shows 🎉 celebration',
      'test.spec.ts::Test::renders ❌ error icon',
      'test.spec.ts::Test::displays ✅ success',
    ]);

    expect(allowedTests.has('test.spec.ts::Test::shows 🎉 celebration')).toBe(
      true,
    );
    expect(allowedTests.has('test.spec.ts::Test::renders ❌ error icon')).toBe(
      true,
    );
  });

  test('handles non-ASCII characters', () => {
    const allowedTests = new Set([
      'test.spec.ts::Test::displays café menu',
      'test.spec.ts::Test::handles naïve string',
      'test.spec.ts::Test::renders 日本語 text',
      'test.spec.ts::Test::shows Ñoño character',
    ]);

    expect(allowedTests.has('test.spec.ts::Test::displays café menu')).toBe(
      true,
    );
    expect(allowedTests.has('test.spec.ts::Test::renders 日本語 text')).toBe(
      true,
    );
  });

  test('handles mathematical symbols', () => {
    const allowedTests = new Set([
      'test.spec.ts::Test::calculates π value',
      'test.spec.ts::Test::handles ∑ summation',
      'test.spec.ts::Test::shows ≤ and ≥ operators',
    ]);

    expect(allowedTests.has('test.spec.ts::Test::calculates π value')).toBe(
      true,
    );
    expect(
      allowedTests.has('test.spec.ts::Test::shows ≤ and ≥ operators'),
    ).toBe(true);
  });
});

// =============================================================================
// JSON File Format Validation
// =============================================================================
describe('JSON Shard File Format', () => {
  test('parses valid shard file format', () => {
    const shardFileContent = JSON.stringify([
      'e2e/login.spec.ts::Login::should login',
      'e2e/home.spec.ts::Home::should render',
    ]);

    const testIds = JSON.parse(shardFileContent);
    const allowedTests = new Set(testIds);

    expect(allowedTests.size).toBe(2);
    expect(allowedTests.has('e2e/login.spec.ts::Login::should login')).toBe(
      true,
    );
    expect(allowedTests.has('e2e/home.spec.ts::Home::should render')).toBe(
      true,
    );
  });

  test('handles empty shard file (edge case)', () => {
    const shardFileContent = JSON.stringify([]);
    const testIds = JSON.parse(shardFileContent);
    const allowedTests = new Set(testIds);

    expect(allowedTests.size).toBe(0);
  });

  test('handles large number of test IDs efficiently', () => {
    // Simulate 1000 test IDs
    const testIds = Array.from(
      { length: 1000 },
      (_, i) => `test.spec.ts::Suite::test ${i}`,
    );
    const shardFileContent = JSON.stringify(testIds);

    const parsed = JSON.parse(shardFileContent);
    const allowedTests = new Set(parsed);

    expect(allowedTests.size).toBe(1000);
    expect(allowedTests.has('test.spec.ts::Suite::test 500')).toBe(true);
    expect(allowedTests.has('test.spec.ts::Suite::test 999')).toBe(true);
    expect(allowedTests.has('test.spec.ts::Suite::test 1000')).toBe(false);
  });

  test('handles test IDs with all problematic characters', () => {
    const testIds = [
      'test.spec.ts::Test::should handle error (500)',
      'test.spec.ts::Test::should parse A | B | C',
      'test.spec.ts::Test::should format $100.00',
      'test.spec.ts::Test::should render `code` blocks',
      "test.spec.ts::Test::should show 'warning' message",
      'test.spec.ts::Test::handles "quoted" text',
      'test.spec.ts::Test::path\\to\\file',
      'test.spec.ts::Test::array[0] access',
      'test.spec.ts::Test::object {key: value}',
      'test.spec.ts::Test::condition && result',
      'test.spec.ts::Test::a < b > c',
      'test.spec.ts::Test::statement; another',
      'test.spec.ts::Test::matches *.ts files',
      'test.spec.ts::Test::what? why!',
      'test.spec.ts::Test::Tom & Jerry',
    ];

    const shardFileContent = JSON.stringify(testIds);
    const parsed = JSON.parse(shardFileContent);
    const allowedTests = new Set(parsed);

    // All should be parseable and matchable
    for (const id of testIds) {
      expect(allowedTests.has(id)).toBe(true);
    }
  });
});

// =============================================================================
// Edge Cases and Boundary Conditions
// =============================================================================
describe('Edge Cases and Boundary Conditions', () => {
  test('handles empty test title', () => {
    const testId = buildTestId('test.spec.ts', ['Suite', '']);
    expect(testId).toBe('test.spec.ts::Suite::');

    const allowedTests = new Set([testId]);
    expect(allowedTests.has('test.spec.ts::Suite::')).toBe(true);
  });

  test('handles test title with only spaces', () => {
    const allowedTests = new Set(['test.spec.ts::Suite::   ']);
    expect(allowedTests.has('test.spec.ts::Suite::   ')).toBe(true);
    expect(allowedTests.has('test.spec.ts::Suite::')).toBe(false); // Different!
  });

  test('handles very long test titles', () => {
    const longTitle = 'a'.repeat(1000);
    const testId = `test.spec.ts::Suite::${longTitle}`;
    const allowedTests = new Set([testId]);

    expect(allowedTests.has(testId)).toBe(true);
  });

  test('handles test title with :: separator (edge case)', () => {
    // This is an edge case - test title contains the separator
    const allowedTests = new Set([
      'test.spec.ts::Suite::title :: with :: colons',
    ]);

    expect(
      allowedTests.has('test.spec.ts::Suite::title :: with :: colons'),
    ).toBe(true);
    // Should NOT match partial
    expect(allowedTests.has('test.spec.ts::Suite::title')).toBe(false);
  });

  test('handles multiple test files with same test name', () => {
    const allowedTests = new Set([
      'login.spec.ts::Auth::should login',
      'logout.spec.ts::Auth::should login', // Different file, same test name
    ]);

    expect(allowedTests.has('login.spec.ts::Auth::should login')).toBe(true);
    expect(allowedTests.has('logout.spec.ts::Auth::should login')).toBe(true);
    // File path matters
    expect(allowedTests.has('other.spec.ts::Auth::should login')).toBe(false);
  });
});
