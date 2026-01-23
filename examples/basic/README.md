# Playwright Orchestrator Example

This is a minimal Playwright project for testing the orchestrator's test distribution capabilities.

## Test Structure

The tests have predictable, controlled durations:

| File | Tests | Total Duration |
|------|-------|----------------|
| `short.spec.ts` | 4 tests | ~1 minute |
| `medium.spec.ts` | 4 tests | ~2 minutes |
| `long.spec.ts` | 3 tests | ~3 minutes |
| `extra-long.spec.ts` | 3 tests | ~5 minutes |

**Total: 14 tests, ~11 minutes**

## Usage

### Install dependencies

```bash
cd examples/basic
npm install
npx playwright install chromium
```

### Run all tests

```bash
npm test
```

### List tests (for orchestrator discovery)

```bash
npm run test:list
```

### Run with orchestrator (from project root)

```bash
# Build the orchestrator
bun run build

# Assign tests to shards
./bin/run.js assign --test-dir ./examples/basic/tests --shards 3 --level test

# Run specific shard with grep
npx playwright test --grep "pattern-from-assign"
```

## Expected Optimal Distribution (3 shards)

With optimal distribution across 3 shards, each shard should have ~3.7 minutes of tests.

Example optimal assignment:
- **Shard 1**: extra-long test 2 (120s) + quick test 4 (15s) = ~135s (~2.25min)
- **Shard 2**: extra-long test 1 (90s) + medium test 2 (45s) = ~135s (~2.25min)
- **Shard 3**: extra-long test 3 (90s) + medium test 1 (30s) + quick test 1 (10s) = ~130s (~2.17min)

(Actual distribution may vary based on algorithm optimization)
