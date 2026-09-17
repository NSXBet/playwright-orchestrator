## ADDED Requirements

### Requirement: Jest publishable workspace package

The repository SHALL manage `@nsxbet/jest-orchestrator` as a second publishable package at `packages/jest-orchestrator/` from the private Bun workspace root. It SHALL target the public npm registry and participate in root Turbo validation and Changesets publishing.

#### Scenario: Root workspace validation

- **WHEN** a contributor runs root build, lint, type-check, or test commands
- **THEN** the corresponding Jest package task SHALL be included in the Turbo task graph

#### Scenario: Package publication metadata

- **WHEN** the Jest package is packed or published
- **THEN** it SHALL retain the package name `@nsxbet/jest-orchestrator`
- **AND** it SHALL target the public npm registry
- **AND** its CLI binary and public library exports SHALL be available
