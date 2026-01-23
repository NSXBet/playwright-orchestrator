# Change: Add External Usage Support

## Why

The playwright-orchestrator is currently designed to run **within the same repository**:
- Actions use local references (`uses: ./.github/actions/...`)
- Workflows build the orchestrator locally
- No published npm package

External projects cannot use the orchestrator as intended. They need:
1. Referenceable GitHub Actions from this repository
2. CLI available via npm
3. Clear integration documentation

## What Changes

### New Components
- **setup action**: Installs and caches the CLI for external users
- **npm publishing**: Package published to npm registry
- **External workflow example**: Copy-paste ready workflow

### Modified Components
- **orchestrate action**: Remove internal caching, add fallback outputs
- **extract-timing action**: Remove artifact upload (user controls)
- **merge-timing action**: Remove cache handling (user controls)

### Design Decisions
- **Storage-agnostic**: Actions do NOT handle cache/artifacts internally
- **Fallback to native**: If orchestrator fails, use Playwright's `--shard` flag
- **User controls storage**: Cache and artifacts managed by user's workflow
- **Cancellation-aware**: Use `success() || failure()` instead of `always()`

## Impact

- Affected specs: `external-integration` (new capability)
- Affected code:
  - `.github/actions/setup/action.yml` (new, for external users)
  - `.github/actions/orchestrate/action.yml` (simplified)
  - `.github/actions/extract-timing/action.yml` (simplified)
  - `.github/actions/merge-timing/action.yml` (simplified)
  - `package.json` (npm publish config)
  - `.github/workflows/release.yml` (new)
  - `README.md` (external usage section)

## Expected Outcome

External projects can integrate the orchestrator with:

```yaml
- uses: NSXBet/playwright-orchestrator/.github/actions/setup@v1
- uses: NSXBet/playwright-orchestrator/.github/actions/orchestrate@v1
  with:
    test-dir: ./e2e
    shards: 4
    shard-index: ${{ matrix.shard }}
```

And have full control over caching and artifact storage.
