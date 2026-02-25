# E2E Test Orchestration

## Purpose

Intelligent distribution of Playwright tests across CI shards using historical timing data. The orchestrator learns test durations from previous runs and uses the CKK algorithm to balance shards, minimizing total CI time.
## Requirements
### Requirement: Test Discovery

The system SHALL discover all tests from a pre-generated Playwright JSON test list.

#### Scenario: Discover tests from test-list JSON

- **GIVEN** a Playwright project with test files
- **AND** a pre-generated `test-list.json` from `npx playwright test --list --reporter=json`
- **WHEN** the `assign` command is executed with `--test-list`
- **THEN** the system returns a list of all tests with their IDs in format `file::describe::title`

#### Scenario: Missing test-list file

- **GIVEN** the `--test-list` flag is not provided or the file does not exist
- **WHEN** the `assign` command is executed
- **THEN** the system SHALL exit with an error message guiding the user to generate the test list

### Requirement: Duration Estimation

The system SHALL estimate test duration using a fallback strategy when no historical data exists.

#### Scenario: Use same-file average

- **GIVEN** a test with no historical timing data
- **AND** other tests in the same file have timing data
- **WHEN** duration is estimated
- **THEN** the system uses the average duration of tests in the same file

#### Scenario: Use global average

- **GIVEN** a test with no historical timing data
- **AND** no other tests in the same file have timing data
- **AND** other tests in the project have timing data
- **WHEN** duration is estimated
- **THEN** the system uses the global average duration

#### Scenario: Use default constant

- **GIVEN** a test with no historical timing data
- **AND** no timing data exists for any test
- **WHEN** duration is estimated
- **THEN** the system uses the default duration of 30 seconds

### Requirement: Optimal Test Distribution

The system SHALL distribute tests across shards to minimize the maximum shard duration (makespan), considering file affinity penalties when enabled.

#### Scenario: CKK finds optimal solution

- **GIVEN** a list of tests with durations
- **AND** the number of shards
- **WHEN** the `assign` command is executed
- **AND** CKK completes within 500ms timeout
- **THEN** the system returns an optimal distribution with `isOptimal: true`

#### Scenario: LPT fallback on timeout

- **GIVEN** a list of tests with durations
- **AND** the number of shards
- **WHEN** the `assign` command is executed
- **AND** CKK exceeds 500ms timeout
- **THEN** the system falls back to LPT algorithm with `isOptimal: false`

#### Scenario: More shards than tests

- **GIVEN** 3 tests
- **AND** 5 shards requested
- **WHEN** the `assign` command is executed
- **THEN** the system assigns one test per shard, leaving 2 shards empty

#### Scenario: CKK with file affinity penalty

- **GIVEN** a list of tests with durations
- **AND** the number of shards
- **AND** file affinity is enabled with a penalty greater than 0
- **WHEN** the `assign` command is executed
- **THEN** the CKK algorithm uses penalty-adjusted effective durations during branch-and-bound search
- **AND** the output `expectedDurations` reflect actual durations without penalties

### Requirement: Timing Data Collection

The system SHALL extract timing data from Playwright JSON reports, scoped to a specific shard and project.

#### Scenario: Extract test-level timing

- **GIVEN** a Playwright JSON report with test results
- **AND** a shard file listing the tests assigned to this shard
- **AND** a project name
- **WHEN** the `extract-timing` command is executed with `--shard-file` and `--project`
- **THEN** the system extracts duration only for tests listed in the shard file
- **AND** zero-duration orchestrator-skipped entries are excluded

#### Scenario: Handle missing report

- **GIVEN** a non-existent report file path
- **WHEN** the `extract-timing` command is executed
- **THEN** the system exits with an error message

#### Scenario: Handle malformed shard file

- **GIVEN** a shard file that is not valid JSON or not a JSON array
- **WHEN** the `extract-timing` command is executed
- **THEN** the system SHALL exit with a clear error message

### Requirement: Timing Data Merging

The system SHALL merge timing data using Exponential Moving Average (EMA).

#### Scenario: Merge new test timing

- **GIVEN** existing timing data without test X
- **AND** new timing artifact with test X duration
- **WHEN** the `merge-timing` command is executed
- **THEN** test X is added with `runs: 1`

#### Scenario: Update existing test timing with EMA

- **GIVEN** existing timing data with test X (duration: 100s)
- **AND** new timing artifact with test X (duration: 130s)
- **AND** alpha = 0.3
- **WHEN** the `merge-timing` command is executed
- **THEN** test X duration becomes 109s (0.3 * 130 + 0.7 * 100)

#### Scenario: Prune old entries

- **GIVEN** timing data with test X last run 40 days ago
- **AND** prune-days = 30
- **WHEN** the `merge-timing` command is executed
- **THEN** test X is removed from timing data

### Requirement: Graceful Fallback

The system SHALL provide fallback behavior when orchestration fails.

#### Scenario: Fallback to native sharding

- **GIVEN** the orchestrator command fails or returns empty
- **WHEN** CI workflow executes
- **THEN** the workflow falls back to Playwright's native `--shard` flag

#### Scenario: Always collect timing

- **GIVEN** the orchestrator failed and fallback to native sharding
- **WHEN** tests complete
- **THEN** timing data is still collected for future runs (bootstrap)

### Requirement: Storage-Agnostic Design

The system SHALL work with local files without requiring external storage.

#### Scenario: Local file operation

- **GIVEN** a local `timing-data.json` file
- **WHEN** any CLI command is executed
- **THEN** the system reads/writes only to local files

#### Scenario: No GitHub dependency

- **GIVEN** a local environment without GitHub Actions
- **WHEN** the orchestrator commands are executed
- **THEN** all commands work correctly using local files

### Requirement: Local Testing with Act

