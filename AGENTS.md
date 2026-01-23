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

## Important Files

| File | Purpose |
|------|---------|
| `openspec/project.md` | Project conventions |
| `openspec/changes/` | Active change proposals |
| `biome.json` | Linter config |
| `tsconfig.json` | TypeScript config |
| `Makefile` | Common commands |
