# Tasks: Initialize Playwright Orchestrator

## PR1: Project Setup

### 1. Tooling Setup
- [ ] 1.1 Create `.tool-versions` with `bun 1.3.6`
- [ ] 1.2 Create `biome.json` with Biome 2.3.11 config
- [ ] 1.3 Create `tsconfig.json` with strict TypeScript 5.9.3
- [ ] 1.4 Create minimal `package.json` (no business logic dependencies yet)
- [ ] 1.5 Create `.gitignore` for node_modules, dist, etc.

### 2. CI Setup
- [ ] 2.1 Create `.github/workflows/ci.yml`
  - [ ] 2.1.1 Use `ubuntu-24.04` (pinned, not latest)
  - [ ] 2.1.2 Setup mise + bun
  - [ ] 2.1.3 Run `bun install`
  - [ ] 2.1.4 Run `biome check .` (lint)
  - [ ] 2.1.5 Run `tsc --noEmit` (typecheck)
- [ ] 2.2 Create `.github/actions/setup/action.yml` (composite action)

### 3. Local Development
- [ ] 3.1 Create `Makefile` with targets:
  - [ ] 3.1.1 `make lint` - Run Biome
  - [ ] 3.1.2 `make typecheck` - Run TypeScript
  - [ ] 3.1.3 `make test` - Run Bun test
  - [ ] 3.1.4 `make build` - Build project
  - [ ] 3.1.5 `make act-test` - Run E2E with Act

### 4. Documentation
- [ ] 4.1 Create `README.md` (users first, then contributors)
- [ ] 4.2 Create root `AGENTS.md` for AI development

### 5. Create PR1
- [ ] 5.1 Create branch `chore/project-setup`
- [ ] 5.2 Open PR: "chore: project setup with tooling and CI"
- [ ] 5.3 Merge after CI passes

---

## PR2: Implementation

### 6. Package Setup
- [ ] 6.1 Update `package.json` with full dependencies:
  - [ ] 6.1.1 `@oclif/core@4.8.0`
  - [ ] 6.1.2 `glob@11.0.0`
  - [ ] 6.1.3 `typescript@5.9.3` (devDep)
  - [ ] 6.1.4 `@types/node` (devDep)
- [ ] 6.2 Create `bin/run.js` oclif entry point
- [ ] 6.3 Add oclif config to package.json

### 7. Core Library
- [ ] 7.1 Create `src/core/types.ts`
  - [ ] 7.1.1 TimingData interfaces (v1 and v2)
  - [ ] 7.1.2 Test/File duration interfaces
  - [ ] 7.1.3 Shard assignment interfaces
  - [ ] 7.1.4 Playwright report interfaces
  - [ ] 7.1.5 Helper functions (buildTestId, parseTestId)
- [ ] 7.2 Create `src/core/ckk-algorithm.ts`
  - [ ] 7.2.1 CKK optimal partitioning
  - [ ] 7.2.2 Timeout handling with LPT fallback
  - [ ] 7.2.3 `isOptimal` flag
- [ ] 7.3 Create `src/core/lpt-algorithm.ts`
  - [ ] 7.3.1 LPT bin-packing algorithm
  - [ ] 7.3.2 Balance ratio calculation
- [ ] 7.4 Create `src/core/timing-store.ts`
  - [ ] 7.4.1 Load/save timing data
  - [ ] 7.4.2 EMA calculation
  - [ ] 7.4.3 Merge timing data
  - [ ] 7.4.4 Prune old entries
- [ ] 7.5 Create `src/core/test-discovery.ts`
  - [ ] 7.5.1 Discover via `playwright --list`
  - [ ] 7.5.2 Fallback: parse test files
  - [ ] 7.5.3 Group tests by file
- [ ] 7.6 Create `src/core/grep-pattern.ts`
  - [ ] 7.6.1 Escape regex special chars
  - [ ] 7.6.2 Generate OR patterns
  - [ ] 7.6.3 Handle long patterns (grep-file)
