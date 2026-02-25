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

## Critical Rules

### Test ID Consistency (CRITICAL)

The orchestrator's correctness depends on ALL components generating **IDENTICAL test IDs** for the same test. Inconsistent IDs will cause tests to silently fail to match between shard assignment and runtime filtering.

**Single source of truth for path resolution: `project.testDir`**

ALL components MUST use `project.testDir` (not `config.rootDir`) for path resolution:
- **Discovery**: Uses `project.testDir` from test-list.json config
- **Fixture**: Uses `testInfo.project.testDir`
- **Reporter**: Uses `test.parent.project().testDir`
- **Timing extraction**: Uses `project.testDir` from report config

**NEVER fall back to `process.cwd()` or `config.rootDir`** - this causes path mismatch bugs when `testDir` is a subdirectory (e.g., `testDir: './src/test/e2e'`).

**Two contexts for test ID generation:**

1. **Discovery context** (Playwright JSON output):
   - Use `buildTestId` from `src/core/types.ts`
   - Data comes pre-processed from Playwright's `--list` JSON
   - titlePath already excludes project name and filename

2. **Runtime context** (testInfo.titlePath):
   - Use `buildTestIdFromRuntime` from `src/core/test-id.ts`
   - Data comes from Playwright's runtime `testInfo.titlePath`
   - titlePath includes project name, filename, and file paths that must be filtered
   - **baseDir is REQUIRED** - the function will throw if not provided

**NEVER duplicate the filtering logic. ALWAYS use the shared functions from `src/core/test-id.ts`.**

```typescript
// CORRECT - Use shared function with REQUIRED baseDir
import { buildTestIdFromRuntime } from './core/test-id.js';
const testId = buildTestIdFromRuntime(file, titlePath, { 
  projectName, 
  baseDir: testInfo.project.testDir  // REQUIRED - no fallback!
});

// WRONG - Using process.cwd() or config.rootDir
const testId = buildTestIdFromRuntime(file, titlePath, { 
  projectName, 
  baseDir: process.cwd()  // DON'T DO THIS - causes path mismatch!
});
```

### No Flaky Assumptions

**NEVER make assumptions about user directory structure or naming conventions.**

Bad examples (DO NOT DO):
- "Strip `apps/` or `packages/` prefix for monorepos"
- "Assume testDir is always `e2e/`"
- "File paths starting with `src/` should be normalized"
- "Fall back to `process.cwd()` if testDir is not available"
- "Use `config.rootDir` instead of `project.testDir`"

**All path handling must be deterministic**, based solely on:
- Playwright's `project.testDir` (NOT `config.rootDir`)
- Actual file paths from `testInfo.file` or JSON output
- Standard Node.js `path.relative()` behavior

**Strict validation**: If `project.testDir` is not available, the orchestrator MUST throw a clear error message guiding the user to fix their configuration, rather than silently falling back to potentially incorrect paths.

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
reporter: [
  ['@nsxbet/playwright-orchestrator/reporter', {
    filterJson: 'playwright-report/results.json',
  }],
  ['json', { outputFile: 'playwright-report/results.json' }],
  ['html'],
]
```

**Reporter options:**
- `filterJson` (optional): Path to the JSON report file. When set, the reporter rewrites the JSON report in `onExit`, removing specs not assigned to this shard (using test-ID matching against the shard file) and recalculating `.stats`. This prevents timing corruption and report pollution.

**Test ID Format**: `{relative-path}::{describe}::{test-title}`
- Path is relative to Playwright's `project.testDir` (NOT `config.rootDir`), with forward slashes
- Example: `login.spec.ts::Login::should login`

This approach was chosen because:
- `--grep` has substring collision issues
- `file:line` breaks parameterized tests
- CLI arguments have shell escaping problems

See `docs/test-level-reporter.md` for the complete guide.

### Monorepo Path Resolution

In monorepos, the orchestrator and fixture may run from different directories:
- **Orchestrator**: Runs from repo root (e.g., `bet-app/`)
- **Fixture**: Runs from app directory (e.g., `apps/bet-client/`)

To ensure consistent test IDs, both use **Playwright's rootDir** from the test-list.json:

```
┌─────────────────────────────────────────────────────────────────┐
│                    Path Resolution                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  test-list.json generated from: apps/bet-client/                │
│  rootDir in JSON config: /full/path/to/repo/apps/bet-client     │
│                                                                 │
│  Orchestrator (CWD: repo root):                                 │
│  └─ Uses rootDir from JSON → src/test/e2e/login.spec.ts        │
│                                                                 │
│  Fixture (CWD: apps/bet-client):                                │
│  └─ path.relative(CWD, file) → src/test/e2e/login.spec.ts      │
│                                                                 │
│  Both produce: src/test/e2e/login.spec.ts::Login::test ✓       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Important**: Always generate `test-list.json` from the directory where tests run:

