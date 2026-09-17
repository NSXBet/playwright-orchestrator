## Why

The monorepo E2Es stop after proving that a first-run timing store can be consumed by a later assignment. They do not run that warm assignment, so they do not prove the complete learning lifecycle or expose per-round diagnostics in the GitHub Actions summary.

## What Changes

- Execute cold and warm assignment/execution/merge rounds within the Playwright and Jest monorepo E2E workflows.
- Transfer the exact discovery input, assignment, and merged timing store through named artifacts between rounds.
- Validate exact per-round coverage, timing-store reuse, repeated timing observations, and emit a readable lifecycle summary.
- Support a configurable workflow-dispatch shard count, including sparse/empty shard plans as successful no-ops rather than native-sharding fallbacks.

## Capabilities

### New Capabilities

- `e2e-orchestration-lifecycle`: Self-contained cold-to-warm E2E lifecycle validation and diagnostics for supported test orchestrators.

### Modified Capabilities

- `external-integration`: Define successful no-op behavior for a valid empty Playwright shard plan, preserving exact orchestrator coverage.

## Impact

- Affected workflows: `.github/workflows/e2e-monorepo.yml`, `.github/workflows/e2e-jest-monorepo.yml`.
- Affected Actions: `get-shard` may distinguish a valid empty assignment from unavailable orchestrator data.
- Affected contributor flow: manual E2E dispatch can exercise five shards; PR-triggered runs stay at two shards.
