## ADDED Requirements

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

The orchestrate action SHALL fallback to Playwright's native `--shard` flag when orchestration fails or is unavailable.

#### Scenario: CLI failure triggers fallback

- **GIVEN** the orchestrator CLI fails to execute
- **WHEN** the action catches the error
- **THEN** `use-native-sharding` output is `true`
- **AND** `shard-arg` output is `--shard=N/M`
- **AND** a warning is emitted to the workflow log

#### Scenario: Empty shard triggers fallback

- **GIVEN** the orchestrator assigns zero tests to a shard
- **WHEN** the action processes the result
- **THEN** `use-native-sharding` output is `true`
- **AND** the workflow can use native sharding for that shard

#### Scenario: Successful orchestration

- **GIVEN** the orchestrator successfully assigns tests
- **WHEN** tests are assigned to the shard
- **THEN** `use-native-sharding` output is `false`
- **AND** `grep-pattern` output contains the test filter

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
