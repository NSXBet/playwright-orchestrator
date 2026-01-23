---
"@nsxbet/playwright-orchestrator": minor
---

Add external usage support with storage-agnostic GitHub Actions

- New `setup-orchestrator` action for external repositories
- Refactored actions to be storage-agnostic (user controls cache/artifacts)
- Native sharding fallback when orchestrator fails
- Complete documentation in `docs/external-integration.md`
