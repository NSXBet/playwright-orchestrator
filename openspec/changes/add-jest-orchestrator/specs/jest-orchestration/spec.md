## Purpose

Defines exact, timing-aware distribution of Jest tests across CI shards without regex-based test selection ambiguity.

## ADDED Requirements

### Requirement: Jest test discovery and exact shard execution

The system SHALL provide `@nsxbet/jest-orchestrator` as a public npm package that discovers Jest 30+ tests, assigns them to shards, and executes each shard using exact `(file, fullName)` selection. The package SHALL verify after execution that every assigned test executed and no unassigned test executed.

#### Scenario: Tests with ambiguous names

- **GIVEN** a Jest suite contains test titles with shared prefixes, differing case, duplicate full names, or regular-expression metacharacters
- **WHEN** an assigned Jest shard executes
- **THEN** only its exact assigned test occurrences SHALL execute
- **AND** an execution mismatch SHALL fail rather than silently selecting a different test

#### Scenario: Jest version support

- **GIVEN** a consumer configures Jest 30 or later with the default jest-circus runner
- **WHEN** the consumer runs the orchestrator pipeline
- **THEN** discovery and exact shard execution SHALL be supported

### Requirement: Jest assignment granularity and timing learning

The Jest orchestrator SHALL support test-level assignment by default and file-level assignment on request. It SHALL use historical per-test timings when present, estimate unknown durations consistently with the repository's orchestration behavior, and merge shard timings with EMA smoothing.

#### Scenario: File-level assignment

- **GIVEN** a consumer requests file-level assignment
- **WHEN** the orchestrator creates shard plans
- **THEN** all discovered tests in an individual file SHALL be assigned to one shard

#### Scenario: First execution without timings

- **GIVEN** no Jest timing file exists
- **WHEN** tests are assigned and executed
- **THEN** the orchestrator SHALL assign tests using estimates
- **AND** merged shard artifacts SHALL produce timing data for later assignments

### Requirement: Jest GitHub Actions integration

The repository SHALL expose root composite Actions named `jest-orchestrate`, `jest-get-shard`, and `jest-merge-timing` for consumers to create, retrieve, and merge Jest shard plans. These Actions SHALL be distinct from the existing Playwright action paths.

#### Scenario: Existing Playwright Actions

- **GIVEN** an existing consumer references a Playwright action at `.github/actions/orchestrate`, `.github/actions/get-shard`, or `.github/actions/merge-timing`
- **WHEN** the Jest integration is added
- **THEN** the existing Playwright action path and contract SHALL remain available

#### Scenario: Jest workflow pipeline

- **GIVEN** a GitHub Actions workflow uses the Jest-prefixed Actions with a discovered project root and shard count
- **WHEN** the workflow runs its orchestrate, shard, and merge phases
- **THEN** it SHALL exchange a shard assignment artifact and timing artifacts without a storage backend dependency
