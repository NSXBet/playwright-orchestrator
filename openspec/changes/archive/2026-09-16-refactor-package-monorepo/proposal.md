# Change: Migrate the orchestrator to an NSW-style package monorepo

## Why

The repository is a single package with root-level source, tests, and release metadata. Aligning it with the established NSW package-monorepo layout makes future reusable packages possible while retaining the published `@nsxbet/playwright-orchestrator` package and its public GitHub Actions paths.

## What Changes

- Move the publishable CLI into `packages/playwright-orchestrator/`, including source, tests, package metadata, build configuration, and changelog.
- Turn the repository root into a private Bun workspace manager using Turborepo, with root commands delegating build, lint, type-check, and test tasks to packages.
- Adopt the NSW repository tooling conventions: pinned Bun/mise configuration, Bun lockfile, Turbo task graph, Oxlint/Oxfmt, Lefthook, and root documentation/configuration patterns where applicable.
- Preserve the package name, public npm registry, CLI binary, package exports, version history, and consumer-facing behavior.
- Keep composite actions at their existing root `.github/actions/<action>` paths; update their internal build/install assumptions and all repository workflows, documentation, and examples for the package workspace layout.
- Preserve CI, Act, Verdaccio publication verification, and Playwright orchestration behavior.

## Impact

- Affected specs: `repository-workspace` (new); existing `orchestration` and `external-integration` behavior is preserved.
- Affected code: root package/tooling configuration, `src/`, `__tests__/`, `bin/`, CI workflows, composite actions, Makefile, documentation, examples, Changesets, and release configuration.
- **Migration impact:** contributor commands remain available from the repository root, but direct source/test paths move under `packages/playwright-orchestrator/`.
