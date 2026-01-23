# Change: Initialize Playwright Orchestrator Package

## Why

The `bet-app` monorepo contains a Playwright test orchestrator that distributes tests across CI shards using historical timing data. This code is tightly coupled to the monorepo and needs to be extracted as a standalone library for reuse in other projects.

Current problems with default Playwright sharding:
- Distributes by file count, not duration
- Creates significant imbalance (up to 182% difference between shards)
- Large test files cannot be split across shards
- CI time bottlenecked by slowest shard

## What Changes

### Phase 1: Project Setup (PR1)
- Initialize project with Bun 1.3.6 + mise
- Configure Biome 2.3.11 for linting/formatting
- Configure TypeScript 5.9.3 for type checking
- Setup GitHub Actions CI (lint + typecheck)
- Create Makefile for local development
- Create README.md and AGENTS.md

### Phase 2: Implementation (PR2)
- Extract CLI commands from `bet-app/packages/playwright-orchestrator/`
  - `assign` - Distribute tests across shards
  - `extract-timing` - Extract timing from Playwright reports
  - `merge-timing` - Merge timing data with EMA smoothing
  - `list-tests` - Discover tests in a project
- Extract core algorithms
  - CKK (Complete Karmarkar-Karp) for optimal distribution
  - LPT (Longest Processing Time First) as fallback
  - EMA timing smoothing
  - Test discovery and grep pattern generation
- Create example project with controlled-duration tests
- Create GitHub Actions (storage-agnostic)
- Setup local testing with Act

## Impact

- **Affected specs**: `orchestration` (new capability)
- **Affected code**:
  - `src/commands/` - CLI commands
  - `src/core/` - Algorithms and utilities
  - `__tests__/` - Unit tests
  - `examples/basic/` - Example Playwright project
  - `.github/actions/` - Composite actions
  - `.github/workflows/` - CI and example workflows

## Expected Outcome

- Standalone npm package `@nsxbet/playwright-orchestrator`
- Reusable GitHub Actions for any Playwright project
- All shards within 10-15% of each other (vs 182% difference before)
- Local testing possible with Act and Makefile
