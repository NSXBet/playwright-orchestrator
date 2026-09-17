# Playwright Orchestrator Workspace

This repository is the Bun/Turborepo workspace for NSXBet's Playwright test-distribution tooling. Publishable packages live under `packages/`; GitHub Actions remain at [`.github/actions/`](./.github/actions/) so their public references remain stable.

## Packages

| Package                                                                           | Description                                                                 |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| [`@nsxbet/playwright-orchestrator`](./packages/playwright-orchestrator/README.md) | Distributes Playwright tests across CI shards using historical timing data. |

## Development

[Mise](https://mise.jdx.dev/) manages the pinned Bun version:

```sh
mise install
bun install --frozen-lockfile
```

Run the same workspace checks as CI:

```sh
bun run format:check
bun run lint
bun run type-check
bun test
bun run build
```

Use `make help` to list local validation, packaging, example, and Act targets.

## Repository layout

```text
packages/
  playwright-orchestrator/  # Publishable CLI package
.github/actions/            # Public composite GitHub Actions
.github/workflows/          # Repository CI, release, and E2E workflows
examples/                   # Consumer and monorepo test fixtures
openspec/                   # Specs and approved change proposals
```

## Publishing

The workspace root is private. Changesets version and publish only `@nsxbet/playwright-orchestrator`, which remains a public npm package. See the [package README](./packages/playwright-orchestrator/README.md) for installation and usage.
