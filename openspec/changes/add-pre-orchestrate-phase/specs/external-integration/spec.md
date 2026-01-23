## ADDED Requirements

### Requirement: All-Shards Output Mode

The orchestrate action SHALL support outputting all shard assignments when `shard-index` is omitted.

#### Scenario: Omit shard-index for all shards

- **GIVEN** the orchestrate action is called without `shard-index`
- **WHEN** the action runs successfully
- **THEN** it outputs `shard-files` containing all shard assignments as JSON
- **AND** it outputs `expected-durations` for each shard
- **AND** it outputs `use-orchestrator=true`

#### Scenario: Fallback when orchestration fails

- **GIVEN** the orchestrate action fails (CLI error or invalid output)
- **WHEN** the error is caught
- **THEN** it outputs `use-orchestrator=false`
- **AND** it outputs `shard-files={}` (empty object)

### Requirement: Get-Shard Helper Action

The system SHALL provide a `get-shard` action that extracts test arguments for a specific shard.

#### Scenario: Extract shard files

- **GIVEN** a `shard-files` JSON from orchestrate action
- **AND** a `shard-index` to extract
- **WHEN** the get-shard action runs
- **THEN** it outputs `test-args` with the file list for that shard
- **AND** it outputs `has-files=true`

#### Scenario: Fallback to native sharding

- **GIVEN** `shard-files` is empty or missing the shard
- **WHEN** the get-shard action runs
- **THEN** it outputs `test-args=--shard=N/M` (native Playwright format)
- **AND** it outputs `has-files=false`

#### Scenario: Simple usage

- **GIVEN** a user in a matrix job
- **WHEN** they use the get-shard action
- **THEN** they can run `npx playwright test ${{ steps.shard.outputs.test-args }}`
- **AND** it works regardless of orchestration success (files or fallback)

### Requirement: Encapsulated Complexity

Actions SHALL encapsulate all parsing and fallback logic. Users SHALL NOT need shell scripting for basic usage.

#### Scenario: No jq required

- **GIVEN** a user following the documentation
- **WHEN** they implement the three-phase workflow
- **THEN** they do not need to write jq commands
- **AND** they do not need shell scripting for JSON parsing

#### Scenario: User controls only storage

- **GIVEN** the three-phase workflow
- **WHEN** the user configures their workflow
- **THEN** they only control cache keys and artifact paths
- **AND** all orchestration logic is handled by actions
