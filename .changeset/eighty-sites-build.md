---
"@nsxbet/playwright-orchestrator": major
---

Adopt Playwright's --test-list for pre-execution test filtering.

**BREAKING CHANGES:**
- Minimum Playwright version: 1.56+ (introduces `--test-list` CLI flag)
- Removed `fixture` export (`withOrchestratorFilter`, `shouldRunTest`)
- Removed `reporter` export (custom reporter)
- Removed `filter-report` command and action
- Removed `extract-timing --shard-file` flag (reports are natively clean)
- Removed `ORCHESTRATOR_SHARD_FILE` and `ORCHESTRATOR_DEBUG` env vars
- Removed `@playwright/test` peerDependency
- `get-shard` action outputs `test-list-file` (plain text) instead of `shard-file` (JSON)
- `orchestrate` action outputs `test-list-files` instead of `shard-files`

**Added:**
- `assign` command JSON output includes `testListFiles` with Playwright --test-list formatted content per shard
- `toTestListFormat` and `toTestListFile` functions for test ID format conversion
- `loadTestListWithConfig` function exposing rootDir/testDir from Playwright config

**Migration:**
- Remove orchestrator reporter and fixture from `playwright.config.ts` and test setup
- Use `--test-list` flag instead of `ORCHESTRATOR_SHARD_FILE` env var
- Update CI workflows: `shard-files` → `test-list-files`, `shard-file` → `test-list-file`
- Remove `filter-report` step from CI workflows (reports are natively clean)
- Remove `shard-file` input from `extract-timing` action
