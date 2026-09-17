# @nsxbet/jest-orchestrator

Exact per-test Jest distribution across CI shards using historical timing
data.

Unlike file-level sharding, this package selects **individual tests** per
shard via an **exact allowlist** — a jest-circus event-handler shim marks
every test not assigned to the shard as `skip` _before_ execution — and
**verifies after every run** that the executed set exactly equals the
assigned set. No regex patterns anywhere in the selection path, so there
are no substring collisions, no escaping hazards, and no case-sensitivity
surprises (same design principle as Playwright's `--test-list`).

Requires Jest 30+ with jest-circus (Jest's default runner). Jest 29 is
not supported: its circus event handlers are not reachable from
`setupFilesAfterEnv`, so exact selection cannot work there.

## How it works

```text
jest --testNamePattern "(?!x)x" --json      -> per-test inventory (discovery)
  -> orchestrator assign (CKK/LPT over historical per-test durations)
  -> per shard: jest --setupFilesAfterEnv <shim> --runTestsByPath <files>
       shim reads allowlist manifest (env var) and skips non-members
  -> verify executed == assigned (both directions)
  -> extract per-test durations -> merge with EMA -> prune stale entries
```

Key properties:

- **Exact matching**: allowlist membership on `(file, fullName)` pairs built
  with the same name-path algorithm jest-circus itself uses (`getTestID`).
  `should login` and `should login with SSO` are distinct selections; `|`,
  `$`, `^`, `\d`, parentheses and friends in titles are just text.
- **Case-exact**: `Should Login` and `should login` are different tests and
  are selected and verified independently (circus patterns are
  case-insensitive; this approach is not).
- **Focused suites stay correct**: selected tests are forced to `only` mode
  so the suite's own `test.only` cannot disable them; unselected tests are
  skipped. Discovery already reports only focused tests for focused suites,
  so semantics are preserved exactly.
- **Duplicate fullNames** (same name twice in one file) expand to one
  selection entry per occurrence and each is verified as executed.
- **Never-matching discovery** relies on jest-circus reporting every
  registered test as `pending` in the JSON report when the pattern misses.
- **Skipped tests pay no runtime cost**: their bodies, `beforeEach` /
  `afterEach` hooks do not run.

## CLI

```bash
# 1. Discover the per-test inventory
jest-orchestrator discover --root . --output tests.json

# 2. Assign tests to shards using historical timings (optional)
jest-orchestrator assign --manifest tests.json --timings jest-timings.json \
  --shards 4 --output assignment.json

# 3. Execute each shard (typically in parallel CI jobs)
jest-orchestrator run-shard --root . --assignment assignment.json \
  --shard 1 --output shard-1-timing.json --report-output shard-1-report.json

#    Optional: turn failures into GitHub annotations + job summary
jest-orchestrator annotate --report shard-1-report.json \
  --summary-append "$GITHUB_STEP_SUMMARY"

# 4. Merge timing artifacts (EMA smoothing), pruning deleted tests
jest-orchestrator merge-timing \
  --new shard-1-timing.json shard-2-timing.json \
  --output jest-timings.json --prune-manifest tests.json
```

Assignment granularity: `assign --level file` balances whole files
(atomicity = file, duration = sum of its tests); `--level test`
(default) balances per test.

## Library API

```ts
import { discoverTests, assignShards, runShard, mergeTimingData } from "@nsxbet/jest-orchestrator";
```

Test identity is structured (`{ project, file, fullName }`); string keys are
canonical JSON encoded as base64url (`identityKey`), because fullNames can
contain arbitrary text.

## Fail loudly, never silently

- A test deleted between `assign` and `run-shard` -> exit 2,
  `expected test was NOT executed`.
- A pattern over-matching -> `unexpected test WAS executed`.
- Jest infrastructure failures (exit code other than 0/1, invalid JSON) throw.

## Development

```bash
make install   # bun install
make test      # bun test
make lint      # biome check .
make typecheck # tsc --noEmit
make build     # tsc -b
make lab lab-pipeline   # end-to-end demo against /tmp/jest-lab
```

## Known trade-offs

- The selection shim is loaded through `--setupFilesAfterEnv`; if the user's
  own config also uses `setupFilesAfterEnv`, both run (theirs first). The shim
  is a no-op outside orchestrated runs (no `JEST_ORCHESTRATOR_SELECTION` env
  var).
- Tests with no timing history use a fallback chain: per-test history ->
  same-file average -> global average -> 30s constant
  (`DEFAULT_TEST_DURATION`) until measured.
- Discovery executes file loads (module graph registration); files with
  import-time side effects pay that cost during discovery. Files failing to
  load fail discovery loudly.
- **Jest multi-project configs are not project-aware yet**: identities are
  keyed by (project, file, fullName) but `discover` currently reports
  everything under one project, so the same file in two `displayName`
  projects shares timing data. Test execution and coverage verification
  remain correct; only duration balancing is coarser.
