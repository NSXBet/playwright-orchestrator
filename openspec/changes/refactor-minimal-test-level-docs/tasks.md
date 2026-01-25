# Tasks: Implement Reporter-Based Test-Level Distribution

## 1. Reporter Implementation

- [x] 1.1 Create `examples/reporter.ts` with OrchestratorReporter class
- [x] 1.2 Add unit tests for reporter in `__tests__/reporter.test.ts`
  - Test `buildTestId()` with various file paths
  - Test exact matching (no substring collision)
  - Test graceful fallback when no shard file
  - Test debug mode logging

## 2. Action Integration

- [x] 2.1 Update `get-shard` action to output `shard-file` path
  - Write test IDs to JSON file when `level: test`
  - Output path via `shard-file` output variable
- [x] 2.2 ~~Update `orchestrate` action to include test IDs in output~~ (already outputs via `shard-files`)

## 3. Tests

- [x] 3.1 Unit tests for exact matching logic
  - Substring collision prevention
  - Case sensitivity
  - Special characters handling
- [x] 3.2 Integration test with example project
  - Add reporter to `examples/basic/playwright.config.ts`
  - Create test with special characters (`special-chars.spec.ts`)
  - Copy reporter as `playwright-orchestrator-reporter.ts`

## 4. Documentation

- [x] 4.1 Create `docs/test-level-reporter.md`
- [x] 4.2 Update `docs/README.md` to reference new doc
- [x] 4.3 Delete old verbose documentation
  - `docs/MINIMAL-test-level-solution.md`
  - `docs/SOLUTION-test-level-exact-matching.md`
  - `docs/TECHNICAL-test-level-distribution.md`
  - `docs/COMPARISON-approaches.md`
  - `docs/QUICK-START-test-level.md`

## 5. Validation

- [x] 5.1 Run `make lint && make typecheck` on reporter
- [x] 5.2 Run `make test` with new tests
- [ ] 5.3 Manual test with `examples/basic` project

## Progress

| Section | Status |
|---------|--------|
| Reporter Implementation | 2/2 ✓ |
| Action Integration | 2/2 ✓ |
| Tests | 2/2 ✓ |
| Documentation | 3/3 ✓ |
| Validation | 2/3 |
| **Total** | **11/12** |
