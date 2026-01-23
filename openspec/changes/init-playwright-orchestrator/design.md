# Design: Playwright Orchestrator

## Context

We need to extract the Playwright test orchestrator from `bet-app` as a standalone, reusable library. The orchestrator must:
- Work independently of the monorepo
- Be storage-agnostic (not depend on GitHub Cache)
- Support local testing with Act
- Provide GitHub Actions for easy integration

## Goals / Non-Goals

### Goals
- Standalone npm package with CLI
- Optimal test distribution using CKK algorithm
- Storage-agnostic architecture
- Local testing with Act and Makefile
- Reusable GitHub Actions

### Non-Goals
- GUI or web interface
- Integration with other CI systems (Jenkins, GitLab)
- Real-time monitoring dashboard
- Automatic retries or flaky test handling

## Decisions

### 1. Runtime: Bun 1.3.6

**Decision**: Use Bun as runtime and package manager.

**Rationale**:
- Fast startup time for CLI
- Built-in TypeScript support
- Built-in test runner
- Single binary, no node_modules sprawl

**Alternatives considered**:
- Node.js + npm: Slower, more dependencies
- Deno: Less mature ecosystem for CLI tools

### 2. Linter: Biome 2.3.11

**Decision**: Use Biome for linting and formatting.

**Rationale**:
- 10-100x faster than ESLint + Prettier
- Single tool for lint + format
- Zero configuration needed

**Alternatives considered**:
- ESLint + Prettier: Slower, more configuration
- dprint: Less mature, fewer rules

### 3. CLI Framework: oclif 4.8.0

**Decision**: Use oclif for CLI commands.

**Rationale**:
- Mature, well-documented
- Built-in help generation
- Plugin architecture for extensibility
- Already used in bet-app

**Alternatives considered**:
- Commander.js: Simpler but less features
- Yargs: Good but oclif is more structured

### 4. Storage-Agnostic Architecture

**Decision**: Core library works only with files. Storage layer is separate.

```
┌─────────────────────────────────────────────┐
│  CLI Commands (assign, extract, merge)      │
├─────────────────────────────────────────────┤
│  Core Library (algorithms, types)           │
├─────────────────────────────────────────────┤
│  File I/O (read/write JSON files)           │
└─────────────────────────────────────────────┘
         │
         ▼ (user's responsibility)
┌─────────────────────────────────────────────┐
│  Storage: GitHub Cache / S3 / Local FS      │
└─────────────────────────────────────────────┘
```

**Rationale**:
- Enables local testing without CI
- Users can choose their storage backend
- Simpler to test and debug

### 5. Distribution Algorithm: CKK with LPT Fallback

**Decision**: Use Complete Karmarkar-Karp (CKK) for optimal distribution, fall back to LPT if timeout.

**Algorithm flow**:
1. Sort tests by duration (descending)
2. Run CKK with 500ms timeout
3. If timeout, use LPT result
4. Return `isOptimal` flag in output

**Rationale**:
- CKK finds provably optimal solution
- LPT guarantees 4/3 approximation
- 500ms timeout prevents CI slowdown

### 6. Timing Smoothing: EMA (alpha=0.3)

**Decision**: Use Exponential Moving Average for timing data.

**Formula**: `newDuration = 0.3 × measured + 0.7 × historical`

**Rationale**:
- Smooths out variance from retries and machine differences
- 30% weight on new data balances stability and responsiveness
- Simple to implement and understand

### 7. Version Pinning

**Decision**: All versions pinned, no `latest`.

| Tool       | Version      | File              |
|------------|--------------|-------------------|
| Bun        | 1.3.6        | .tool-versions    |
| Ubuntu     | ubuntu-24.04 | workflows/*.yml   |
| Biome      | 2.3.11       | biome.json        |
| TypeScript | 5.9.3        | package.json      |
| oclif/core | 4.8.0        | package.json      |

**Rationale**:
- Reproducible builds
- No surprise breaking changes
- Easier to debug issues

## Package Structure

```
playwright-orchestrator/
├── src/
│   ├── commands/           # CLI commands (oclif)
│   │   ├── assign.ts       # Distribute tests to shards
│   │   ├── extract-timing.ts
│   │   ├── list-tests.ts
│   │   └── merge-timing.ts
│   ├── core/               # Core algorithms
│   │   ├── ckk-algorithm.ts
│   │   ├── lpt-algorithm.ts
│   │   ├── timing-store.ts
│   │   ├── test-discovery.ts
│   │   ├── grep-pattern.ts
│   │   ├── estimate.ts
│   │   ├── slugify.ts
│   │   ├── types.ts
│   │   └── index.ts
│   └── index.ts
├── __tests__/
├── bin/
│   └── run.js
├── examples/
│   └── basic/              # Example Playwright project
├── .github/
│   ├── actions/
│   │   ├── setup/
│   │   ├── orchestrate/
│   │   ├── extract-timing/
│   │   └── merge-timing/
│   └── workflows/
│       ├── ci.yml
│       └── e2e-example.yml
├── .tool-versions
├── biome.json
├── tsconfig.json
├── package.json
├── Makefile
├── README.md
└── AGENTS.md
```

## Data Formats

### Timing Data (v2 - Test Level)

```json
{
  "version": 2,
  "updatedAt": "2026-01-23T10:00:00Z",
  "tests": {
    "betslip.spec.ts::BetSlip::should create bet": {
      "file": "betslip.spec.ts",
      "duration": 45000,
      "runs": 15,
      "lastRun": "2026-01-23T09:55:00Z"
    }
  }
}
```

### Shard Timing Artifact

```json
{
  "shard": 1,
  "project": "chromium",
  "tests": {
    "betslip.spec.ts::BetSlip::should create bet": 45000
  }
}
```

### Assign Output

```json
{
  "shards": {
    "1": ["test-id-1", "test-id-2"],
    "2": ["test-id-3", "test-id-4"]
  },
  "grepPatterns": {
    "1": "should create bet|should update bet",
    "2": "should delete bet|should view bet"
  },
  "expectedDurations": {
    "1": 120000,
    "2": 115000
  },
  "totalTests": 4,
  "estimatedTests": ["test-id-3"],
  "isOptimal": true
}
```

## Risks / Trade-offs

### Risk: CKK Timeout on Large Test Suites
- **Mitigation**: 500ms timeout with LPT fallback
- **Trade-off**: May not always get optimal solution

### Risk: Test Discovery Inconsistency
- **Mitigation**: Support both `playwright --list` and file parsing
- **Trade-off**: File parsing may miss some edge cases

### Risk: Grep Pattern Too Long
- **Mitigation**: Use `--grep-file` for patterns > 4000 chars
- **Trade-off**: Extra file I/O

## Migration Plan

1. **PR1**: Project setup with tooling and CI
2. **PR2**: Extract code from bet-app, adapt for standalone
3. Future: Update bet-app to use this package

## Open Questions

- [ ] Should we support custom storage backends via plugins?
- [ ] Should we add a `watch` mode for local development?
- [ ] Should we publish to npm public or private registry?
