## Context

See proposal.md. The Playwright workflow has a cold round with independent matrix jobs and a timing round-trip check. The Jest workflow now has a second execution round, but both workflows need a shared observable lifecycle contract and the Playwright workflow needs the same warm execution coverage.

## Goals / Non-Goals

**Goals:**

- Preserve runner-specific execution mechanisms while validating the same cold-to-warm lifecycle.
- Use workflow artifacts rather than caches to make each E2E run isolated and reproducible.
- Make successful and failed lifecycle states diagnosable from the Actions summary.

**Non-Goals:**

- Require a specific test to move shards under noisy wall-clock timing.
- Persist E2E timing data across workflow runs.
- Model fixture evolution or change production timing schemas.

## Decisions

### Round inputs are immutable named artifacts

The cold discovery input, assignment, and merged timing store are copied to one named artifact. Warm matrix jobs consume only that artifact, so the workflow proves which data drove the warm plan.

Alternative: reuse workspace files or restore a cache. Rejected because separate GitHub jobs do not share workspaces and caches would make the test depend on prior runs.

### Coverage checks are runner-specific but report the same facts

Playwright validates test-list/report identities; Jest validates assignment/report identities. Both emit per-shard assigned, report-covered, executable-measurement, planned, and measured totals, then a final cross-shard result.

Alternative: force a shared parser. Rejected because report formats and selected-test semantics differ materially.

### Sparse plans are no-ops

An assigned empty shard terminates successfully without native sharding. Native fallback remains reserved for unavailable orchestration, because it cannot preserve an explicit empty plan.

Alternative: run native shard for empty assignment. Rejected because it can run tests absent from the exact plan.

### Five shards are manual coverage

`workflow_dispatch` accepts a shard count, including five, while pull requests remain two shards to keep routine validation practical.

## Risks / Trade-offs

- Two rounds increase E2E time and artifact count → retain two shards for pull requests and collect only JSON/timing artifacts required by validation.
- Timings can be zero or fluctuate → validate reuse, coverage, and repeated observations, not a required placement change.
- Failure can interrupt later summary sections → write round headings and diagnostic data before each validation boundary.

## Migration Plan

1. Add lifecycle artifact and summary helpers to both monorepo workflows.
2. Change valid empty shard handling to no-op and test through manual five-shard dispatch.
3. Run local Act workflows and remote Actions runs, then merge through a feature PR.
