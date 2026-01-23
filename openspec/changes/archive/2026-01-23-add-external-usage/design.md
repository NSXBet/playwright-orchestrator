# Design: External Usage Support

## Context

The orchestrator needs to be usable by external GitHub repositories. This requires:
1. A way to install the CLI without building from source
2. GitHub Actions that work when referenced from another repo
3. Flexibility for users to control their own caching strategy

## Goals / Non-Goals

**Goals:**
- External repos can use orchestrator via GitHub Actions
- Users control where timing data is cached
- Graceful fallback if orchestrator fails
- No breaking changes to existing internal usage

**Non-Goals:**
- Supporting CI systems other than GitHub Actions (future work)
- Auto-publishing on every commit (manual releases only)
- Built-in S3/GCS storage adapters

## Decisions

### Decision 1: Dedicated Setup Action

**What:** Create a new `setup` action that installs the CLI via npm and caches it.

**Why:** 
- External users can't run `bun run build`
- Installing once per job is more efficient than per-step
- Caching the installation saves ~10s per job

**Alternatives considered:**
- npx in each action: Slower, no caching
- Docker action: Heavier, slower startup
- Pre-built binaries: Complex release process

### Decision 2: Storage-Agnostic Actions

**What:** Actions only do their core function (assign, extract, merge). They don't handle cache or artifacts.

**Why:**
- Users may want different cache keys, paths, or storage backends
- Aligns with "storage-agnostic" principle in project.md
- Simpler actions, easier to maintain

**Implementation:**
```yaml
# orchestrate action outputs
outputs:
  grep-pattern: "..."        # Pattern for --grep
  use-native-sharding: "..."  # true if fallback needed
  shard-arg: "..."           # e.g., --shard=1/4

# User handles cache
- uses: actions/cache@v4
  with:
    path: timing-data.json
    key: my-custom-key-${{ github.ref }}
```

### Decision 3: Native Sharding Fallback

**What:** If the orchestrator fails for any reason, output `use-native-sharding=true` and `shard-arg=--shard=N/M`.

**Why:**
- Tests must always run, even if orchestration fails
- First-time users won't have timing data
- Graceful degradation is better than failure

**Trigger conditions:**
- CLI not installed or crashes
- Timing file corrupted
- No tests discovered
- Timeout during assignment

### Decision 4: Cancellation Handling

**What:** Use `if: success() || failure()` instead of `if: always()` for extract/merge steps.

**Why:**
- `always()` runs even when workflow is cancelled
- User cancellation = "I want to stop everything"
- Timing extraction on cancelled run may have incomplete data

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| npm publish credentials leak | Use GitHub's built-in npm publish action with OIDC |
| Action version drift | Document that `@v1` tracks major version |
| Cache key collisions | User controls keys, document best practices |
| Fallback hides real errors | Emit `::warning::` when falling back |

## Migration Plan

1. **Phase 1:** Publish to npm (manual release)
2. **Phase 2:** Add setup action for external users
3. **Phase 3:** Refactor existing actions to be storage-agnostic
4. **Phase 4:** Update documentation with external usage examples

No breaking changes for internal usage - existing workflows continue to work.

## Open Questions

None - all decisions confirmed during planning.
