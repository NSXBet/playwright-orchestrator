---
"@nsxbet/playwright-orchestrator": major
---

v1: Breaking changes for stricter defaults

- Removed deprecated `setupOrchestratorFilter` — use `withOrchestratorFilter` instead
- `--shard-file` is now required on `extract-timing` (was optional)
- `--project` is now required on `extract-timing` (was optional, defaulted to 'default')
- `--test-list` is now required on `assign` (removed `--test-dir`, `--config-dir`, `--use-fallback`, `--glob-pattern`, `--level file`)
