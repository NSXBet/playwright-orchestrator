# Tasks: Add Pre-Orchestrate Phase

## 1. Update README.md

- [ ] 1.1 Update "GitHub Actions (External Repositories)" section
  - [ ] 1.1.1 Show three-phase pattern (orchestrate → e2e matrix → merge)
  - [ ] 1.1.2 Use file-level distribution (`--level file`)
  - [ ] 1.1.3 Show inline fallback logic
  - [ ] 1.1.4 Keep example concise but complete

## 2. Update docs/external-integration.md

- [ ] 2.1 Rename "Complete Workflow with Timing Data" to show three-phase pattern
- [ ] 2.2 Add dedicated orchestrate job that outputs `shard-files`
- [ ] 2.3 Update matrix job to read from `needs.orchestrate.outputs`
- [ ] 2.4 Document inline fallback logic pattern
- [ ] 2.5 Recommend file-level distribution for simplicity
- [ ] 2.6 Keep test-level with grep as advanced option

## 3. Update examples/external-workflow.yml

- [ ] 3.1 Add `orchestrate` job before `e2e` matrix
- [ ] 3.2 Update `e2e` job to use `needs.orchestrate.outputs.shard-files`
- [ ] 3.3 Show inline fallback to native `--shard`
- [ ] 3.4 Add clear comments explaining the flow

## 4. Validation

- [ ] 4.1 Verify example workflow YAML is valid
- [ ] 4.2 Cross-reference with bet-app implementation for accuracy
