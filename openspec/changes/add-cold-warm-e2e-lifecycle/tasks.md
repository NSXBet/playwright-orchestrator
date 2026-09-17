## 1. Lifecycle behavior

- [x] 1.1 Make a valid empty Playwright shard plan a no-op, while retaining native fallback for unavailable orchestration.
- [x] 1.2 Update Playwright and Jest monorepo E2Es to preserve cold-round inputs and execute warm-round shard plans using the merged cold timing store.

## 2. Validation and diagnostics

- [x] 2.1 Add exact per-round coverage, timing reuse, repeated-observation, and cold-versus-warm load diagnostics.
- [x] 2.2 Write the required lifecycle report and final invariant checklist to `$GITHUB_STEP_SUMMARY`.
- [x] 2.3 Support manual five-shard lifecycle coverage and validate sparse-plan behavior.

## 3. Verification

- [x] 3.1 Update workflow-facing documentation for empty plans and lifecycle diagnostics.
- [ ] 3.2 Run formatting, lint, type-check, unit tests, workflow linting, and both monorepo E2Es through GitHub Actions.
- [ ] 3.3 Create a changeset and open a PR linked to issue #56.
