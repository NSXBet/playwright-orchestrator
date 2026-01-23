# Tasks: Initialize Playwright Orchestrator

## PR1: Project Setup

### 1. Tooling Setup
- [x] 1.1 Create `.tool-versions` with `bun 1.3.6`
- [x] 1.2 Create `biome.json` with Biome 2.3.11 config
- [x] 1.3 Create `tsconfig.json` with strict TypeScript 5.9.3
- [x] 1.4 Create minimal `package.json` (no business logic dependencies yet)
- [x] 1.5 Create `.gitignore` for node_modules, dist, etc.

### 2. CI Setup
- [x] 2.1 Create `.github/workflows/ci.yml`
  - [x] 2.1.1 Use `ubuntu-24.04` (pinned, not latest)
  - [x] 2.1.2 Setup mise + bun
  - [x] 2.1.3 Run `bun install`
  - [x] 2.1.4 Run `biome check .` (lint)
  - [x] 2.1.5 Run `tsc --noEmit` (typecheck)
- [x] 2.2 Create `.github/actions/setup/action.yml` (composite action)

### 3. Local Development
- [x] 3.1 Create `Makefile` with targets:
  - [x] 3.1.1 `make lint` - Run Biome
  - [x] 3.1.2 `make typecheck` - Run TypeScript
  - [x] 3.1.3 `make test` - Run Bun test
  - [x] 3.1.4 `make build` - Build project
  - [x] 3.1.5 `make act-test` - Run E2E with Act

### 4. Documentation
- [x] 4.1 Create `README.md` (users first, then contributors)
- [x] 4.2 Create root `AGENTS.md` for AI development

### 5. Create PR1
- [x] 5.1 Create branch `chore/project-setup`
- [x] 5.2 Open PR: "chore: project setup with tooling and CI"
- [x] 5.3 Merge after CI passes

---

## PR2: Implementation

### 6. Package Setup
- [x] 6.1 Update `package.json` with full dependencies:
  - [x] 6.1.1 `@oclif/core@4.8.0`
  - [x] 6.1.2 `glob@11.0.2`
  - [x] 6.1.3 `typescript@5.9.3` (devDep)
  - [x] 6.1.4 `@types/node` (devDep)
- [x] 6.2 Create `bin/run.js` oclif entry point
- [x] 6.3 Add oclif config to package.json

### 7. Core Library
- [x] 7.1 Create `src/core/types.ts`
  - [x] 7.1.1 TimingData interfaces (v1 and v2)
  - [x] 7.1.2 Test/File duration interfaces
  - [x] 7.1.3 Shard assignment interfaces
  - [x] 7.1.4 Playwright report interfaces
  - [x] 7.1.5 Helper functions (buildTestId, parseTestId)
- [x] 7.2 Create `src/core/ckk-algorithm.ts`
  - [x] 7.2.1 CKK optimal partitioning
  - [x] 7.2.2 Timeout handling with LPT fallback
  - [x] 7.2.3 `isOptimal` flag
- [x] 7.3 Create `src/core/lpt-algorithm.ts`
  - [x] 7.3.1 LPT bin-packing algorithm
  - [x] 7.3.2 Balance ratio calculation
- [x] 7.4 Create `src/core/timing-store.ts`
  - [x] 7.4.1 Load/save timing data
  - [x] 7.4.2 EMA calculation
  - [x] 7.4.3 Merge timing data
  - [x] 7.4.4 Prune old entries
- [x] 7.5 Create `src/core/test-discovery.ts`
  - [x] 7.5.1 Discover via `playwright --list`
  - [x] 7.5.2 Fallback: parse test files
  - [x] 7.5.3 Group tests by file
- [x] 7.6 Create `src/core/grep-pattern.ts`
  - [x] 7.6.1 Escape regex special chars
  - [x] 7.6.2 Generate OR patterns
  - [x] 7.6.3 Handle long patterns (grep-file)
- [x] 7.7 Create `src/core/estimate.ts`
  - [x] 7.7.1 Same-file average
  - [x] 7.7.2 Global average
  - [x] 7.7.3 Default constant (30s)
- [x] 7.8 Create `src/core/slugify.ts`
- [x] 7.9 Create `src/core/index.ts` (re-exports)

### 8. CLI Commands
- [x] 8.1 Create `src/commands/assign.ts`
  - [x] 8.1.1 `--test-dir` flag
  - [x] 8.1.2 `--timing-file` flag
  - [x] 8.1.3 `--shards` flag
  - [x] 8.1.4 `--output-format` flag (json/text)
  - [x] 8.1.5 `--timeout` flag for CKK
- [x] 8.2 Create `src/commands/extract-timing.ts`
  - [x] 8.2.1 `--report-file` flag
  - [x] 8.2.2 `--output-file` flag
  - [x] 8.2.3 `--shard` flag
  - [x] 8.2.4 `--project` flag
- [x] 8.3 Create `src/commands/merge-timing.ts`
  - [x] 8.3.1 `--existing` flag
  - [x] 8.3.2 `--new` flag (multiple)
  - [x] 8.3.3 `--output` flag
  - [x] 8.3.4 `--alpha` flag (EMA)
  - [x] 8.3.5 `--prune-days` flag
- [x] 8.4 Create `src/commands/list-tests.ts`
  - [x] 8.4.1 `--test-dir` flag
  - [x] 8.4.2 `--project` flag
  - [x] 8.4.3 `--use-fallback` flag
- [x] 8.5 Create `src/index.ts` (oclif entry)

### 9. Unit Tests
- [x] 9.1 Create `__tests__/ckk-algorithm.test.ts`
- [x] 9.2 Create `__tests__/lpt-algorithm.test.ts`
- [x] 9.3 Create `__tests__/timing-store.test.ts`
- [x] 9.4 Create `__tests__/slugify.test.ts`
- [x] 9.5 Create `__tests__/grep-pattern.test.ts`

### 10. Example Project
- [x] 10.1 Create `examples/basic/package.json`
- [x] 10.2 Create `examples/basic/playwright.config.ts`
- [x] 10.3 Create `examples/basic/tests/extra-long.spec.ts` (~300s)
- [x] 10.4 Create `examples/basic/tests/long.spec.ts` (~180s)
- [x] 10.5 Create `examples/basic/tests/medium.spec.ts` (~120s)
- [x] 10.6 Create `examples/basic/tests/short.spec.ts` (~60s)

### 11. GitHub Actions
- [x] 11.1 Create `.github/actions/orchestrate/action.yml`
- [x] 11.2 Create `.github/actions/extract-timing/action.yml`
- [x] 11.3 Create `.github/actions/merge-timing/action.yml`
- [x] 11.4 Create `.github/workflows/e2e-example.yml`
  - [x] 11.4.1 Orchestrate job (setup)
  - [x] 11.4.2 E2E matrix job (test)
  - [x] 11.4.3 Merge reports job (merge)
  - [x] 11.4.4 Compatible with Act

### 12. Create PR2
- [x] 12.1 Create branch `feat/playwright-orchestrator`
- [x] 12.2 Open PR: "feat: playwright orchestrator implementation"
- [x] 12.3 CI passes
- [x] 12.4 Merge after CI passes

### 13. Final Validation
- [ ] 13.1 Run two consecutive `make act-test` to verify:
  - [ ] 13.1.1 Run 1 creates timing-data.json
  - [ ] 13.1.2 Run 2 uses timing data for distribution
  - [ ] 13.1.3 Distribution improves in Run 2
