# external-integration Specification

## Purpose
TBD - created by archiving change add-external-usage. Update Purpose after archive.
## Requirements
### Requirement: Setup Action for External Users

The system SHALL provide a GitHub Action that installs and caches the playwright-orchestrator CLI for use in external repositories.

#### Scenario: First installation

- **GIVEN** a workflow in an external repository
- **WHEN** the setup action runs for the first time
- **THEN** the CLI is installed via npm
- **AND** the installation is cached for future runs
- **AND** the CLI is added to PATH

#### Scenario: Cached installation

- **GIVEN** a workflow that previously ran the setup action
- **WHEN** the setup action runs again with the same version
- **THEN** the CLI is restored from cache
- **AND** no npm install is performed

#### Scenario: Version pinning

- **GIVEN** a workflow specifying `version: 1.2.3`
- **WHEN** the setup action runs
- **THEN** version 1.2.3 is installed (not latest)

### Requirement: Storage-Agnostic Actions

The orchestrate, extract-timing, and merge-timing actions SHALL NOT perform cache or artifact operations internally. Users control storage.

#### Scenario: Orchestrate without internal cache

- **GIVEN** the orchestrate action is called
- **WHEN** timing data exists
- **THEN** the user provides the path via `timing-file` input
- **AND** the action does NOT call actions/cache internally

#### Scenario: Extract-timing without artifact upload

- **GIVEN** the extract-timing action completes
- **WHEN** timing data is extracted to output file
- **THEN** the action does NOT upload artifacts
- **AND** the user uploads artifacts in a subsequent step if needed

#### Scenario: Merge-timing without cache handling

- **GIVEN** the merge-timing action is called
- **WHEN** timing files need to be merged
- **THEN** the user provides all file paths via inputs
- **AND** the action does NOT restore or save cache

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

### Requirement: Cancellation-Aware Steps

Steps that run after tests (extract-timing, merge-timing) SHALL use `success() || failure()` condition, NOT `always()`.

#### Scenario: Workflow cancelled

- **GIVEN** a workflow with extract-timing step using `if: success() || failure()`
- **WHEN** the user cancels the workflow
- **THEN** the extract-timing step does NOT run

#### Scenario: Tests failed

- **GIVEN** a workflow with extract-timing step using `if: success() || failure()`
- **WHEN** the test step fails
- **THEN** the extract-timing step still runs
- **AND** timing data is captured for future optimization

### Requirement: NPM Package Publishing

The playwright-orchestrator CLI SHALL be published to npm for external installation.

#### Scenario: Install via npm

- **GIVEN** the package is published to npm
- **WHEN** a user runs `npm install -g @nsxbet/playwright-orchestrator`
- **THEN** the CLI is installed and available as `playwright-orchestrator`

#### Scenario: Version available

- **GIVEN** a release is tagged as v1.0.0
- **WHEN** the release workflow runs
- **THEN** version 1.0.0 is published to npm
- **AND** users can install with `@nsxbet/playwright-orchestrator@1.0.0`

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

