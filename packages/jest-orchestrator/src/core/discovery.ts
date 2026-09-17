import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import {
  DEFAULT_PROJECT_NAME,
  identityKey,
  type JestJsonReport,
  splitJestArgs,
  type TestIdentity,
  TIMING_DATA_VERSION,
  type TimingData,
} from './types.js';

export interface DiscoveryOptions {
  /** Directory whose jest config should be used (spawn cwd) */
  root: string;
  /** Extra jest CLI flags, e.g. ['--config', 'jest.multi.config.js'] */
  jestArgs?: string[];
  /** Path to jest executable; default resolves from node_modules */
  jestBin?: string;
  /** Hard timeout for the discovery run in ms */
  timeoutMs?: number;
}

export interface DiscoveredTest extends TestIdentity {
  // No static skip flag: a discovery run reports every registered test
  // as 'pending' and cannot distinguish author skips from pattern
  // misses. Runtime status is authoritative at execution time.
}

export interface DiscoveryResult {
  tests: DiscoveredTest[];
  /** Absolute rootDir per project, for path normalization */
  projectRoots: Record<string, string>;
}

export class DiscoveryError extends Error {
  constructor(
    message: string,
    readonly stderrTail: string,
  ) {
    super(message);
    this.name = 'DiscoveryError';
  }
}

/**
 * Discover every registered test in the target project.
 *
 * Runs jest with a never-matching --testNamePattern and --json:
 * jest-circus marks unmatched tests 'pending' but still reports every
 * registered test (skips, todos, dynamic) in the JSON output.
 */
export async function discoverTests(
  opts: DiscoveryOptions,
): Promise<DiscoveryResult> {
  const args = [
    ...splitJestArgs(opts.jestArgs ?? []),
    '--testNamePattern',
    '(?!x)x',
    '--json',
  ];
  const { code, stdout, stderr } = await spawnJestCapture(
    opts.root,
    args,
    opts.jestBin,
    opts.timeoutMs ?? 10 * 60 * 1000,
  );
  if (code !== 0) {
    throw new DiscoveryError(
      `jest discovery run failed with exit code ${code}\n${tail(stderr, 2000)}`,
      tail(stderr, 2000),
    );
  }
  let report: JestJsonReport;
  try {
    report = JSON.parse(stdout) as JestJsonReport;
  } catch {
    throw new DiscoveryError(
      `jest discovery run did not emit valid JSON to stdout\n${tail(stderr, 2000)}`,
      tail(stderr, 2000),
    );
  }
  return parseDiscoveryReport(report);
}

/** Parse a discovery report into identities. */
export function parseDiscoveryReport(
  report: JestJsonReport,
  projectRoots: Record<string, string> = {},
): DiscoveryResult {
  const tests: DiscoveredTest[] = [];
  const roots = { ...projectRoots };
  for (const suite of report.testResults) {
    for (const assertion of suite.assertionResults) {
      const project = DEFAULT_PROJECT_NAME;
      tests.push({
        project,
        file: suite.name.replaceAll('\\', '/'),
        fullName: assertion.fullName,
      });
    }
  }
  return { tests, projectRoots: roots };
}

function tail(s: string, n: number): string {
  return s.length <= n ? s : `...${s.slice(-n)}`;
}

function spawnJestCapture(
  cwd: string,
  args: string[],
  jestBin: string | undefined,
  timeoutMs: number,
): Promise<{ code: number; stdout: string; stderr: string }> {
  const { promise, resolve, reject } = Promise.withResolvers<{
    code: number;
    stdout: string;
    stderr: string;
  }>();
  const bin = jestBin ?? resolveJestBin(cwd);
  const child = spawn(bin, args, {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  const timer = setTimeout(() => {
    child.kill('SIGKILL');
    reject(
      new DiscoveryError(`discovery run timed out after ${timeoutMs}ms`, ''),
    );
  }, timeoutMs);
  child.stdout.on('data', (d: Buffer) => {
    stdout += d.toString();
  });
  child.stderr.on('data', (d: Buffer) => {
    stderr += d.toString();
  });
  child.on('error', (err) => {
    clearTimeout(timer);
    reject(err);
  });
  child.on('close', (code) => {
    clearTimeout(timer);
    resolve({ code: code ?? -1, stdout, stderr });
  });
  return promise;
}

/**
 * Locate the jest CLI binary. Prefers <cwd>/node_modules/.bin/jest,
 * falling back to the package's own jest installation and finally
 * `jest` on PATH. The local candidate is resolved against cwd because
 * spawn() resolves child cwd relative to the parent process, not to
 * `cwd` — a relative bin path would be misinterpreted.
 */
export function resolveJestBin(cwd: string): string {
  const local = path.resolve(cwd, 'node_modules', '.bin', 'jest');
  if (fs.existsSync(local)) return local;
  // Our own dev dependency (jest-cli ships the same CLI).
  try {
    const req = createRequire(import.meta.url);
    const pkgPath = req.resolve('jest-cli/package.json', {
      paths: [path.resolve(cwd), import.meta.url],
    });
    return path.join(path.dirname(pkgPath), 'bin', 'jest.js');
  } catch {
    return 'jest';
  }
}

/** Load timing data from disk (empty store when missing/corrupt). */
export function loadTimingDataFile(file: string): TimingData {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as TimingData;
    return parsed.version === TIMING_DATA_VERSION ? parsed : emptyTimingData();
  } catch {
    return emptyTimingData();
  }
}

export function saveTimingDataFile(file: string, data: TimingData): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

export function emptyTimingData(): TimingData {
  return {
    version: TIMING_DATA_VERSION,
    updatedAt: new Date().toISOString(),
    projects: {},
  };
}

/** Historical duration for a test; undefined when unknown (new test). */
export function getHistoricalDuration(
  timings: TimingData,
  id: TestIdentity,
): number | undefined {
  const duration =
    timings.projects[id.project]?.files[identityKey(id)]?.duration;
  // A corrupt store entry (NaN/Infinity/negative) must not poison the
  // plan; fall through to the estimate chain instead.
  return duration !== undefined && Number.isFinite(duration) && duration >= 0
    ? duration
    : undefined;
}
export function timingKey(id: TestIdentity): string {
  return identityKey(id);
}
