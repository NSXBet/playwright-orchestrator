## MODIFIED Requirements

### Requirement: All-Shards Output Mode

The orchestrate action SHALL output all shard assignments as pre-formatted test-list content when `shard-index` is omitted. The output uses `test-list-files` (replacing the former `shard-files`), where each value is a ready-to-write string in Playwright's `--test-list` format with rootDir-relative file paths.

#### Scenario: Omit shard-index for all shards

- **GIVEN** the orchestrate action is called without `shard-index`
- **WHEN** the action runs successfully
- **THEN** it outputs `test-list-files` containing pre-formatted test-list content per shard as JSON
- **AND** it outputs `expected-durations` for each shard
- **AND** it outputs `use-orchestrator=true`

#### Scenario: Fallback when orchestration fails

- **GIVEN** the orchestrate action fails (CLI error or invalid output)
- **WHEN** the error is caught
- **THEN** it outputs `use-orchestrator=false`
- **AND** it outputs `test-list-files={}` (empty object)

### Requirement: Get-Shard Helper Action

The system SHALL provide a `get-shard` action that extracts test arguments for a specific shard. The action SHALL receive `test-list-files` from the orchestrate action and write one shard's content to a Playwright test-list file.

#### Scenario: Extract shard as test-list file

- **GIVEN** a `test-list-files` JSON from orchestrate action
- **AND** a `shard-index` to extract
- **WHEN** the get-shard action runs
- **THEN** it writes the shard's pre-formatted test-list content to a plain text file (`.txt`)
- **AND** the file contains one test per line in Playwright's `--test-list` format
- **AND** it outputs `test-list-file` with the path to the file
- **AND** it outputs `has-tests=true`
- **AND** it outputs `test-count` with the number of tests (counted by non-empty lines in the test-list content)

#### Scenario: Fallback to native sharding

- **GIVEN** `test-list-files` is empty or missing the shard
- **WHEN** the get-shard action runs
- **THEN** it outputs `fallback-args=--shard=N/M` (native Playwright format)
- **AND** it outputs `has-tests=false`
- **AND** `test-list-file` output is empty

#### Scenario: Simple usage with --test-list

- **GIVEN** a user in a matrix job
- **WHEN** they use the get-shard action
- **THEN** they can run `npx playwright test --test-list ${{ steps.shard.outputs.test-list-file }}`
- **AND** only the tests assigned to their shard are in the suite tree
- **AND** reports are natively clean

### Requirement: Native Sharding Fallback

The orchestrate action SHALL fallback to Playwright's native `--shard` flag when orchestration fails or is unavailable. With `--test-list`, the fallback uses `--shard=N/M` instead of the former `grep-pattern` output.

#### Scenario: CLI failure triggers fallback

- **GIVEN** the orchestrator CLI fails to execute
- **WHEN** the action catches the error
- **THEN** `use-orchestrator` output is `false`
- **AND** `test-list-files={}` output is empty
- **AND** a warning is emitted to the workflow log

#### Scenario: Empty shard triggers fallback

- **GIVEN** the orchestrator assigns zero tests to a shard
- **WHEN** the get-shard action processes the result
- **THEN** it outputs `fallback-args=--shard=N/M` (native Playwright format)
- **AND** the workflow can use native sharding for that shard

#### Scenario: Successful orchestration

- **GIVEN** the orchestrator successfully assigns tests
- **WHEN** tests are assigned to the shard
- **THEN** `use-orchestrator` output is `true`
- **AND** `test-list-files` contains pre-formatted test-list content per shard

### Requirement: Encapsulated Complexity

Actions SHALL encapsulate all parsing and fallback logic. Users SHALL NOT need shell scripting for basic usage. The workflow uses `--test-list` for clean, zero-workaround integration.

#### Scenario: No jq required

- **GIVEN** a user following the documentation
- **WHEN** they implement the three-phase workflow
- **THEN** they do not need to write jq commands
- **AND** they do not need shell scripting for JSON parsing

#### Scenario: Zero playwright.config.ts changes

- **GIVEN** a user adopting the orchestrator with `--test-list`
- **WHEN** they configure their project
- **THEN** they do NOT need to add any orchestrator imports to playwright.config.ts
- **AND** they do NOT need to install `@nsxbet/playwright-orchestrator` as a project dependency
- **AND** the orchestrator is purely a CI tool (CLI + Actions)

## REMOVED Requirements

### Requirement: Filter Report Action
**Reason**: With `--test-list`, reports are natively clean. The `filter-report` action is no longer needed.
**Migration**: Remove `filter-report` step from CI workflows.

#### Scenario: Removal justification
- **WHEN** all shards use `--test-list` for filtering
- **THEN** merged reports are natively clean
- **AND** no post-merge filter-report step is needed
