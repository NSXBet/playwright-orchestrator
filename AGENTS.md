# AI Assistant Instructions

Instructions for AI coding assistants working on this project.

## Project Overview

`@nsxbet/playwright-orchestrator` is a CLI tool for distributing Playwright tests across CI shards using historical timing data.

**Tech Stack:**
- Runtime: Bun 1.3.6
- Language: TypeScript 5.9.3 (ESM)
- CLI: oclif 4.8.0
- Linter: Biome 2.3.11
- Tests: Bun test

## Before Starting

1. Read `openspec/project.md` for conventions
2. Check `openspec/changes/` for active proposals
3. Run `make lint && make typecheck` to verify setup

## Code Style

- Use Biome for linting and formatting
- ESM modules with `.js` extensions in imports
- Strict TypeScript (`strict: true`)
- Single quotes, semicolons

```typescript
// Good
import { something } from './module.js';

// Bad
import { something } from './module';
```

## Architecture

```
src/
├── commands/     # CLI commands (oclif)
├── core/         # Algorithms and utilities
└── index.ts      # Package entry point
```

**Key Principles:**
- Storage-agnostic: Core works with files only
- Graceful fallback: Always have a fallback path
- Test coverage: Add tests for new functionality

## Architecture Deep Dive

### Distribution Algorithm

The orchestrator uses a two-phase approach:

1. **CKK Algorithm** (Complete Karmarkar-Karp): Optimal multi-way partitioning using branch-and-bound search. Finds the best possible distribution but may timeout for large inputs.

2. **LPT Algorithm** (Longest Processing Time First): Greedy fallback that's fast but may not be optimal. Sorts tests by duration descending and assigns each to the least-loaded shard.

```
CKK: O(2^n) worst case, but pruning makes it practical for n < 50
LPT: O(n log n) - always completes quickly
```

### Duration Estimation (Cold Start)

When historical timing data is unavailable, the orchestrator estimates durations using a fallback chain:

```
┌─────────────────────────────────────────────────────────┐
│                  Estimation Strategy                     │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  1. Same-file average                                   │
│     └─ If other tests in same file have timing data,   │
│        use their average duration                       │
│                                                         │
│  2. Global average                                      │
│     └─ If no same-file data, use average of all        │
│        known test durations                             │
│                                                         │
│  3. Default constant (30 seconds)                       │
│     └─ If no historical data exists at all,            │
│        assume 30s per test                              │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**First run behavior:**
- All tests are marked `estimated: true`
- Distribution is "blind" - based on estimates only
- Actual timing is collected after run

**Subsequent runs:**
- Real timing data is loaded from cache
- EMA smoothing prevents outliers from skewing distribution
- Distribution improves significantly

### Timing Data Smoothing (EMA)

Exponential Moving Average prevents single slow/fast runs from drastically changing the distribution:

```
newDuration = α × measuredDuration + (1 - α) × oldDuration

Default α = 0.3 (30% weight on new measurement)
```

This means:
- Recent measurements matter more than old ones
- A single outlier won't dramatically shift estimates
- Gradual adaptation to changing test durations

### Test Filtering (Custom Reporter)

To run only specific tests in a shard, the orchestrator outputs a JSON file with test IDs. A custom Playwright reporter reads this file and filters tests using exact `Set.has()` matching.

```typescript
// playwright.config.ts
reporter: [['@nsxbet/playwright-orchestrator/reporter'], ['html']]
```

**Test ID Format**: `{relative-path}::{describe}::{test-title}`
- Path is relative to CWD with forward slashes
- Example: `e2e/login.spec.ts::Login::should login`

This approach was chosen because:
- `--grep` has substring collision issues
- `file:line` breaks parameterized tests
- CLI arguments have shell escaping problems

See `docs/test-level-reporter.md` for the complete guide.

## Common Tasks

### Adding a CLI Command

1. Create `src/commands/my-command.ts`
2. Follow oclif pattern:

```typescript
import { Command, Flags } from '@oclif/core';

export default class MyCommand extends Command {
  static override description = 'Description';

