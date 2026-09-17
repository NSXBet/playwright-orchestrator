# Repository Workspace Specification

## Purpose

Defines the Bun workspace boundary for the publishable Playwright orchestrator while preserving its existing consumer-facing package and GitHub Actions contracts.

## Requirements

### Requirement: Publishable workspace package

The repository SHALL manage `@nsxbet/playwright-orchestrator` as a publishable package at `packages/playwright-orchestrator/` from a private Bun workspace root.

#### Scenario: Root workspace build

- **WHEN** a contributor runs the root build command
- **THEN** Turborepo executes the orchestrator package build
- **AND** the package build output is produced under `packages/playwright-orchestrator/dist/`

#### Scenario: Package publication metadata

- **WHEN** the orchestrator package is packed or published
- **THEN** it retains the package name `@nsxbet/playwright-orchestrator`
- **AND** it targets the public npm registry
- **AND** its CLI binary and public exports remain available

### Requirement: Root action path compatibility

The repository SHALL retain composite GitHub Actions at their current `.github/actions/<action>` paths while supporting the workspace package layout internally.

#### Scenario: Existing action reference

- **WHEN** a workflow or external repository references an existing orchestrator action by its documented root path
- **THEN** the action remains resolvable at that path
- **AND** its documented inputs and outputs retain their existing behavior

### Requirement: Root validation workflow

The root workspace SHALL provide consistent build, lint, type-check, and test commands that validate the orchestrator package through the Turbo task graph.

#### Scenario: Contributor validation

- **WHEN** a contributor runs root validation commands
- **THEN** the corresponding package tasks are executed
- **AND** no direct root source-package layout is required

### Requirement: Behavioral preservation

The workspace migration SHALL not change the orchestrator's public CLI or test-distribution behavior.

#### Scenario: Existing CLI invocation

- **WHEN** a consumer installs the migrated package and invokes `playwright-orchestrator assign` with an existing supported set of flags
- **THEN** the command remains available
- **AND** it preserves the established assignment and fallback behavior
