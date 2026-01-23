# Tasks: Add Pre-Orchestrate Phase

## 1. Update `orchestrate` Action

- [x] 1.1 Make `shard-index` input optional (default: '')
- [x] 1.2 When `shard-index` omitted, output all shards:
  - [x] 1.2.1 Add `shard-files` output (JSON object)
  - [x] 1.2.2 Add `expected-durations` output (JSON object)
  - [x] 1.2.3 Add `use-orchestrator` output (boolean)
- [x] 1.3 Keep existing single-shard behavior when `shard-index` provided

## 2. Create `get-shard` Action

- [x] 2.1 Create `.github/actions/get-shard/action.yml`
- [x] 2.2 Inputs: `shard-files`, `shard-index`, `shards`
- [x] 2.3 Outputs:
  - [x] 2.3.1 `test-args`: file list OR `--shard=N/M`
  - [x] 2.3.2 `has-files`: boolean
  - [x] 2.3.3 `file-list`: space-separated files
- [x] 2.4 Implement fallback logic when shard-files empty

## 3. Update Documentation

- [x] 3.1 Update `README.md` with simple three-phase example
- [x] 3.2 Update `docs/external-integration.md`:
  - [x] 3.2.1 Show action-based workflow (no shell scripting)
  - [x] 3.2.2 Document `orchestrate` without `shard-index`
  - [x] 3.2.3 Document `get-shard` action usage
- [x] 3.3 Update `examples/external-workflow.yml`

## 4. Validation

- [ ] 4.1 Test orchestrate action without shard-index
- [ ] 4.2 Test get-shard action with valid/empty shard-files
- [ ] 4.3 Verify backwards compatibility (shard-index still works)
