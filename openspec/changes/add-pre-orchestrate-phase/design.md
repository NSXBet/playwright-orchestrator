# Design: Pre-Orchestrate Phase

## Context

GitHub Actions matrix jobs run in parallel. The documented workflow pattern runs orchestration in each matrix job independently. This means 4 shards = 4 identical orchestration runs. The CKK algorithm is deterministic, so all runs produce the same result.

A better pattern exists and is proven in production: run orchestration once in a dedicated job, pass assignments to matrix jobs via GitHub outputs.

## Goals / Non-Goals

**Goals:**
- Document the three-phase workflow pattern as recommended
- Update examples to use the proven pattern from bet-app
- Keep actions storage-agnostic

**Non-Goals:**
- Creating new actions (existing CLI already supports this)
- Deprecating the per-shard orchestration pattern
- Handling cross-workflow orchestration

## Decisions

### Decision 1: Documentation-Only Change

**What:** Update documentation and examples to show three-phase pattern. No new actions needed.

**Why:**
- The CLI already outputs all shard assignments with `--output-format json`
- The pattern is proven working in bet-app production
- Simpler than creating new actions

**Existing CLI output:**
```json
{
  "shards": {
    "1": ["file1.spec.ts", "file2.spec.ts"],
    "2": ["file3.spec.ts"],
    ...
  },
  "expectedDurations": {
    "1": 45000,
    "2": 43000,
    ...
  },
  "isOptimal": true
}
```

### Decision 2: Pass Assignments via GitHub Outputs

**What:** Use `GITHUB_OUTPUT` to pass assignment JSON to dependent jobs via `needs.<job>.outputs`.

**Why:**
- Native GitHub Actions mechanism
- No artifact upload/download overhead
- Immediate availability to dependent jobs
- Already proven in bet-app

**Implementation (from bet-app):**
```yaml
# orchestrate job outputs
outputs:
  shard-files: ${{ steps.assign.outputs.shard-files }}
  use-orchestrator: ${{ steps.assign.outputs.use-orchestrator }}

# Shard job reads assignment
- name: Get shard files
  run: |
    FILES=$(echo '${{ needs.orchestrate.outputs.shard-files }}' | jq -r '.["${{ matrix.shardIndex }}"] | join(" ")')
    echo "files=$FILES" >> $GITHUB_OUTPUT

- name: Run tests
  run: npx playwright test ${{ steps.get-files.outputs.files }}
```

### Decision 3: File-Level Distribution (Recommended)

**What:** Document file-level (`--level file`) as the simpler approach for the three-phase pattern.

**Why:**
- Pass file list directly to Playwright (simpler than `--grep` patterns)
- Works with any Playwright version
- Proven in bet-app with 8 shards

**Test-level still available:** For finer granularity, users can use test-level with `--grep` patterns, but file-level is recommended for most cases.

### Decision 4: Inline Fallback Logic

**What:** Show fallback logic inline in workflow YAML, not as a separate action.

**Why:**
- More transparent for users
- Easy to customize
- Matches bet-app pattern

```yaml
- name: Run assign
  run: |
    set +e
    RESULT=$(playwright-orchestrator assign ... 2>&1)
    EXIT_CODE=$?
    set -e
    
    if [ $EXIT_CODE -ne 0 ] || ! echo "$RESULT" | jq -e '.' > /dev/null 2>&1; then
      echo "use-orchestrator=false" >> $GITHUB_OUTPUT
    else
      echo "use-orchestrator=true" >> $GITHUB_OUTPUT
      echo "shard-files=$(echo "$RESULT" | jq -c '.shards')" >> $GITHUB_OUTPUT
    fi
```

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| GitHub output size limit (1MB) | File-level keeps output small; document limit |
| More complex workflow YAML | Provide copy-paste example |
| Users may not update | Keep old pattern working, add warning |

## Open Questions

None - pattern is proven in bet-app production.
