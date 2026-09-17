## Purpose

Defines a self-contained E2E lifecycle that proves discovery, assignment, execution, timing collection, and timing reuse for each supported test framework.

## ADDED Requirements

### Requirement: Isolated cold-to-warm E2E lifecycle

The repository SHALL run cold and warm orchestration rounds in the same representative monorepo E2E workflow for Playwright and Jest. The cold round SHALL begin without a timing store, and the exact discovered input and merged cold timing store SHALL be provided to the warm assignment.

#### Scenario: Cold round completes

- **WHEN** a monorepo E2E workflow starts without a timing store
- **THEN** it SHALL discover, assign, execute, and merge timings for every assigned shard

#### Scenario: Warm round consumes cold measurements

- **WHEN** the cold timing merge completes
- **THEN** the workflow SHALL assign and execute a second shard round using that exact merged store
- **AND** the second merge SHALL record repeated observations for timings executed in both rounds

### Requirement: Lifecycle coverage and diagnostic summary

The repository SHALL validate exact per-round coverage and write the lifecycle evidence to `$GITHUB_STEP_SUMMARY`. The summary SHALL include run configuration, cold and warm plan load tables, execution/measurement counts, timing hand-off evidence, a cold-versus-warm diagnostic, and a final invariant checklist.

#### Scenario: Exact per-round coverage

- **WHEN** either E2E round completes
- **THEN** every discovered test occurrence SHALL be assigned exactly once across non-empty shards
- **AND** each shard report SHALL contain no unassigned occurrence and omit no assigned occurrence
- **AND** static skipped or todo tests SHALL be included in coverage but excluded from required timing measurements

#### Scenario: Diagnostic lifecycle summary

- **WHEN** the workflow completes or detects a lifecycle validation failure
- **THEN** its job summary SHALL identify the round, expected and actual values, affected shard or identity when applicable, and the artifact/report path to inspect

### Requirement: Sparse shard plans

Manual lifecycle coverage SHALL support a five-shard run. A valid empty shard plan SHALL be a successful no-op and SHALL NOT fall back to native framework sharding.

#### Scenario: Empty assigned shard

- **WHEN** a valid orchestrator assignment contains no tests for a shard
- **THEN** the shard SHALL not execute unassigned framework tests
- **AND** coverage validation SHALL still require complete exact coverage across non-empty shards
