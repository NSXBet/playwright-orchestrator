# @nsxbet/playwright-orchestrator

## 0.2.1

### Patch Changes

- [#6](https://github.com/NSXBet/playwright-orchestrator/pull/6) [`5d3f407`](https://github.com/NSXBet/playwright-orchestrator/commit/5d3f4078f8375a2603071145ae04d81cd6bb3726) Thanks [@gtkatakura](https://github.com/gtkatakura)! - Fix test-level distribution to use --grep patterns instead of raw test IDs

  The get-shard action now accepts a `grep-patterns` input from the orchestrate action.
  When provided, it outputs `--grep="<pattern>"` as test-args instead of space-separated
  test IDs, preventing bash syntax errors from special characters in test names.

## 0.2.0

### Minor Changes

- [#3](https://github.com/NSXBet/playwright-orchestrator/pull/3) [`ee93c37`](https://github.com/NSXBet/playwright-orchestrator/commit/ee93c37be21c6e9a2e10ba4bb9b7e90ea496eff3) Thanks [@gtkatakura](https://github.com/gtkatakura)! - Add external usage support with storage-agnostic GitHub Actions

  - New `setup-orchestrator` action for external repositories
  - Refactored actions to be storage-agnostic (user controls cache/artifacts)
  - Native sharding fallback when orchestrator fails
  - Complete documentation in `docs/external-integration.md`
