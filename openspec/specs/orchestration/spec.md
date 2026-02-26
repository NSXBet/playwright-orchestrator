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

The system SHALL extract timing data from Playwright JSON reports scoped to a specific project. With `--test-list`, reports are natively clean and no shard-file filtering is needed.

#### Scenario: Extract timing from clean report

- **GIVEN** a Playwright JSON report produced with `--test-list` filtering
- **AND** the report contains only tests that ran in this shard
- **AND** a project name
- **WHEN** the `extract-timing` command is executed with `--project`
- **THEN** the system extracts timing for ALL tests in the report

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

### Requirement: Exact Test ID Matching

The system SHALL use exact string matching for test IDs, avoiding substring collisions. With `--test-list`, Playwright performs the matching internally using the test-list file content.

#### Scenario: No substring collision

- **GIVEN** the test-list file contains `login.spec.ts › Login › should login`
- **AND** the test suite has tests:
  - `login.spec.ts::Login::should login`
  - `login.spec.ts::Login::should login with SSO`
- **WHEN** Playwright runs with `--test-list`
- **THEN** only `should login` is in the suite tree (exact match)
- **AND** `should login with SSO` is not in the suite tree

#### Scenario: Case-sensitive matching

- **GIVEN** the test-list file contains `test.spec.ts › Suite › Should Login`
- **AND** the test suite has test `test.spec.ts::Suite::should login`
- **WHEN** Playwright runs with `--test-list`
- **THEN** `should login` is not in the suite tree (case mismatch)

### Requirement: Test ID Format

The system SHALL use consistent test ID format: `{relative-file}::{describe}::{test-title}`. File paths are relative to `project.testDir`. Test IDs are generated during discovery (`buildTestId` from Playwright JSON) and extract-timing (from report suites).

#### Scenario: Build test ID from discovery JSON

- **GIVEN** a Playwright test list JSON with:
  - suite file: `/project/e2e/login.spec.ts`
  - title path: `["Login", "should login"]`
- **AND** `testDir` is `/project`
- **WHEN** the system builds the test ID
- **THEN** the ID is `e2e/login.spec.ts::Login::should login`

#### Scenario: Handle nested describes

- **GIVEN** a Playwright test with:
  - file: `/project/e2e/auth.spec.ts`
  - title path: `["Auth", "OAuth", "Google", "should redirect"]`
- **WHEN** the system builds the test ID
- **THEN** the ID is `e2e/auth.spec.ts::Auth::OAuth::Google::should redirect`

#### Scenario: Normalize Windows paths

- **GIVEN** a test file path with backslashes: `e2e\login.spec.ts`
- **WHEN** the system builds the test ID
- **THEN** the path uses forward slashes: `e2e/login.spec.ts::...`

### Requirement: Parameterized Test Support

The system SHALL correctly handle `test.each()` parameterized tests. Each iteration produces a unique test ID and a unique line in the test-list file.

#### Scenario: Unique ID per parameter set

- **GIVEN** a test defined as `test.each([1, 2, 3])('value %i works', ...)`
- **WHEN** Playwright generates tests
- **THEN** each iteration has a unique title: `value 1 works`, `value 2 works`, `value 3 works`
- **AND** each iteration can be assigned to different shards independently

#### Scenario: Filter single iteration via test-list

- **GIVEN** the test-list file contains `math.spec.ts › Math › value 2 works`
- **AND** the test uses `test.each([1, 2, 3])('value %i works', ...)`
- **WHEN** Playwright runs with `--test-list`
- **THEN** only `value 2 works` iteration is in the suite tree
- **AND** `value 1 works` and `value 3 works` are not in the suite tree

### Requirement: File Affinity Distribution

The system SHALL support a file affinity penalty that discourages splitting tests from the same file across different shards, reducing redundant page/context initialization costs.

#### Scenario: File affinity enabled by default

- **GIVEN** the `assign` command is executed without `--file-affinity` flag
- **AND** timing data is available
- **WHEN** tests are distributed across shards
- **THEN** the file affinity penalty is automatically calculated from timing data (P25 of per-file average durations)
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
- **THEN** the penalty equals the P25 of per-file averages [10s, 20s, 32.5s, 45s] (approximately 17.5s)

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

### Requirement: Test List Output Format

The `assign` command SHALL include `testListFiles` in its JSON output, containing shard assignments in Playwright's `--test-list` format. File paths in the output SHALL be relative to `config.rootDir` (not `project.testDir`), matching Playwright's `--test-list` path resolution. Each line uses ` › ` (space-surrounded single right-pointing angle quotation mark, U+203A) as the delimiter between file path, describe blocks, and test title.

#### Scenario: JSON output includes testListFiles

