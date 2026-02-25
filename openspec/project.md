# Project Context

## Purpose

`@nsxbet/playwright-orchestrator` is a CLI tool for intelligent Playwright test distribution across CI shards using historical timing data. It uses the Complete Karmarkar-Karp (CKK) algorithm for optimal distribution and supports test-level granularity, allowing large test files to be split across shards.

## Problem Statement

Default Playwright sharding (`--shard=N/M`) distributes tests by file count, not by duration. This creates significant imbalance:

| Shard   | Duration | Difference |
|---------|----------|------------|
| Shard 1 | ~31 min  | +182%      |
| Shard 2 | ~15 min  | +36%       |
| Shard 3 | ~22 min  | +100%      |
| Shard 4 | ~11 min  | baseline   |

The CI time is bottlenecked by the slowest shard, wasting runner time.

## Tech Stack

- **Runtime**: Bun 1.3.6
- **Language**: TypeScript 5.9.3 (ESM)
- **CLI Framework**: oclif 4.8.0
- **Linter/Formatter**: Biome 2.3.11
- **Test Framework**: Bun test
- **Version Manager**: mise with `.tool-versions`

## Project Conventions

### Code Style

- Use Biome for linting and formatting
- ESM modules (`.js` extensions in imports)
- Strict TypeScript (`strict: true`)

### Architecture Patterns

- **Storage-Agnostic**: Core works with files only. Cache/S3/local is user's choice.
- **CLI-First**: All functionality exposed via CLI commands
- **Graceful Fallback**: If orchestrator fails, fallback to native `--shard`

### Testing Strategy

- Unit tests with `bun test`
- Integration tests with example project
- Local E2E testing with Act (GitHub Actions runner)

### Git Workflow

- Commit OpenSpec changes directly to `main`
- Feature work via PRs with CI checks (lint, typecheck, test)
- Conventional commits: `feat:`, `fix:`, `chore:`, `docs:`

## Domain Context

### Key Concepts

- **Shard**: A parallel CI job running a subset of tests
- **Timing Data**: Historical test durations stored in JSON
- **EMA (Exponential Moving Average)**: Smoothing algorithm for timing data (alpha=0.3)
- **CKK Algorithm**: Complete Karmarkar-Karp for optimal bin packing
- **LPT Algorithm**: Longest Processing Time First (fallback)
- **Grep Pattern**: Regex pattern for Playwright `--grep` flag

### Test ID Format

Tests are identified as: `{file}::{describe}::{testTitle}`

Example: `betslip.spec.ts::BetSlip::should create a single bet`

## Important Constraints

- All dependency versions must be pinned (no `latest`)
- GitHub Actions runner pinned to `ubuntu-24.04` (not `ubuntu-latest`)
- Must work locally without GitHub (storage-agnostic)
- Must support Act for local CI testing

## Post-Implementation Checklist

After completing any feature, fix, or breaking change, ALWAYS perform these steps before considering the work done:

1. **Changeset**: Run `bunx changeset add --empty` to scaffold the changeset file (never create the file manually). Then edit the generated file to set the appropriate bump type (`patch`, `minor`, or `major`) and add a summary of the change. This is REQUIRED for any code change that affects the published package.
2. **README / Docs**: Update `README.md` if the change adds, modifies, or removes CLI flags, configuration options, public API, or usage patterns. Keep docs in sync with the code.
3. **OpenSpec**: If the change was driven by a proposal in `openspec/changes/`, update `tasks.md` to mark completed items. After deployment, archive the change per the OpenSpec workflow.

Never skip these steps. If unsure whether a changeset is needed, create one -- it's easier to remove than to forget.

## External Dependencies

- **Playwright**: Test framework (user's dependency, not ours)
- **GitHub Actions**: Primary CI environment
- **Act**: Local GitHub Actions runner for testing