  static override flags = {
    'my-flag': Flags.string({
      char: 'm',
      description: 'Flag description',
      required: true,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(MyCommand);
    // Implementation
  }
}
```

### Adding Core Functionality

1. Create `src/core/my-module.ts`
2. Export from `src/core/index.ts`
3. Add tests in `__tests__/my-module.test.ts`

### Running Quality Checks

```bash
make lint       # Check linting
make typecheck  # Check types
make test       # Run tests
```

## OpenSpec Workflow

This project uses OpenSpec for spec-driven development.

### Creating Changes

When adding features or making significant changes:

1. Read `openspec/AGENTS.md` for detailed instructions
2. Create proposal in `openspec/changes/<change-id>/`
3. Include: proposal.md, design.md (if needed), tasks.md, specs/

### Implementing Changes

1. Read the proposal and tasks
2. Implement in order
3. Update task checkboxes
4. Run `make lint && make typecheck && make test`

## Testing

### Unit Tests

```bash
bun test                    # All tests
bun test __tests__/foo.ts   # Specific file
```

### Local E2E Testing

```bash
make act-test  # Runs CI workflow locally with Act
```

## Git Workflow

- Feature branches: `feat/<name>`, `fix/<name>`, `chore/<name>`
- Conventional commits: `feat:`, `fix:`, `chore:`, `docs:`
- PRs require CI to pass (lint, typecheck, test, build)

## External Usage Patterns

The orchestrator is designed to be used by external repositories via GitHub Actions.

### Three-Phase Workflow

The recommended pattern for external users:

```
┌─────────────────┐     ┌─────────────────────────────────┐     ┌─────────────┐
│   orchestrate   │────▶│      e2e (matrix: [1,2,3,4])    │────▶│ merge-timing│
│   (1 job)       │     │  get-shard → Run tests          │     │ (1 job)     │
└─────────────────┘     └─────────────────────────────────┘     └─────────────┘
```

1. **orchestrate**: Runs once, outputs shard assignments for ALL shards
2. **e2e matrix**: Each shard uses `get-shard` action to get test arguments
3. **merge-timing**: Collects timing data from all shards

### Storage-Agnostic Design

Actions do NOT handle cache/artifacts internally. Users control:
- Cache keys and paths
- Artifact upload/download
- Storage backends (cache, S3, etc.)

```yaml
# User controls cache - orchestrate action just reads files
- uses: actions/cache/restore@v4
  with:
    path: timing-data.json
    key: playwright-timing-${{ github.ref_name }}

- uses: NSXBet/playwright-orchestrator/.github/actions/orchestrate@v0
  with:
    timing-file: timing-data.json  # User provides the file
```

### Key Actions

| Action | Purpose |
|--------|---------|
| `setup-orchestrator` | Install and cache the CLI |
| `orchestrate` | Assign tests to shards (outputs `shard-files` JSON) |
| `get-shard` | Extract `shard-file` path for reporter-based filtering |
| `extract-timing` | Extract timing from Playwright reports |
| `merge-timing` | Merge timing data with EMA smoothing |

### Test Discovery

The orchestrator uses Playwright's `--list` command for accurate test discovery. This properly handles:
- Parameterized tests (`test.each`, data-driven tests)
- Template literals in test names (e.g., `${variable}`)
- All test syntax patterns

**Important**: Always pass the `--project` flag to `assign` and `list-tests` commands for accurate discovery:

```bash
playwright-orchestrator assign --test-dir ./e2e --shards 4 --project "Mobile Chrome"
```

The regex-based fallback (`--use-fallback`) should only be used if Playwright `--list` is unavailable.

### Fallback Behavior

If orchestration fails, workflows should fallback to Playwright's `--shard` flag:

```yaml
# get-shard action outputs shard-file for reporter-based filtering
- uses: NSXBet/playwright-orchestrator/.github/actions/get-shard@v0
  id: shard
  with:
    shard-files: ${{ needs.orchestrate.outputs.shard-files }}
    shard-index: ${{ matrix.shard }}
    shards: 4

# Use shard-file env var for reporter-based filtering
- run: npx playwright test
  env:
    ORCHESTRATOR_SHARD_FILE: ${{ steps.shard.outputs.shard-file }}
```

### Cancellation-Aware Steps

Use `if: success() || failure()` instead of `always()`:

```yaml
- name: Extract timing
  if: success() || failure()  # NOT always() - skip on cancel
  uses: NSXBet/playwright-orchestrator/.github/actions/extract-timing@v0
```

### Key Documentation

| Resource | Purpose |
|----------|---------|
| `docs/external-integration.md` | Complete integration guide |
| `examples/external-workflow.yml` | Copy-paste workflow template |
| `README.md` | Quick start for external users |

## Important Files

| File | Purpose |
|------|---------|
| `openspec/project.md` | Project conventions |
| `openspec/changes/` | Active change proposals |
| `biome.json` | Linter config |
| `tsconfig.json` | TypeScript config |
| `Makefile` | Common commands |
