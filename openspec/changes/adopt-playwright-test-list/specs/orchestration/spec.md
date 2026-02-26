## ADDED Requirements

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

## MODIFIED Requirements

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

## REMOVED Requirements

### Requirement: Reporter JSON Filtering
**Reason**: With `--test-list`, Playwright reports are natively clean. The entire custom reporter is unnecessary — built-in reporters produce correct output when the suite tree only contains shard tests.
**Migration**: Remove `@nsxbet/playwright-orchestrator/reporter` from `playwright.config.ts`. Use standard Playwright reporters only.

#### Scenario: Removal justification
- **WHEN** `--test-list` is used for test filtering
- **THEN** the suite tree only contains shard tests
- **AND** built-in reporters (list, json, html, blob) produce correct output natively

### Requirement: Report Filtering Command
**Reason**: With `--test-list`, merged reports are natively clean. The `filter-report` command and action are no longer needed.
**Migration**: Remove `filter-report` step from CI workflows.

#### Scenario: Removal justification
- **WHEN** all shards use `--test-list` for filtering
- **THEN** merged reports contain each test exactly once
- **AND** no post-merge cleanup is needed

### Requirement: Reporter-Based Test Filtering
**Reason**: The fixture (`withOrchestratorFilter`), reporter, and `ORCHESTRATOR_SHARD_FILE` env var are all replaced by Playwright's `--test-list` flag which filters tests before execution. No orchestrator code needs to run inside Playwright's process.
**Migration**: Remove fixture from test setup. Remove reporter from config. Remove `ORCHESTRATOR_SHARD_FILE` from CI workflows. Pass `--test-list` flag instead.

#### Scenario: Removal justification
- **WHEN** `--test-list` is used for test filtering
- **THEN** tests are removed from the suite tree before execution
- **AND** no runtime skipping via `test.skip()` is needed
- **AND** no fixture, reporter, or env var configuration is needed

### Requirement: Shell-Safe Test Names
**Reason**: Shell safety was a concern because test IDs were passed via env vars and CLI arguments through the shell. With `--test-list`, test descriptions are in a plain text file read directly by Playwright — no shell interpretation occurs.
**Migration**: No action needed. The test-list file format inherently avoids shell escaping issues.

#### Scenario: Removal justification
- **WHEN** test descriptions are written to a test-list file
- **THEN** Playwright reads the file directly (no shell interpretation)
- **AND** special characters in test names are preserved without escaping

### Requirement: Debug Mode
**Reason**: Debug mode (`ORCHESTRATOR_DEBUG=1`) was used to show filtered/skipped tests in the reporter output. With `--test-list`, non-shard tests don't exist in the suite — there is nothing to show in debug mode.
**Migration**: No action needed. Use Playwright's `--debug` flag or `PWDEBUG` for debugging.

#### Scenario: Removal justification
- **WHEN** `--test-list` removes non-shard tests from the suite
- **THEN** there are no "filtered" tests to display
- **AND** orchestrator debug logging for test filtering is no longer meaningful
