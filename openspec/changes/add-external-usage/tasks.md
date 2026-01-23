# Tasks: Add External Usage Support

## 1. NPM Publishing Setup

- [x] 1.1 Update `package.json` with publishConfig and repository fields
- [x] 1.2 Create `.github/workflows/release.yml` for npm publishing (using changesets)
- [x] 1.3 Add `files` field to include only necessary files in package

## 2. Setup Action for External Users

- [x] 2.1 Create `.github/actions/setup-orchestrator/action.yml`
  - [x] 2.1.1 Input: `version` (optional, defaults to latest)
  - [x] 2.1.2 Cache CLI installation with actions/cache
  - [x] 2.1.3 Add CLI to PATH
  - [x] 2.1.4 Verify installation works

## 3. Refactor Orchestrate Action

- [x] 3.1 Remove internal cache restore/save logic
- [x] 3.2 Add `timing-file` input (user provides path)
- [x] 3.3 Add fallback outputs:
  - [x] 3.3.1 `use-native-sharding` (boolean)
  - [x] 3.3.2 `shard-arg` (e.g., `--shard=1/4`)
- [x] 3.4 Implement fallback logic on CLI failure
- [x] 3.5 Emit warning when falling back

## 4. Refactor Extract-Timing Action

- [x] 4.1 Remove artifact upload step
- [x] 4.2 Keep only core extraction logic
- [x] 4.3 Document that user should upload artifact after

## 5. Refactor Merge-Timing Action

- [x] 5.1 Remove cache restore/save steps
- [x] 5.2 Remove artifact download step
- [x] 5.3 Add `new-files` input (space-separated paths)
- [x] 5.4 Add `existing-file` input (optional)
- [x] 5.5 Keep only core merge logic

## 6. Documentation

- [x] 6.1 Create `docs/external-integration.md` with complete guide
- [x] 6.2 Add external usage section to README.md
- [x] 6.3 Create `examples/external-workflow.yml` as copy-paste template
- [x] 6.4 Update AGENTS.md with external usage patterns

## 7. Validation

- [x] 7.1 Test setup action installs CLI correctly (via e2e-example.yml)
- [x] 7.2 Test orchestrate action fallback behavior (via e2e-example.yml)
- [x] 7.3 Test full workflow in example project (via e2e-example.yml)
- [x] 7.4 Verify existing internal workflows still work (CI workflow)
