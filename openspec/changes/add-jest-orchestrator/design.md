## Context

The repository is a Bun/Turborepo workspace with one public Playwright package and root composite Action paths that are externally referenced. The source Jest repository has an independent, working CLI, its own fixtures, and Action workflows. See proposal.md for motivation and `jest-orchestration` for observable behavior.

## Goals / Non-Goals

**Goals:**

- Preserve the Jest project's tested source behavior while using file-level assignment as the default scheduling policy.
- Keep Playwright and Jest packages, Actions, fixtures, and E2E workflows independently runnable.
- Make both packages publishable through the existing public npm/Changesets release mechanism.

**Non-Goals:**

- Unify the Playwright and Jest command implementations, timing schemas, or action interfaces.
- Replace the existing Playwright actions or change their public paths.
- Support Jest versions before 30 or non-circus exact-selection runtimes.

## Decisions

### Independent publishable package

Copy the Jest implementation into `packages/jest-orchestrator/` with package-local TypeScript configuration and scripts matching the root Turbo task names. This preserves the source package's CLI and library API and lets Turbo schedule it beside the Playwright package.

Alternative: merge Jest concepts into the Playwright package. Rejected because the test frameworks' discovery, identity, selection, and report contracts differ materially.

### Namespaced root Actions

Expose a cached npm installer at `.github/actions/setup-jest-orchestrator` and Jest orchestration Actions at `.github/actions/jest-orchestrate`, `.github/actions/jest-get-shard`, and `.github/actions/jest-merge-timing`. `run-shard` remains a CLI command rather than a redundant extract Action because it must launch Jest with the selection shim and owns the resulting report/timing artifact. Workflows use the Jest-prefixed paths, while the original unprefixed paths remain Playwright-only.

Alternative: make generic framework-selecting Actions. Rejected because it would change established external contracts and introduce framework-specific branching into user-facing Actions.

### Parallel fixture coverage

Add Jest configuration and Jest test files to the existing `examples/basic` and `examples/monorepo/apps/web` directories. Reproduce the Playwright fixture variety using Jest semantics: deep paths, nesting, parameterization, skip/todo cases, Unicode, `::`, case variants, duplicate names, and special characters. File-level assignment is the default for the CLI, Actions, and workflows; explicit `test` selection remains available. Separate workflow names and filenames keep the two framework E2E pipelines independent.

### Tarball-based E2E workflows

Jest E2E jobs build and pack only `packages/jest-orchestrator`, install that tarball in downstream jobs, then exercise the root Jest Actions and CLI. This matches the Playwright monorepo E2E's consumer-like installation boundary and catches missing published files.

## Risks / Trade-offs

- **Jest fixture dependencies differ from Playwright's** → each example retains its own npm manifest and lockfile, avoiding changes to Playwright test execution.
- **Exact selection depends on Jest internals** → declare Jest 30+ and retain unit coverage for hostile names, focus mode, duplicate identities, and run verification.
- **Two E2E pipelines increase workflow time** → Jest workflows run only on relevant changes and remain manually dispatchable through dedicated Make targets.
- **Source project tooling differs from the workspace** → retain Jest source behavior but align formatting, linting, scripts, and lockfile with Bun/Turborepo before release.

## Migration Plan

1. Copy the Jest package source, unit tests, and selection-shim build asset into a new workspace package; align package metadata with the public npm repository.
2. Add namespaced Jest Actions, Jest fixture cases, and basic/monorepo E2E workflows.
3. Update root task orchestration, CI paths, release/package verification, Make targets, and documentation.
4. Validate package tasks, full workspace checks, package tarballs, Action syntax, and both Jest E2E workflows. Roll back by reverting the feature commits; existing Playwright interfaces remain untouched.
