# Change: Add Pre-Orchestrate Phase

## Why

Currently, the documented workflow pattern runs `orchestrate` action in each shard independently:
- Shard 1: Load timing → Run CKK algorithm → Get assignment
- Shard 2: Load timing → Run CKK algorithm → Get assignment
- ...

This duplicates work. All shards compute the same result (CKK is deterministic).

**Solution**: Run orchestration **once** in a pre-sharding job, pass assignments to shard jobs via GitHub Actions outputs.

## Developer Experience Goal

**User controls only**:
- Where timing data is cached (cache key/path)
- Where artifacts are stored

**Actions encapsulate**:
- All orchestration logic
- JSON parsing
- Fallback handling
- Error handling

**Bad DX (current docs)**: User writes shell scripts with jq parsing
**Good DX (goal)**: User calls actions, actions handle complexity

## What Changes

### Modified Actions

**`orchestrate` action**: Make `shard-index` optional
- With `shard-index`: Current behavior (single shard output)
- Without `shard-index`: Output ALL shards as JSON (pre-orchestrate mode)

### New Action

**`get-shard` action**: Helper to get a specific shard's test arguments
- Input: `shard-files` (from orchestrate), `shard-index`, `shards` (for fallback)
- Output: `test-args` (either file list OR `--shard=N/M`)

### Ideal User Workflow

```yaml
jobs:
  orchestrate:
    outputs:
      shard-files: ${{ steps.orchestrate.outputs.shard-files }}
    steps:
      - uses: actions/checkout@v4
      - uses: NSXBet/playwright-orchestrator/.github/actions/setup-orchestrator@v0
      
      # USER CONTROLS: cache location
      - uses: actions/cache/restore@v4
        with:
          path: timing-data.json
          key: playwright-timing-${{ github.ref_name }}
      
      # ACTION ENCAPSULATES: orchestration logic
      - uses: NSXBet/playwright-orchestrator/.github/actions/orchestrate@v0
        id: orchestrate
        with:
          test-dir: ./e2e
          shards: 4
          timing-file: timing-data.json
          # NO shard-index = outputs all shards

  e2e:
    needs: [orchestrate]
    strategy:
      matrix:
        shard: [1, 2, 3, 4]
    steps:
      - uses: actions/checkout@v4
      
      # ACTION ENCAPSULATES: parsing + fallback logic
      - uses: NSXBet/playwright-orchestrator/.github/actions/get-shard@v0
        id: shard
        with:
          shard-files: ${{ needs.orchestrate.outputs.shard-files }}
          shard-index: ${{ matrix.shard }}
          shards: 4  # for fallback
      
      # SIMPLE: just use test-args (files or --shard=N/M)
      - run: npx playwright test ${{ steps.shard.outputs.test-args }}
```

## Impact

- Affected code:
  - `.github/actions/orchestrate/action.yml` (make shard-index optional)
  - `.github/actions/get-shard/action.yml` (new action)
  - `docs/external-integration.md` (updated patterns)
  - `examples/external-workflow.yml` (updated example)
  - `README.md` (updated quick start)

## Benefits

1. **Great DX**: No shell scripting, no jq, no manual fallback logic
2. **Faster CI**: Run CKK algorithm once instead of N times
3. **Consistent assignments**: All shards get same assignment
4. **Backwards compatible**: Existing per-shard usage still works
