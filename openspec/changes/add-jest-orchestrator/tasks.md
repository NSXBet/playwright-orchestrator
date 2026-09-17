## 1. Workspace package

- [x] 1.1 Copy the Jest orchestrator source, CLI entry point, selection shim, package metadata, TypeScript configuration, and unit coverage into `packages/jest-orchestrator/`.
- [x] 1.2 Align the package with Bun/Turborepo scripts, public npm metadata, root lockfile, and Changesets publishing while retaining its Jest 30 peer dependency.
- [x] 1.3 Validate exact selection, timing merge, and default file-level plus opt-in test-level assignment through the copied package unit suite.

## 2. Jest Actions and fixtures

- [x] 2.1 Add root `setup-jest-orchestrator`, `jest-orchestrate`, `jest-get-shard`, and `jest-merge-timing` composite Actions without altering existing Playwright Action paths.
- [x] 2.2 Add Jest configuration and representative basic fixture coverage, including timing-aware test and file assignment modes.
- [x] 2.3 Add Jest configuration and the equivalent edge-case coverage to the monorepo fixture, including nested, parameterized, skipped, Unicode, separator, duplicate, case-sensitive, special-character, deep-path, and intentional-failure cases.

## 3. E2E workflows and contributor integration

- [x] 3.1 Add a basic Jest E2E workflow using the Jest Actions, cached timing data, default file-level shard execution, and merged timing validation.
- [x] 3.2 Add a monorepo Jest E2E workflow that packs and installs the Jest workspace package, validates exact shard coverage, merges timing artifacts, and validates timing round trips.
- [x] 3.3 Update CI path filters, Make targets, root/package documentation, release/package validation, and an external Jest integration guide/workflow for the second public package.

## 4. Verification

- [x] 4.1 Run formatting, lint, type-check, unit tests, builds, package dry-runs, and OpenSpec validation.
- [x] 4.2 Run Action syntax checks and the basic and monorepo Jest E2E workflows with Act.
- [x] 4.3 Create a changeset for the new public Jest package and open the feature PR.
