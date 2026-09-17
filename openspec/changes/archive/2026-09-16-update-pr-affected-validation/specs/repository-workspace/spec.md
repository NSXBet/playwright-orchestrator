## ADDED Requirements

### Requirement: Pull-request affected workspace validation

The CI workflow SHALL run Turbo-backed lint, type-check, unit-test, build, and package-publication validation only for workspaces affected by the range from the pull request's fetchable base branch to `HEAD`. Repository-wide formatting validation SHALL continue to run for every pull request.

#### Scenario: Package change in a pull request

- **GIVEN** a pull request changes files owned by the publishable orchestrator workspace
- **WHEN** CI runs a Turbo-backed validation task
- **THEN** the task SHALL use the affected-workspace range from `origin/<base-branch>` to `HEAD`
- **AND** the orchestrator workspace SHALL be selected for validation

#### Scenario: No affected package workspace

- **GIVEN** a pull request changes only repository files that do not affect a workspace
- **WHEN** CI runs a Turbo-backed validation task
- **THEN** the task SHALL complete without running an unrelated workspace task
- **AND** repository-wide formatting validation SHALL still run

#### Scenario: Base reference is unavailable

- **GIVEN** a pull-request CI runner cannot resolve the declared base branch as `origin/<base-branch>`
- **WHEN** CI prepares an affected-workspace range
- **THEN** it SHALL fetch the base branch before determining affected workspaces
- **AND** it SHALL fail rather than silently omit the affected-workspace validation

### Requirement: Complete default-branch validation

The CI workflow SHALL run repository-wide lint, type-check, unit-test, build, and package-publication validation on pushes to `main`.

#### Scenario: Push to main

- **GIVEN** a commit is pushed to `main`
- **WHEN** CI executes
- **THEN** every workspace SHALL be included in each Turbo-backed validation task
- **AND** package-publication validation SHALL run against the complete built package
