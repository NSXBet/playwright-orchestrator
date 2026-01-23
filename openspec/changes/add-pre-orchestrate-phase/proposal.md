# Change: Add Pre-Orchestrate Phase

## Why

Currently, the documented workflow pattern runs `orchestrate` action in each shard independently:
- Shard 1: Load timing → Run CKK algorithm → Get assignment
- Shard 2: Load timing → Run CKK algorithm → Get assignment
- Shard 3: Load timing → Run CKK algorithm → Get assignment
- Shard 4: Load timing → Run CKK algorithm → Get assignment

This duplicates work. All shards compute the same result (CKK is deterministic), wasting compute time. For large test suites, CKK can take several seconds, multiplied by N shards.

**Proven solution**: Run orchestration **once** in a pre-sharding job, then pass assignments to shard jobs via GitHub Actions outputs. This pattern is already working in production at `bet-app`.

## What Changes

### Documentation Only
The CLI already supports the required output format (`--output-format json` outputs all shards). The main change is updating documentation and examples to recommend the three-phase pattern.

### Modified Components
- **README.md**: Update quick start to show three-phase pattern
- **docs/external-integration.md**: Document three-phase workflow as recommended
- **examples/external-workflow.yml**: Update to three-phase pattern

### Workflow Pattern Change

**Current (redundant per-shard):**
```
┌─────────────────────────────────────────────────────────────┐
│                    e2e (matrix: [1,2,3,4])                  │
├─────────────────────────────────────────────────────────────┤
│ Shard 1: load timing → orchestrate → run tests             │
│ Shard 2: load timing → orchestrate → run tests             │
│ Shard 3: load timing → orchestrate → run tests             │
│ Shard 4: load timing → orchestrate → run tests             │
└─────────────────────────────────────────────────────────────┘
```

**Recommended (efficient three-phase):**
```
┌─────────────────┐     ┌─────────────────────────────────┐     ┌─────────────┐
│   orchestrate   │────▶│      e2e (matrix: [1,2,3,4])    │────▶│ merge-timing│
│   (1 job)       │     │  Read files → Run tests         │     │ (1 job)     │
└─────────────────┘     └─────────────────────────────────┘     └─────────────┘
        │                               │
        ▼                               ▼
  - Load timing                   - Get files from
  - Run CKK once                    needs.orchestrate.outputs
  - Output shard-files            - Pass files to Playwright
```

## Impact

- Affected specs: `external-integration` (updated pattern)
- Affected code:
  - `docs/external-integration.md` (updated patterns)
  - `examples/external-workflow.yml` (updated example)
  - `README.md` (updated quick start)

## Benefits

1. **Faster CI**: Run CKK algorithm once instead of N times
2. **Consistent assignments**: All shards guaranteed same assignment (no race conditions)
3. **Better separation of concerns**: Orchestration phase clearly separated from execution phase
4. **Proven pattern**: Already working in production at bet-app with 8 shards
