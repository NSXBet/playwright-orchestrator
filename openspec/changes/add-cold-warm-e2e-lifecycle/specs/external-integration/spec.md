## MODIFIED Requirements

### Requirement: Native Sharding Fallback

The orchestrate action SHALL fallback to Playwright's native `--shard` flag only when orchestration fails or is unavailable. With `--test-list`, the fallback uses `--shard=N/M` instead of the former `grep-pattern` output. A valid assignment with zero tests for a shard SHALL instead be a successful no-op to preserve exact orchestrator coverage.

#### Scenario: CLI failure triggers fallback

- **GIVEN** the orchestrator CLI fails to execute
- **WHEN** the action catches the error
- **THEN** `use-orchestrator` output is `false`
- **AND** `test-list-files={}` output is empty
- **AND** a warning is emitted to the workflow log

#### Scenario: Empty shard triggers fallback

- **GIVEN** the orchestrator assigns zero tests to a shard because orchestration is unavailable
- **WHEN** the get-shard action processes the unavailable result
- **THEN** it outputs `fallback-args=--shard=N/M` (native Playwright format)
- **AND** the workflow can use native sharding for that shard

#### Scenario: Empty valid shard is a no-op

- **GIVEN** the orchestrator successfully assigns zero tests to a shard
- **WHEN** the get-shard action processes the valid assignment
- **THEN** it outputs `has-tests=false`
- **AND** it does not output native Playwright arguments that could execute tests outside the assignment
- **AND** the workflow can complete that shard without invoking Playwright

#### Scenario: Successful orchestration

- **GIVEN** the orchestrator successfully assigns tests
- **WHEN** tests are assigned to the shard
- **THEN** `use-orchestrator` output is `true`
- **AND** `test-list-files` contains pre-formatted test-list content per shard
