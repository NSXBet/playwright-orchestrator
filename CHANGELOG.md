# @nsxbet/playwright-orchestrator

## 0.2.0

### Minor Changes

- [#3](https://github.com/NSXBet/playwright-orchestrator/pull/3) [`ee93c37`](https://github.com/NSXBet/playwright-orchestrator/commit/ee93c37be21c6e9a2e10ba4bb9b7e90ea496eff3) Thanks [@gtkatakura](https://github.com/gtkatakura)! - Add external usage support with storage-agnostic GitHub Actions

  - New `setup-orchestrator` action for external repositories
  - Refactored actions to be storage-agnostic (user controls cache/artifacts)
  - Native sharding fallback when orchestrator fails
  - Complete documentation in `docs/external-integration.md`