- **GIVEN** the `assign` command is executed with `--output-format json`
- **AND** tests are assigned to shards
- **WHEN** the output is generated
- **THEN** the JSON includes a `testListFiles` object mapping shard index to test-list content
- **AND** each value is a string with one test per line in `path/to/file.spec.ts › Suite › Test` format
- **AND** file paths are relative to `rootDir`

#### Scenario: testListFiles JSON structure

- **GIVEN** 2 shards with tests assigned
- **AND** `testDir` is `src/test/e2e` relative to `rootDir`
- **WHEN** the `assign` command produces JSON output
- **THEN** `testListFiles` has structure: `{"1": "src/test/e2e/login.spec.ts › Login › should login\nsrc/test/e2e/home.spec.ts › Home › should render\n", "2": "src/test/e2e/checkout.spec.ts › Checkout › should pay\n"}`
- **AND** each value is a complete, ready-to-write test-list file content

#### Scenario: Convert internal IDs to test-list format (simple project)

- **GIVEN** an internal test ID `login.spec.ts::Login::should login`
- **AND** `testDir` equals `rootDir`
- **WHEN** it is converted to test-list format
- **THEN** the result is `login.spec.ts › Login › should login`

#### Scenario: Convert internal IDs to test-list format (monorepo)

- **GIVEN** an internal test ID `login.spec.ts::Login::should login`
- **AND** `rootDir` is `/project`
- **AND** `testDir` is `/project/src/test/e2e`
- **WHEN** it is converted to test-list format
- **THEN** the result is `src/test/e2e/login.spec.ts › Login › should login`
- **AND** the file path is relative to `rootDir`, not `testDir`

#### Scenario: Convert file-level test (no describe block)

- **GIVEN** an internal test ID `simple.spec.ts::should work`
- **AND** `testDir` equals `rootDir`
- **WHEN** it is converted to test-list format
- **THEN** the result is `simple.spec.ts › should work`

#### Scenario: Handle nested describes in test-list format

- **GIVEN** an internal test ID `auth.spec.ts::Auth::OAuth::Google::should redirect`
- **AND** `testDir` equals `rootDir`
- **WHEN** it is converted to test-list format
- **THEN** the result is `auth.spec.ts › Auth › OAuth › Google › should redirect`

#### Scenario: Handle test name containing the › delimiter character

- **GIVEN** an internal test ID `nav.spec.ts::Breadcrumb::should show Home › Settings › Profile`
- **AND** `testDir` equals `rootDir`
- **WHEN** it is converted to test-list format
- **THEN** the result is `nav.spec.ts › Breadcrumb › should show Home › Settings › Profile`
- **AND** Playwright's parser matches the test correctly because it splits left-to-right and assigns the remainder to the test title

### Requirement: Test Discovery Config Exposure

The test discovery module SHALL expose `rootDir` and `testDir` from the Playwright config alongside the discovered tests. This is needed by the `assign` command to compute the testDir-to-rootDir path prefix for test-list format conversion.

#### Scenario: Discovery returns config paths

- **GIVEN** a Playwright test-list JSON with `config.rootDir = "/project"` and `project.testDir = "/project/src/test/e2e"`
- **WHEN** the discovery function is called
- **THEN** it returns the discovered tests AND `rootDir` and `testDir` values
- **AND** the `assign` command can compute `path.relative(rootDir, testDir) = "src/test/e2e"` as the prefix

### Requirement: Pre-Execution Test Filtering via --test-list

The system SHALL use Playwright's `--test-list` CLI flag for test filtering, removing tests from the suite tree before execution instead of skipping them at runtime. No orchestrator code runs inside Playwright's process.

#### Scenario: Tests removed from suite before execution

- **GIVEN** a shard file in test-list format
- **WHEN** Playwright runs with `--test-list <shard-file>`
- **THEN** only tests listed in the file exist in the suite tree
- **AND** non-listed tests are not present in any reporter's `onBegin` suite

#### Scenario: Clean reports without post-processing

- **GIVEN** Playwright runs with `--test-list <shard-file>`
- **AND** any reporter is configured (JSON, HTML, blob)
- **WHEN** the test run completes
- **THEN** the report contains only tests that were in the shard file
- **AND** no post-processing or filtering is needed

#### Scenario: Clean merged reports across shards

- **GIVEN** multiple shards each run with their own `--test-list <shard-file>`
- **AND** each shard uses the blob reporter
- **WHEN** blob reports are merged with `npx playwright merge-reports`
- **THEN** the merged report contains each test exactly once
- **AND** no orchestrator-skipped tests appear

#### Scenario: No orchestrator integration in playwright.config.ts

- **GIVEN** a user adopting the orchestrator
- **WHEN** they configure their `playwright.config.ts`
- **THEN** no imports from `@nsxbet/playwright-orchestrator` are needed
- **AND** only standard Playwright reporters are configured
- **AND** no fixture wrappers are needed

