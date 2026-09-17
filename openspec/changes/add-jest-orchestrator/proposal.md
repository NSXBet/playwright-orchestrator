## Why

The workspace currently orchestrates Playwright tests only. The existing `jest-orchestrator` project provides exact per-test Jest selection, timing-aware shard assignment, and validated CI workflows that should be available alongside the established Playwright package without breaking its public Actions contracts.

## What Changes

- Add public npm package `@nsxbet/jest-orchestrator` at `packages/jest-orchestrator/`, preserving its Jest 30 exact-selection shim, CLI commands, CKK/LPT assignment, timing store, and library exports, with file-level assignment as the default scheduling policy.
- Add distinct root composite Actions: `setup-jest-orchestrator`, `jest-orchestrate`, `jest-get-shard`, and `jest-merge-timing`, leaving existing Playwright action paths unchanged.
- Extend the basic and monorepo fixtures with Jest configurations and test cases covering the same representative path, nesting, parameterization, skip, Unicode, separator, and special-character scenarios as their Playwright counterparts.
- Add Jest basic and monorepo GitHub Actions E2E workflows that package the workspace, install the packed Jest CLI, orchestrate shard execution, validate exact coverage and timing artifacts, merge timings, and validate a timing round trip. Document the external Actions workflow and that `run-shard` is Jest's execution-and-timing-extraction step.
- Integrate the package with the Bun/Turborepo task graph, CI, changesets, documentation, and local Make targets.

## Impact

- Affected specs: `jest-orchestration` (new), `repository-workspace` (modified).
- Affected code: root workspace manifests and tooling, `packages/jest-orchestrator/`, `.github/actions/jest-*`, `.github/workflows/e2e-jest-*.yml`, `examples/basic/`, `examples/monorepo/`, `Makefile`, and documentation.
- Public additions: npm package `@nsxbet/jest-orchestrator`; root Jest-prefixed GitHub Actions. Existing Playwright package and action paths remain compatible.
