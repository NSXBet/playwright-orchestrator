## ADDED Requirements

### Requirement: Reporter-Based Test Filtering

The system SHALL provide a Custom Playwright Reporter that filters tests at runtime using exact Set lookup.

#### Scenario: Load test IDs from JSON file

- **GIVEN** a JSON file at path specified by `ORCHESTRATOR_SHARD_FILE` env var
- **AND** the file contains an array of test IDs
- **WHEN** the reporter's `onBegin` hook is called
- **THEN** the reporter loads the test IDs into a Set
- **AND** logs the count of loaded tests

#### Scenario: Skip tests not in shard

- **GIVEN** the reporter has loaded allowed test IDs
- **AND** a test with ID not in the allowed set
- **WHEN** the reporter's `onTestBegin` hook is called
- **THEN** the reporter adds `{ type: "skip" }` annotation to the test
- **AND** Playwright skips the test

#### Scenario: Run tests in shard

- **GIVEN** the reporter has loaded allowed test IDs
- **AND** a test with ID in the allowed set
- **WHEN** the reporter's `onTestBegin` hook is called
- **THEN** the reporter does not add skip annotation
- **AND** the test runs normally

#### Scenario: Graceful fallback when no shard file

- **GIVEN** the `ORCHESTRATOR_SHARD_FILE` env var is not set
- **OR** the file does not exist
- **WHEN** the reporter's `onBegin` hook is called
- **THEN** the reporter allows all tests to run
- **AND** no tests are skipped

### Requirement: Exact Test ID Matching

The system SHALL use exact string matching for test IDs, avoiding substring collisions.

#### Scenario: No substring collision

- **GIVEN** shard file contains `["login.spec.ts::Login::should login"]`
- **AND** the test suite has tests:
  - `login.spec.ts::Login::should login`
  - `login.spec.ts::Login::should login with SSO`
- **WHEN** the reporter filters tests
- **THEN** only `should login` runs (exact match)
- **AND** `should login with SSO` is skipped (no substring match)

#### Scenario: Case-sensitive matching

- **GIVEN** shard file contains `["test.spec.ts::Suite::Should Login"]`
- **AND** the test suite has test `test.spec.ts::Suite::should login`
- **WHEN** the reporter filters tests
- **THEN** the test is skipped (case mismatch)

### Requirement: Test ID Format

The system SHALL use consistent test ID format: `{relative-file}::{describe}::{test-title}`.

#### Scenario: Build test ID from TestCase

- **GIVEN** a Playwright TestCase with:
  - `location.file`: `/project/e2e/login.spec.ts`
  - `titlePath()`: `["Login", "should login"]`
- **AND** working directory is `/project`
- **WHEN** the reporter builds the test ID
- **THEN** the ID is `e2e/login.spec.ts::Login::should login`

#### Scenario: Handle nested describes

- **GIVEN** a Playwright TestCase with:
  - `location.file`: `/project/e2e/auth.spec.ts`
  - `titlePath()`: `["Auth", "OAuth", "Google", "should redirect"]`
- **WHEN** the reporter builds the test ID
- **THEN** the ID is `e2e/auth.spec.ts::Auth::OAuth::Google::should redirect`

#### Scenario: Normalize Windows paths

- **GIVEN** a Playwright TestCase with:
  - `location.file`: `C:\project\e2e\login.spec.ts` (Windows)
- **WHEN** the reporter builds the test ID
- **THEN** the path uses forward slashes: `e2e/login.spec.ts::...`

### Requirement: Shell-Safe Test Names

The system SHALL handle test names with special characters without shell escaping issues.

#### Scenario: Parentheses in test name

- **GIVEN** a test named `should show error (500)`
- **AND** it is in the shard file
- **WHEN** Playwright runs with the reporter
- **THEN** the test runs without bash syntax errors

#### Scenario: Pipe character in test name

- **GIVEN** a test named `should parse A | B | C`
- **AND** it is in the shard file
- **WHEN** Playwright runs with the reporter
- **THEN** the test runs without bash pipe interpretation

#### Scenario: Dollar sign in test name

- **GIVEN** a test named `should format $100.00`
- **AND** it is in the shard file
- **WHEN** Playwright runs with the reporter
- **THEN** the test runs without bash variable expansion

### Requirement: Debug Mode

The system SHALL provide debug logging when `ORCHESTRATOR_DEBUG=1`.

#### Scenario: Log skipped tests in debug mode

- **GIVEN** `ORCHESTRATOR_DEBUG=1` env var is set
- **AND** the reporter skips a test
- **WHEN** the test is processed
- **THEN** the reporter logs `[Skip] {testId}` to console

#### Scenario: Silent in normal mode

- **GIVEN** `ORCHESTRATOR_DEBUG` env var is not set
- **AND** the reporter skips a test
- **WHEN** the test is processed
- **THEN** the reporter does not log individual skip messages

### Requirement: Parameterized Test Support

The system SHALL correctly handle `test.each()` parameterized tests.

#### Scenario: Unique ID per parameter set

- **GIVEN** a test defined as `test.each([1, 2, 3])('value %i works', ...)`
- **WHEN** Playwright generates tests
- **THEN** each iteration has a unique title: `value 1 works`, `value 2 works`, `value 3 works`
- **AND** the reporter can filter each iteration independently

#### Scenario: Filter single iteration

- **GIVEN** shard file contains `["math.spec.ts::Math::value 2 works"]`
- **AND** the test uses `test.each([1, 2, 3])('value %i works', ...)`
- **WHEN** the reporter filters tests
- **THEN** only `value 2 works` iteration runs
- **AND** `value 1 works` and `value 3 works` are skipped
