# Test Orchestrator Documentation

Documentation for NSXBet's Playwright and Jest test-distribution packages.

## Documentation Index

### Test-Level Distribution

**[test-level-reporter.md](./test-level-reporter.md)**

- Custom Reporter for exact test filtering
- Solves shell escaping and substring collision problems
- ~5 min read

### Playwright External Integration

**[external-integration.md](./external-integration.md)**

- Complete Playwright guide for external repositories
- GitHub Actions workflow patterns
- Three-phase workflow (orchestrate → test → merge-timing)

### Jest External Integration

**[jest-external-integration.md](./jest-external-integration.md)**

- Complete Jest 30+ guide for external repositories
- `setup-jest-orchestrator` and Jest-prefixed Action references
- File-level sharding by default, with optional exact test-level selection
- Three-phase workflow (orchestrate → test/run-shard → merge-timing)

## Quick Links

- [Main README](../README.md) - Project overview and quick start
- [Examples](../examples/) - Working examples including reporter.ts
- [OpenSpec](../openspec/) - Specifications and change proposals
