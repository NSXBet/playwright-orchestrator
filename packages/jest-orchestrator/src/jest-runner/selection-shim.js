/**
 * Jest selection shim: exact per-test selection without regex patterns.
 *
 * Loaded via `setupFilesAfterEnv` (once per test file). Reads the
 * selection manifest from `JEST_ORCHESTRATOR_SELECTION` (path to a JSON
 * file, avoiding argv limits), registers a circus event handler through
 * the public `Symbol.for('EVENT_HANDLERS')` registry, and at `run_start`
 * marks every registered test not in the shard's allowlist as `skip`.
 *
 * Selection is exact: allowlist membership on (file, fullName) pairs.
 * No regex matching, no substring collisions, no case-insensitivity
 * surprises. Unselected tests are skipped before their bodies, their
 * beforeEach/afterEach, and (when a whole describe is skipped) beforeAll
 * hooks run — mirroring Playwright's --test-list semantics.
 *
 * This file runs inside Jest's transpiled CJS context (no ESM).
 */
/* eslint-disable */
// biome-ignore-all lint: loaded by jest, must stay CJS with loose requires

const fs = require('fs');

const SELECTION_ENV = 'JEST_ORCHESTRATOR_SELECTION';

/**
 * @param {string | undefined} manifestPath
 * @returns {Map<string, Set<string>>} file path -> set of fullNames
 */
function loadSelection(manifestPath) {
  const selection = new Map();
  if (!manifestPath) return selection;
  const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  for (const entry of raw.selection) {
    let set = selection.get(entry.file);
    if (!set) {
      set = new Set();
      selection.set(entry.file, set);
    }
    set.add(entry.fullName);
  }
  return selection;
}

function register() {
  const manifestPath = process.env[SELECTION_ENV];
  if (!manifestPath) return; // not an orchestrated run: no-op
  let selection;
  try {
    selection = loadSelection(manifestPath);
  } catch (err) {
    // Fail loudly: a broken manifest must not silently run everything.
    throw new Error(
      `jest-orchestrator: failed to read selection manifest at ${manifestPath}: ${err && err.message}`,
    );
  }

  let thisFile = null;
  try {
    thisFile = expect.getState().testPath;
  } catch {
    // fall through; handled below
  }

  const allowed = thisFile ? selection.get(thisFile) : undefined;

  // jest 30+: handlers live in the public Symbol.for('EVENT_HANDLERS')
  // registry, shared with the circus runner through globalThis. The
  // jest 29 addEventHandler fallback does NOT work: setupFilesAfterEnv
  // runs in a sandboxed module registry, so its handlers array is not
  // the runner's (verified empirically: unselected tests execute and
  // verification fails). Jest 29 is therefore unsupported — fail fast.
  const handlers = globalThis[Symbol.for('EVENT_HANDLERS')];
  if (!Array.isArray(handlers)) {
    throw new Error(
      'jest-orchestrator: Symbol.for("EVENT_HANDLERS") registry not found. ' +
        'jest-orchestrator requires Jest 30+ with jest-circus (the default runner).',
    );
  }
  const addHandler = (fn) => {
    handlers.push(fn);
  };

  addHandler(function orchestratorSelection(event, state) {
    if (event.name !== 'run_start' || !state || !state.rootDescribeBlock) {
      return;
    }
    // Without an orchestrator selection for THIS file, every test must
    // run as-is (e.g. user's own --testNamePattern run inside our env).
    // With a selection: selected tests are forced to mode 'only' so the
    // suite's own test.only / describe.only focus cannot disable them
    // (circus skips mode-undefined tests when hasFocusedTests), and
    // unselected tests are skipped. If the suite itself has focused
    // tests, the discovery manifest contains ONLY the focused ones, so
    // forcing 'only' preserves exactly what discovery reported.
    const walk = (block) => {
      for (const child of block.children) {
        if (child.type === 'test') {
          if (!allowed) continue;
          // Same algorithm as jest-circus getTestID: name path minus the
          // root block, joined by single spaces.
          const names = [];
          let p = child;
          while (p) {
            names.unshift(p.name);
            p = p.parent;
          }
          names.shift();
          const fullName = names.join(' ');
          // Preserve author-declared semantics: a test.skip / test.todo
          // that IS selected keeps its original mode (it must not be
          // resurrected by force-'only'). Only mode-less tests get the
          // only/skip decision.
          child.mode =
            child.mode === 'skip' || child.mode === 'todo'
              ? child.mode
              : allowed.has(fullName)
                ? 'only'
                : 'skip';
        } else {
          walk(child);
        }
      }
    };
    walk(state.rootDescribeBlock);
  });
}

register();
