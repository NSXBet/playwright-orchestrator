# Tasks: Add Pre-Orchestrate Phase

## 1. Update README.md

- [x] 1.1 Update "GitHub Actions (External Repositories)" section
  - [x] 1.1.1 Show three-phase pattern (orchestrate → e2e matrix → merge)
  - [x] 1.1.2 Use file-level distribution (`--level file`)
  - [x] 1.1.3 Show inline fallback logic
  - [x] 1.1.4 Keep example concise but complete

## 2. Update docs/external-integration.md

- [x] 2.1 Rename "Complete Workflow with Timing Data" to show three-phase pattern
- [x] 2.2 Add dedicated orchestrate job that outputs `shard-files`
- [x] 2.3 Update matrix job to read from `needs.orchestrate.outputs`
- [x] 2.4 Document inline fallback logic pattern
- [x] 2.5 Recommend file-level distribution for simplicity
- [x] 2.6 Keep test-level with grep as advanced option

## 3. Update examples/external-workflow.yml

- [x] 3.1 Add `orchestrate` job before `e2e` matrix
- [x] 3.2 Update `e2e` job to use `needs.orchestrate.outputs.shard-files`
- [x] 3.3 Show inline fallback to native `--shard`
- [x] 3.4 Add clear comments explaining the flow

## 4. Validation

- [x] 4.1 Verify example workflow YAML is valid
- [x] 4.2 Cross-reference with bet-app implementation for accuracy