```yaml
# In CI workflow
- name: Generate test list
  working-directory: apps/bet-client  # Same as where tests run
  run: npx playwright test --list --reporter=json > test-list.json

- uses: NSXBet/playwright-orchestrator/.github/actions/orchestrate@v0
  with:
    test-list: apps/bet-client/test-list.json  # Path from repo root
```

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
make act-test           # Runs CI workflow locally with Act (lint, test, build)
make act-publish        # Runs publish test locally with Act (Verdaccio)
make act-e2e            # Runs E2E example workflow with Act
make act-e2e-monorepo   # Runs E2E monorepo workflow with Act
```

### E2E Monorepo Testing

The `e2e-monorepo.yml` workflow tests the orchestrator in a realistic monorepo scenario:

```
┌─────────┐     ┌─────────────┐     ┌────────────────┐     ┌───────┐
│  setup  │────▶│ orchestrate │────▶│ e2e-tests (2x) │────▶│ merge │
└─────────┘     └─────────────┘     └────────────────┘     └───────┘
```

**Workflow Structure:**
- **setup**: Builds package, creates tarball artifact
- **orchestrate**: Uses real `orchestrate` action to assign tests
- **e2e-tests**: Matrix job using `get-shard` and `extract-timing` actions
- **merge**: Uses `merge-timing` action to combine timing data

**Note**: Publish validation is handled separately in CI via the `test-publish` job (Verdaccio).

**Test Scenarios in `examples/monorepo/`:**
- Path normalization (`apps/web/` prefix handling)
- Parameterized tests (`test.each` patterns)
- Nested describe blocks (4+ levels deep)
- Special characters in test names (Unicode, brackets)
- `::` separator conflicts in test titles
- Skip patterns (`skip`, `fixme`, `slow`, tags)
- Deep subdirectory paths (`features/deep/path.spec.ts`)

**Key Files:**
- `.github/workflows/e2e-monorepo.yml` - Main E2E workflow
- `examples/monorepo/` - Test monorepo structure mirroring bet-app
- `verdaccio/config.yaml` - Local registry config for testing

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

# Generate test list first
- run: npx playwright test --list --reporter=json > test-list.json

- uses: NSXBet/playwright-orchestrator/.github/actions/orchestrate@v0
  with:
    test-list: test-list.json  # Required: pre-generated list
    timing-file: timing-data.json  # Required: timing data
    shards: 4
```

### Cache Strategy for PRs

GitHub Actions cache is branch-scoped. A PR branch can read from main's cache, but main cannot read from a PR branch's cache after merge. Use the **promote-on-merge** pattern:

1. Each PR saves to branch-specific key: `playwright-timing-${{ github.ref_name }}-$project`
2. PRs restore with fallback to main: `playwright-timing-main-$project`
3. On PR merge, a workflow promotes the PR's cache to main's cache

This avoids race conditions between concurrent PRs while ensuring main always has the latest timing data from merged PRs.

See [docs/external-integration.md](./docs/external-integration.md#cache-strategy-for-prs) for implementation details.

### Key Actions

| Action | Purpose |
|--------|---------|
| `setup-orchestrator` | Install and cache the CLI |
| `orchestrate` | Assign tests to shards (outputs `shard-files` JSON) |
| `get-shard` | Extract `shard-file` path for reporter-based filtering |
| `extract-timing` | Extract timing from Playwright reports (requires `shard-file` and `project`) |
| `merge-timing` | Merge timing data with EMA smoothing |
| `filter-report` | Remove orchestrator-skipped tests from merged JSON report |

### Test Discovery

Users must generate the test list themselves using Playwright's `--list` command:

```bash
npx playwright test --list --reporter=json --project "Mobile Chrome" > test-list.json
```

This ensures accurate discovery of:
- Parameterized tests (`test.each`, data-driven tests)
- Template literals in test names (e.g., `${variable}`)
- All test syntax patterns

The generated `test-list.json` is then passed to the `assign` command via `--test-list`.

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
