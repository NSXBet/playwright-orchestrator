## Context

`@nsxbet/playwright-orchestrator` is currently both the repository root and the publishable package. NSW is the reference repository: its root is a private Bun/Turbo workspace and each independently released library lives in `packages/<module>`. This repository must retain its existing public npm package and root-level composite-action URLs.

## Goals / Non-Goals

### Goals

- Use an NSW-style workspace boundary with the orchestrator as an independently publishable package.
- Retain the public npm package contract: `@nsxbet/playwright-orchestrator`, CLI binary, exports, and npmjs registry.
- Retain root `.github/actions/*` locations so existing action consumers do not need a new action path.
- Make root validation commands delegate through Turborepo and keep local Act/Verdaccio checks functional.

### Non-Goals

- Publishing a new package or moving the package to GitHub Packages.
- Changing the orchestration algorithms, test-ID format, CLI flags, action inputs/outputs, or fallback behavior.
- Adding applications merely to populate an `apps/` directory.

## Decisions

### Publishable-package boundary

Move package-owned assets to `packages/playwright-orchestrator/`: source, unit tests, executable launcher, package manifest, TypeScript/build configuration, and package documentation/changelog. The root becomes private and owns workspaces, shared tooling, GitHub Actions, examples, OpenSpec, and repository documentation.

**Rationale:** This maps directly to NSW's independently versioned library structure and supports future packages without a second migration.

### Root orchestration

The root manifest declares `workspaces: ["packages/*"]`; Turbo owns task dependency and output configuration. Root scripts expose the existing contributor intents (`build`, `lint`, type checking, `test`, release) but dispatch to workspace tasks. Package scripts use NSW command names such as `type-check` and are executed by Turbo.

**Rationale:** Root commands remain predictable while cacheable task execution and package scoping become standard.

### Toolchain alignment

Adopt NSW's Bun/mise/Turbo/Oxlint/Oxfmt/Lefthook conventions, pin all tool versions, and commit Bun's text lockfile. Replace Biome-specific scripts/configuration only after equivalent linting and formatting coverage is configured.

**Rationale:** The user requested a full NSW-style tooling copy rather than a structural-only workspace conversion.

### Stable action paths

Keep `.github/actions/*` at repository root. Workflows and action implementation steps will refer to the workspace package or its packed artifact as needed; external consumers continue using the documented root action paths.

**Rationale:** Moving action directories would change the public GitHub Actions API independently of the monorepo migration.

### Publishing

The child package remains configured for public npm publication. Changesets version and publish only workspace packages; the root package is private and cannot be published.

**Rationale:** Existing consumers install from npm and the requested registry decision is to preserve that contract.

## Risks / Trade-offs

- **Path-sensitive automation can break after the move.** Update every workflow, Makefile target, action command, and test import; verify via root checks, Act targets, and Verdaccio install.
- **Tooling changes can produce unrelated formatting/lint churn.** Configure and run formatters narrowly during migration; do not mix algorithmic changes with mechanical output.
- **Nested package entrypoints can alter packed artifacts.** Inspect `npm pack --dry-run` and install the packed tarball into a clean temporary project before release validation.
- **Turbo does not replace package lifecycle behavior automatically.** Keep package-level build and prepublish lifecycle scripts explicit and test both workspace build and `npm publish` simulation.

## Migration Plan

1. Add the private root workspace, shared NSW-style toolchain, Turbo configuration, and root task scripts.
2. Relocate the publishable package into `packages/playwright-orchestrator/` and update relative imports, package metadata, build/test configuration, and Changesets configuration.
3. Update root-owned actions, workflows, Make targets, documentation, examples, and CI path filters to reference the workspace layout without changing public action paths.
4. Regenerate the Bun lockfile; validate format, lint, type-check, test, build, package contents, and Verdaccio/Act checks.
5. Roll back by reverting this migration as one commit/PR; no consumer package-name or registry migration is needed.

## Open Questions

None. The agreed scope is a full NSW tooling/layout copy, root-level public actions, and public npm publication.
