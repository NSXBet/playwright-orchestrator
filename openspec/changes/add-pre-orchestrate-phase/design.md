# Design: Pre-Orchestrate Phase

## Context

GitHub Actions matrix jobs run in parallel. The documented workflow pattern runs orchestration in each matrix job independently. This means 4 shards = 4 identical orchestration runs.

The current documentation puts too much manual work on users: shell scripting, jq parsing, fallback logic. This is bad DX.

## Goals / Non-Goals

**Goals:**
- Encapsulate complexity in actions
- User controls only storage (cache keys, artifact paths)
- Run orchestration once, not N times
- Zero shell scripting required for basic usage

**Non-Goals:**
- Deprecating the per-shard orchestration pattern
- Handling cross-workflow orchestration

## Decisions

### Decision 1: Make `shard-index` Optional in `orchestrate` Action

**What:** When `shard-index` is omitted, output ALL shard assignments.

**Why:**
- Same action, two modes
- Backwards compatible (existing usage still works)
- No new action needed for orchestrate phase

**Outputs when `shard-index` omitted:**
```yaml
outputs:
  shard-files: '{"1": ["a.spec.ts"], "2": ["b.spec.ts"], ...}'
  expected-durations: '{"1": 45000, "2": 43000, ...}'
  use-orchestrator: 'true'  # or 'false' if failed
```

### Decision 2: New `get-shard` Helper Action

**What:** Simple action to extract a shard's test arguments from the orchestrate output.

**Why:**
- Encapsulates jq parsing
- Handles fallback logic
- Single output `test-args` that "just works"

**Inputs:**
```yaml
inputs:
  shard-files:
    description: JSON from orchestrate action
    required: true
  shard-index:
    description: Which shard (1-based)
    required: true
  shards:
    description: Total shards (for fallback)
    required: true
```

**Outputs:**
```yaml
outputs:
  test-args:     # Either "file1.spec.ts file2.spec.ts" OR "--shard=1/4"
  has-files:     # 'true' if orchestrated files exist
  file-list:     # Space-separated file list (empty if fallback)
```

**Usage:**
```yaml
- uses: NSXBet/playwright-orchestrator/.github/actions/get-shard@v1
  id: shard
  with:
    shard-files: ${{ needs.orchestrate.outputs.shard-files }}
    shard-index: ${{ matrix.shard }}
    shards: 4

# Just works - either files or --shard=N/M
- run: npx playwright test ${{ steps.shard.outputs.test-args }}
```

### Decision 3: File-Level as Default

**What:** Default to `--level file` in examples.

**Why:**
- Simpler output (file names vs grep patterns)
- Works with any Playwright version
- Proven at scale (bet-app, 8 shards)

### Decision 4: Storage-Agnostic Remains

**What:** Actions still don't handle cache/artifacts internally.

**Why:**
- User controls cache keys, paths, backends
- Consistent with existing design
- Flexibility for S3, GCS, etc.

## Implementation

### `orchestrate` action changes

```yaml
inputs:
  shard-index:
    description: Current shard (1-based). Omit for all shards.
    required: false  # CHANGED from true
    default: ''

outputs:
  # Existing outputs (for per-shard mode)
  grep-pattern: ...
  test-count: ...
  
  # New outputs (for all-shards mode)
  shard-files:
    description: JSON object with all shard assignments
  expected-durations:
    description: JSON object with expected durations per shard
  use-orchestrator:
    description: Whether orchestration succeeded
```

### New `get-shard` action

```yaml
name: Get Shard Test Arguments
description: Extract test arguments for a specific shard

inputs:
  shard-files:
    description: JSON shard assignments from orchestrate action
    required: true
  shard-index:
    description: Which shard to get (1-based)
    required: true
  shards:
    description: Total shard count (for native fallback)
    required: true

outputs:
  test-args:
    description: Arguments for playwright test command
  has-files:
    description: Whether this shard has orchestrated files
  file-list:
    description: Space-separated file list (empty if fallback)

runs:
  using: composite
  steps:
    - shell: bash
      run: |
        SHARD_FILES='${{ inputs.shard-files }}'
        SHARD_INDEX='${{ inputs.shard-index }}'
        TOTAL='${{ inputs.shards }}'
        
        # Check if we have valid shard files
        if [ -z "$SHARD_FILES" ] || [ "$SHARD_FILES" = "{}" ]; then
          echo "test-args=--shard=$SHARD_INDEX/$TOTAL" >> $GITHUB_OUTPUT
          echo "has-files=false" >> $GITHUB_OUTPUT
          echo "file-list=" >> $GITHUB_OUTPUT
          exit 0
        fi
        
        # Extract files for this shard
        FILES=$(echo "$SHARD_FILES" | jq -r ".\"$SHARD_INDEX\" // [] | join(\" \")")
        
        if [ -z "$FILES" ]; then
          echo "test-args=--shard=$SHARD_INDEX/$TOTAL" >> $GITHUB_OUTPUT
          echo "has-files=false" >> $GITHUB_OUTPUT
        else
          echo "test-args=$FILES" >> $GITHUB_OUTPUT
          echo "has-files=true" >> $GITHUB_OUTPUT
        fi
        echo "file-list=$FILES" >> $GITHUB_OUTPUT
```

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| GitHub output size limit (1MB) | File-level keeps output small |
| Two action calls instead of one | Still simpler than shell scripting |
| Breaking change? | No - `shard-index` becomes optional |