- [ ] 7.7 Create `src/core/estimate.ts`
  - [ ] 7.7.1 Same-file average
  - [ ] 7.7.2 Global average
  - [ ] 7.7.3 Default constant (30s)
- [ ] 7.8 Create `src/core/slugify.ts`
- [ ] 7.9 Create `src/core/index.ts` (re-exports)

### 8. CLI Commands
- [ ] 8.1 Create `src/commands/assign.ts`
  - [ ] 8.1.1 `--test-dir` flag
  - [ ] 8.1.2 `--timing-file` flag
  - [ ] 8.1.3 `--shards` flag
  - [ ] 8.1.4 `--output-format` flag (json/text)
  - [ ] 8.1.5 `--timeout` flag for CKK
- [ ] 8.2 Create `src/commands/extract-timing.ts`
  - [ ] 8.2.1 `--report-file` flag
  - [ ] 8.2.2 `--output-file` flag
  - [ ] 8.2.3 `--shard` flag
  - [ ] 8.2.4 `--project` flag
- [ ] 8.3 Create `src/commands/merge-timing.ts`
  - [ ] 8.3.1 `--existing` flag
  - [ ] 8.3.2 `--new` flag (multiple)
  - [ ] 8.3.3 `--output` flag
  - [ ] 8.3.4 `--alpha` flag (EMA)
  - [ ] 8.3.5 `--prune-days` flag
- [ ] 8.4 Create `src/commands/list-tests.ts`
  - [ ] 8.4.1 `--test-dir` flag
  - [ ] 8.4.2 `--project` flag
  - [ ] 8.4.3 `--use-fallback` flag
- [ ] 8.5 Create `src/index.ts` (oclif entry)

### 9. Unit Tests
- [ ] 9.1 Create `__tests__/ckk-algorithm.test.ts`
- [ ] 9.2 Create `__tests__/lpt-algorithm.test.ts`
- [ ] 9.3 Create `__tests__/timing-store.test.ts`
- [ ] 9.4 Create `__tests__/slugify.test.ts`
- [ ] 9.5 Create `__tests__/grep-pattern.test.ts`

### 10. Example Project
- [ ] 10.1 Create `examples/basic/package.json`
- [ ] 10.2 Create `examples/basic/playwright.config.ts`
- [ ] 10.3 Create `examples/basic/tests/slow.spec.ts` (~180s)
- [ ] 10.4 Create `examples/basic/tests/medium.spec.ts` (~120s)
- [ ] 10.5 Create `examples/basic/tests/fast.spec.ts` (~60s)
- [ ] 10.6 Create `examples/basic/tests/quick.spec.ts` (~30s)

### 11. GitHub Actions
- [ ] 11.1 Create `.github/actions/orchestrate/action.yml`
- [ ] 11.2 Create `.github/actions/extract-timing/action.yml`
- [ ] 11.3 Create `.github/actions/merge-timing/action.yml`
- [ ] 11.4 Create `.github/workflows/e2e-example.yml`
  - [ ] 11.4.1 Orchestrate job
  - [ ] 11.4.2 E2E matrix job
  - [ ] 11.4.3 Merge reports job
  - [ ] 11.4.4 Compatible with Act

### 12. Create PR2
- [ ] 12.1 Create branch `feat/playwright-orchestrator`
- [ ] 12.2 Open PR: "feat: playwright orchestrator implementation"
- [ ] 12.3 Run `make act-test` locally to validate
- [ ] 12.4 Merge after CI passes

### 13. Final Validation
- [ ] 13.1 Run two consecutive `make act-test` to verify:
  - [ ] 13.1.1 Run 1 creates timing-data.json
  - [ ] 13.1.2 Run 2 uses timing data for distribution
  - [ ] 13.1.3 Distribution improves in Run 2