The system SHALL support local CI testing using Act.

#### Scenario: Deterministic two-run test

- **GIVEN** no existing timing data
- **WHEN** `make act-test` is executed
- **THEN** Run 1 uses fallback distribution
- **AND** Run 2 uses timing-based distribution
- **AND** timing data is persisted between runs

### Requirement: Reporter JSON Filtering

The orchestrator reporter SHALL optionally filter a Playwright JSON report file after all reporters have finished writing, removing tests not assigned to the current shard.

#### Scenario: filterJson option rewrites report in onExit

- **GIVEN** the orchestrator reporter is configured with `filterJson: 'results.json'`
- **AND** a shard file is active via `ORCHESTRATOR_SHARD_FILE`
- **WHEN** all reporters finish and `onExit` is called
- **THEN** the reporter reads `results.json`, removes specs not in the shard file, prunes empty suites, and rewrites the file

#### Scenario: filterJson omitted is a no-op

- **GIVEN** the orchestrator reporter is configured without `filterJson`
- **WHEN** `onExit` is called
- **THEN** no JSON file is read or modified

#### Scenario: No shard file disables filtering

- **GIVEN** the orchestrator reporter is configured with `filterJson: 'results.json'`
- **AND** no `ORCHESTRATOR_SHARD_FILE` is set
- **WHEN** `onExit` is called
- **THEN** no JSON file is modified

### Requirement: Report Filtering Command

The system SHALL provide a `filter-report` CLI command that removes orchestrator-skipped tests from a Playwright JSON report, identified by the annotation `"Not in shard"`.

#### Scenario: Remove orchestrator-skipped tests from merged report

- **GIVEN** a merged Playwright JSON report containing tests from multiple shards
- **AND** some tests have `status: "skipped"` with annotation `description: "Not in shard"`
- **WHEN** the `filter-report` command is executed
- **THEN** those orchestrator-skipped specs are removed
- **AND** genuine user-skipped tests (`test.skip()`, `test.fixme()`) are preserved

#### Scenario: Report with no orchestrator skips is unchanged

- **GIVEN** a Playwright JSON report with no `"Not in shard"` annotations
- **WHEN** the `filter-report` command is executed
- **THEN** the output is identical to the input

#### Scenario: In-place filtering

- **GIVEN** the `filter-report` command is called without `--output-file`
- **WHEN** filtering completes
- **THEN** the input file is overwritten with the filtered report

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

### Requirement: File Affinity Distribution

The system SHALL support a file affinity penalty that discourages splitting tests from the same file across different shards, reducing redundant page/context initialization costs.

#### Scenario: File affinity enabled by default

- **GIVEN** the `assign` command is executed without `--file-affinity` flag
- **AND** timing data is available
- **WHEN** tests are distributed across shards
- **THEN** the file affinity penalty is automatically calculated from timing data (P25 of test durations)
- **AND** the penalty is applied during distribution

#### Scenario: File affinity disabled explicitly

- **GIVEN** the `assign` command is executed with `--no-file-affinity`
- **WHEN** tests are distributed across shards
- **THEN** no file affinity penalty is applied
- **AND** the distribution is identical to the behavior without file affinity

#### Scenario: Auto-calculated penalty from timing data

- **GIVEN** timing data with files:
  - `page-a.spec.ts`: tests at 20s, 25s, 15s (avg 20s)
  - `page-b.spec.ts`: tests at 40s, 50s (avg 45s)
  - `page-c.spec.ts`: tests at 8s, 10s, 12s (avg 10s)
  - `page-d.spec.ts`: tests at 30s, 35s (avg 32.5s)
- **WHEN** the file affinity penalty is calculated
- **THEN** the penalty equals the P25 of per-file averages [10s, 20s, 32.5s, 45s] (approximately 12.5s)

#### Scenario: Fallback penalty when no timing data

- **GIVEN** no timing data exists (first run)
- **AND** file affinity is enabled
- **WHEN** the file affinity penalty is calculated
- **THEN** the penalty defaults to 30 seconds (30000ms)

#### Scenario: Manual penalty override

- **GIVEN** the user runs `assign --file-affinity-penalty 20000`
- **WHEN** the command parses flags
- **THEN** the penalty is set to 20000ms (20 seconds)
- **AND** the auto-calculation is skipped

#### Scenario: Same-file tests grouped with penalty

- **GIVEN** 4 tests from `page-a.spec.ts` (10s, 10s, 10s, 10s) and 4 tests from `page-b.spec.ts` (10s, 10s, 10s, 10s)
- **AND** 2 shards
- **AND** file affinity penalty is 30s
- **WHEN** the `assign` command is executed
- **THEN** all `page-a.spec.ts` tests are on one shard and all `page-b.spec.ts` tests on the other
- **AND** neither file is split across shards

#### Scenario: File split when makespan benefit exceeds penalty

- **GIVEN** 1 test from `heavy.spec.ts` (120s) and 1 test from `heavy.spec.ts` (60s) and 2 tests from `light.spec.ts` (10s, 10s)
- **AND** 2 shards
- **AND** file affinity penalty is 5s
- **WHEN** the `assign` command is executed
- **THEN** the algorithm MAY split `heavy.spec.ts` across shards if that produces a significantly better makespan

#### Scenario: Penalty affects LPT shard selection

- **GIVEN** shard 1 has load 50s and contains tests from `page-a.spec.ts`
- **AND** shard 2 has load 48s and contains no tests from `page-a.spec.ts`
- **AND** the next test to assign is from `page-a.spec.ts` (duration 10s)
- **AND** file affinity penalty is 5s
- **WHEN** the LPT algorithm evaluates shard assignment
- **THEN** shard 1 is preferred (effective load 50+10=60) over shard 2 (effective load 48+10+5=63)

