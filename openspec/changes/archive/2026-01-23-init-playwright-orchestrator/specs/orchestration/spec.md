# E2E Test Orchestration

## ADDED Requirements

### Requirement: Test Discovery

The system SHALL discover all tests in a Playwright project.

#### Scenario: Discover tests via Playwright CLI

- **GIVEN** a Playwright project with test files
- **WHEN** the `list-tests` command is executed with `--test-dir`
- **THEN** the system returns a list of all tests with their IDs in format `file::describe::title`

#### Scenario: Fallback to file parsing

- **GIVEN** a Playwright project where `playwright --list` fails
- **WHEN** the `list-tests` command is executed with `--use-fallback`
- **THEN** the system parses test files directly and returns discovered tests

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

The system SHALL distribute tests across shards to minimize the maximum shard duration (makespan).

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

### Requirement: Timing Data Collection

The system SHALL extract timing data from Playwright JSON reports.

#### Scenario: Extract test-level timing

- **GIVEN** a Playwright JSON report with test results
- **WHEN** the `extract-timing` command is executed
- **THEN** the system extracts duration for each test, including retries

#### Scenario: Handle missing report

- **GIVEN** a non-existent report file path
- **WHEN** the `extract-timing` command is executed
- **THEN** the system exits with an error message

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

### Requirement: Grep Pattern Generation

The system SHALL generate regex patterns for Playwright `--grep` flag.

#### Scenario: Generate OR pattern

- **GIVEN** tests assigned to shard 1: ["should create", "should update"]
- **WHEN** grep patterns are generated
- **THEN** shard 1 pattern is `should create|should update`

#### Scenario: Escape regex special characters

- **GIVEN** a test title with special characters: "should handle (edge case)"
- **WHEN** grep pattern is generated
- **THEN** the pattern escapes parentheses: `should handle \(edge case\)`

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
