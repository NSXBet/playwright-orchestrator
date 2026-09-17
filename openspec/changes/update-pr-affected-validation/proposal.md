## Why

The repository now uses Bun workspaces and Turborepo, but pull requests run every expensive package task regardless of which workspace changed. The CI workflow can use Turbo's affected-workspace range filter on pull requests while retaining `main` as the complete verification baseline.

## What Changes

- Update the CI workflow so pull-request linting, type checking, unit tests, and builds target only workspaces affected between the fetchable PR base branch and `HEAD`.
- Preserve formatting as a repository-wide pull-request check and retain complete lint, type-check, test, build, and publication validation on pushes to `main`.
- Make Git history available for the affected range and fail the relevant CI step when the PR base reference cannot be used.
- Keep the implementation scoped to CI/CD configuration without changing the public CLI, package registry, release process, composite-action paths, application code, or test suite.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `repository-workspace`: Define affected-workspace validation behavior for pull requests while retaining full default-branch verification.

## Impact

- Affected code: `.github/workflows/ci.yml`.
- Affected specs: `repository-workspace`.
- Dependencies: existing Bun workspaces and Turborepo; no new runtime dependency is intended.
- Compatibility: the published `@nsxbet/playwright-orchestrator` package, its CLI, npmjs publication, and root-level GitHub Action paths remain unchanged.
