# Tasks: Add External Usage Support

## 1. NPM Publishing Setup

- [ ] 1.1 Update `package.json` with publishConfig and repository fields
- [ ] 1.2 Create `.github/workflows/release.yml` for npm publishing
- [ ] 1.3 Add `files` field to include only necessary files in package

## 2. Setup Action for External Users

- [ ] 2.1 Create `.github/actions/setup-orchestrator/action.yml`
  - [ ] 2.1.1 Input: `version` (optional, defaults to latest)
  - [ ] 2.1.2 Cache CLI installation with actions/cache
  - [ ] 2.1.3 Add CLI to PATH
  - [ ] 2.1.4 Verify installation works

## 3. Refactor Orchestrate Action

- [ ] 3.1 Remove internal cache restore/save logic
- [ ] 3.2 Add `timing-file` input (user provides path)
- [ ] 3.3 Add fallback outputs:
  - [ ] 3.3.1 `use-native-sharding` (boolean)
  - [ ] 3.3.2 `shard-arg` (e.g., `--shard=1/4`)
- [ ] 3.4 Implement fallback logic on CLI failure
- [ ] 3.5 Emit warning when falling back

## 4. Refactor Extract-Timing Action

- [ ] 4.1 Remove artifact upload step
- [ ] 4.2 Keep only core extraction logic
- [ ] 4.3 Document that user should upload artifact after

## 5. Refactor Merge-Timing Action

- [ ] 5.1 Remove cache restore/save steps
- [ ] 5.2 Remove artifact download step
- [ ] 5.3 Add `new-files` input (space-separated paths)
- [ ] 5.4 Add `existing-file` input (optional)
- [ ] 5.5 Keep only core merge logic

## 6. Documentation

- [ ] 6.1 Create `docs/external-integration.md` with complete guide
- [ ] 6.2 Add external usage section to README.md
- [ ] 6.3 Create `examples/external-workflow.yml` as copy-paste template
- [ ] 6.4 Update AGENTS.md with external usage patterns

## 7. Validation

- [ ] 7.1 Test setup action installs CLI correctly
- [ ] 7.2 Test orchestrate action fallback behavior
- [ ] 7.3 Test full workflow in example project
- [ ] 7.4 Verify existing internal workflows still work
