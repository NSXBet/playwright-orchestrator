## ADDED Requirements

### Requirement: Three-Phase Workflow Pattern

The documentation SHALL describe and recommend a three-phase workflow pattern: orchestrate → run tests → merge timing.

#### Scenario: Three-phase workflow documentation

- **GIVEN** the external integration documentation
- **WHEN** a user reads the "Complete Workflow" section
- **THEN** they see the three-phase pattern with a dedicated orchestrate job
- **AND** the orchestrate job runs before matrix jobs
- **AND** matrix jobs read assignments from `needs.orchestrate.outputs`

#### Scenario: Pass assignments via GitHub outputs

- **GIVEN** an orchestrate job outputs `shard-files` as JSON
- **WHEN** a matrix job references `needs.orchestrate.outputs.shard-files`
- **THEN** the matrix job can parse its file list using jq
- **AND** pass the files directly to Playwright

#### Scenario: Inline fallback logic

- **GIVEN** the orchestrate job runs the assign command
- **WHEN** the command fails or returns invalid JSON
- **THEN** the job outputs `use-orchestrator=false`
- **AND** matrix jobs fall back to native `--shard` flag

### Requirement: File-Level Distribution Recommended

The documentation SHALL recommend file-level distribution (`--level file`) for the three-phase pattern.

#### Scenario: File-level is simpler

- **GIVEN** a user reading the documentation
- **WHEN** they see the recommended workflow
- **THEN** it uses `--level file` by default
- **AND** explains that file list can be passed directly to Playwright

#### Scenario: Test-level alternative

- **GIVEN** a user needs finer granularity
- **WHEN** they read the advanced section
- **THEN** they can use `--level test` with `--grep` patterns
- **AND** trade-offs are documented
