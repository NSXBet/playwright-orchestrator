# NSXBet Test Orchestrator

Test Orchestrator is NSXBet's monorepo for publishable JavaScript and TypeScript
packages that distribute test suites across CI shards using historical timing
data. It currently supports Playwright and Jest, preserving the workflow and
reporting semantics of each framework instead of forcing them through a shared
runtime abstraction.

Packages live in `packages/<module>`, are independently versioned, and are
published publicly under the `@nsxbet` scope on npmjs. The repository also
contains root-level GitHub composite Actions and consumer fixtures that exercise
each package end to end.

## Packages

| Package                                                                           | Description                                                                                                               | Status       |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------ |
| [`@nsxbet/playwright-orchestrator`](./packages/playwright-orchestrator/README.md) | Timing-aware Playwright sharding with native `--test-list` filtering and clean Playwright reports.                        | Stable       |
| [`@nsxbet/jest-orchestrator`](./packages/jest-orchestrator/README.md)             | Timing-aware Jest 30+ sharding, file-level by default, with exact allowlist selection for opt-in test-level distribution. | Experimental |

## `@nsxbet/playwright-orchestrator` at a glance

Playwright's built-in `--shard` distributes files rather than work duration.
The orchestrator learns durations from prior reports, balances tests with the
CKK algorithm and fast LPT fallback, then writes Playwright `--test-list`
content for each shard. Playwright itself removes unassigned tests before
execution, so standard HTML, JSON, blob, and GitHub reporters remain natively
clean.

```bash
npx playwright test --list --reporter=json --project chromium > test-list.json
npx playwright-orchestrator assign \
  --test-list test-list.json \
  --timing-file timing-data.json \
  --shards 4 > assignment.json
```

See [`@nsxbet/playwright-orchestrator`](./packages/playwright-orchestrator/README.md)
for CLI usage and [`docs/external-integration.md`](./docs/external-integration.md)
for a complete GitHub Actions integration.

## `@nsxbet/jest-orchestrator` at a glance

Jest's default sharding also balances file count. The Jest orchestrator uses
per-test duration history but schedules complete files by default, avoiding
unnecessary repeated file setup. Pass `--level test` when a large file needs to
be split; an exact `(file, fullName)` allowlist shim performs the selection
without regex matching and verifies after execution that the assigned test
occurrences are exactly those Jest executed.

```bash
npx jest-orchestrator discover --root . --output jest-tests.json
npx jest-orchestrator assign \
  --manifest jest-tests.json \
  --timings jest-timing.json \
  --shards 4 \
  --output assignment.json
```

See [`@nsxbet/jest-orchestrator`](./packages/jest-orchestrator/README.md) for
CLI usage and [`docs/jest-external-integration.md`](./docs/jest-external-integration.md)
for the full GitHub Actions integration.

## GitHub Actions

The repository preserves framework-specific Actions rather than changing the
existing Playwright contracts:

| Framework  | Setup                                                                   | Orchestrate                                               | Shard / timing flow                                                                                                                                                  |
| ---------- | ----------------------------------------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Playwright | [`setup-orchestrator`](./.github/actions/setup-orchestrator/)           | [`orchestrate`](./.github/actions/orchestrate/)           | [`get-shard`](./.github/actions/get-shard/) → Playwright → [`extract-timing`](./.github/actions/extract-timing/) → [`merge-timing`](./.github/actions/merge-timing/) |
| Jest       | [`setup-jest-orchestrator`](./.github/actions/setup-jest-orchestrator/) | [`jest-orchestrate`](./.github/actions/jest-orchestrate/) | [`jest-get-shard`](./.github/actions/jest-get-shard/) → `run-shard` → [`jest-merge-timing`](./.github/actions/jest-merge-timing/)                                    |

Jest `run-shard` is deliberately both the execution and timing-extraction step:
it must launch Jest to load the exact-selection shim, and therefore owns the
JSON report from which it writes the shard timing artifact.

## Prerequisites

[Mise](https://mise.jdx.dev/) manages the pinned project toolchain, including
Bun. Install Mise, then install project tools and dependencies:

```sh
mise install
bun install --frozen-lockfile
```

The package README documents framework-specific peer dependencies:

- Playwright integration requires Playwright 1.56+ for `--test-list`.
- Jest integration requires Jest 30+ with the default jest-circus runner.

## Validate the repository

Run the same workspace checks as CI before opening a pull request:

```sh
bun run format:check
bun run lint
bun run type-check
bun run test
bun run build
```

For formatting fixes, run:

```sh
bun run format
```

Use `make help` for package checks, dry-run packaging, and local Act targets.
The primary end-to-end targets are:

```sh
make act-e2e                 # Basic Playwright workflow
make act-e2e-monorepo        # Monorepo Playwright workflow
make act-e2e-jest            # Basic Jest workflow
make act-e2e-jest-monorepo   # Tarball-based monorepo Jest workflow
```

## Development model

- **Framework-native packages.** Add framework behavior in its package; do not
  erase meaningful differences in discovery, selection, report, or timing
  contracts.
- **Storage-agnostic orchestration.** Packages and Actions work with files.
  Consumers choose GitHub cache, artifacts, S3, or another persistence layer.
- **Explicit fallback or verification.** Playwright retains native-shard
  fallback. Jest validates exact allowlist execution because native sharding
  cannot safely reproduce a test-level plan.
- **Public Action compatibility.** Existing Playwright Action paths remain
  stable. New Jest Actions are explicitly `jest-*` namespaced.
- **Release discipline.** Add a Changeset for every consumer-visible package
  change.

## Repository layout

```text
packages/
  playwright-orchestrator/  # Publishable Playwright CLI package
  jest-orchestrator/        # Publishable Jest CLI package
.github/actions/            # Public composite Actions
.github/workflows/          # CI, release, and framework E2E workflows
examples/                   # Basic and monorepo consumer fixtures
openspec/                   # Current specs and approved change proposals
docs/                       # Framework integration guides
```

## Tooling

| Tool                                                                                                            | Responsibility                                                        |
| --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| [Bun](https://bun.sh/)                                                                                          | Workspaces, package management, scripts, and package tests.           |
| [Turborepo](https://turbo.build/)                                                                               | Repository-wide build, lint, type-check, and test orchestration.      |
| [Oxlint](https://oxc.rs/docs/guide/usage/linter.html) / [Oxfmt](https://oxc.rs/docs/guide/usage/formatter.html) | Linting and formatting.                                               |
| [Lefthook](https://lefthook.dev/) / lint-staged                                                                 | Fast staged-file checks at commit time.                               |
| [Changesets](https://github.com/changesets/changesets)                                                          | Independent package versioning and release pull requests.             |
| GitHub Actions                                                                                                  | CI, E2E fixtures, npm publication validation, and releases from main. |

## Releases

The workspace root is private. Changesets version and publish
`@nsxbet/playwright-orchestrator` and `@nsxbet/jest-orchestrator` to the public
npm registry from `main`. Published packages declare their own public npm
metadata, CLI binary, exports, and peer dependencies.

Use a tagged release for external Actions once the relevant package is
published. The examples intentionally use `@main` to demonstrate the current
repository contract.

## Documentation and decisions

- [Documentation index](./docs/README.md)
- [Playwright external integration](./docs/external-integration.md)
- [Jest external integration](./docs/jest-external-integration.md)
- [Playwright external workflow template](./examples/external-workflow.yml)
- [Jest external workflow template](./examples/jest-external-workflow.yml)
- [OpenSpec](./openspec/) — current requirements and change proposals
- [Contributor guidance](./AGENTS.md)

## License

Individual published packages declare their own license metadata.
