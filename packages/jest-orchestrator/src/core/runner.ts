import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { verifyShardRun } from "./assign.js";
import { formatDuration } from "./format-duration.js";
import type { JestJsonReport, ShardPlan } from "./types.js";
import { splitJestArgs } from "./types.js";

/**
 * Shard execution via the exact-selection shim.
 *
 * The shard's (file, fullName) allowlist is written to a temp manifest,
 * passed to jest through the JEST_ORCHESTRATOR_SELECTION env var, and
 * consumed by the selection shim loaded through setupFilesAfterEnv.
 * The shim marks non-allowlisted tests as 'skip' BEFORE execution —
 * no regex patterns anywhere.
 *
 * After each batch we verify executed == expected in both directions.
 */

export interface RunShardOptions {
  root: string;
  plan: Pick<ShardPlan, "files" | "selection" | "shard">;
  jestArgs?: string[];
  jestBin?: string;
  timeoutMs?: number;
  /** Max files per jest invocation (argv-limit guard) */
  batchSize?: number;
}

export interface ShardRunResult {
  shard: number;
  ok: boolean;
  problems: string[];
  /** Extracted measurements for the timing store */
  measurements: Array<{ file: string; fullName: string; duration: number }>;
  report?: JestJsonReport;
}

const DEFAULT_BATCH_SIZE = 400;

export class ShardRunError extends Error {
  constructor(
    message: string,
    readonly stderrTail: string,
  ) {
    super(message);
    this.name = "ShardRunError";
  }
}

/**
 * Resolve the selection shim shipped with this package. The shim is a
 * plain .js file copied to dist by the build, living next to core/ in dist.
 */
export function selectionShimPath(): string {
  return path.join(path.dirname(new URL(import.meta.url).pathname), "..", "selection-shim.js");
}

/**
 * Execute a shard and verify coverage. Throws ShardRunError on jest
 * infrastructure failures; test failures are NOT errors — they surface
 * in the report and verification problems.
 */
export async function runShard(opts: RunShardOptions): Promise<ShardRunResult> {
  const { shard, files, selection } = opts.plan;
  const batches = chunk(
    files.map((f) => path.resolve(opts.root, f)),
    opts.batchSize ?? DEFAULT_BATCH_SIZE,
  );
  const measurements: ShardRunResult["measurements"] = [];
  const problems: string[] = [];
  let mergedReport: JestJsonReport | undefined;

  const shimPath = selectionShimPath();
  // Files arrive in the plan as jest reported them (on Windows:
  // forward slashes from our normalization); resolve each to the
  // native form once and use it everywhere comparisons are made —
  // --runTestsByPath args, the shim allowlist, and verification.
  const resolveNative = (f: string) => path.resolve(opts.root, f);
  const manifest = {
    selection: selection.map((s) => ({
      file: resolveNative(s.file),
      fullName: s.fullName,
    })),
  };
  const manifestDir = fs.mkdtempSync(path.join(os.tmpdir(), "jest-orchestrator-"));
  const manifestPath = path.join(manifestDir, "selection.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));
  try {
    for (const batch of batches) {
      const args = [
        ...splitJestArgs(opts.jestArgs ?? []),
        "--setupFilesAfterEnv",
        shimPath,
        "--runTestsByPath",
        ...batch,
        // Assertion locations power `annotate` file/line annotations.
        "--testLocationInResults",
        "--json",
      ];
      const { code, stdout, stderr } = await spawnJestCapture(opts.root, args, {
        jestBin: opts.jestBin,
        timeoutMs: opts.timeoutMs ?? 30 * 60 * 1000,
        selectionManifestPath: manifestPath,
        shimPath,
      });
      if (code !== 0 && code !== 1) {
        throw new ShardRunError(
          `shard ${shard}: jest exited with code ${code}\n${tail(stderr, 2000)}`,
          tail(stderr, 2000),
        );
      }
      let report: JestJsonReport;
      try {
        report = JSON.parse(stdout) as JestJsonReport;
      } catch {
        throw new ShardRunError(
          `shard ${shard}: jest did not emit valid JSON\n${tail(stderr, 2000)}`,
          tail(stderr, 2000),
        );
      }
      mergedReport = mergedReport
        ? {
            // Sum the aggregate counters and concatenate suites so the
            // report covers EVERY batch, not just the last one (annotate
            // and the E2E merge step read this report).
            numTotalTests: mergedReport.numTotalTests + report.numTotalTests,
            numPassedTests: mergedReport.numPassedTests + report.numPassedTests,
            numFailedTests: mergedReport.numFailedTests + report.numFailedTests,
            numPendingTests: mergedReport.numPendingTests + report.numPendingTests,
            numTodoTests: mergedReport.numTodoTests + report.numTodoTests,
            success: mergedReport.success && report.success,
            testResults: [...mergedReport.testResults, ...report.testResults],
          }
        : report;

      const executed: Array<{ file: string; fullName: string }> = [];
      for (const suite of report.testResults) {
        for (const a of suite.assertionResults) {
          if (a.status === "passed" || a.status === "failed") {
            measurements.push({
              file: suite.name,
              fullName: a.fullName,
              duration: a.duration ?? 0,
            });
            executed.push({ file: suite.name, fullName: a.fullName });
          }
        }
      }
      // Static skips/todos are in the selection (discovery sees them)
      // but never execute: circus reports them 'pending'/'todo'. They
      // are verified by presence in the report, not by measurement.
      const expectedAll = manifest.selection.filter((s) => batch.includes(s.file));
      const skipped = new Set(
        report.testResults.flatMap((s) =>
          s.assertionResults
            .filter((a) => a.status === "pending" || a.status === "todo")
            .map((a) => `${s.name}::${a.fullName}`),
        ),
      );
      const expectedExecutable = expectedAll.filter(
        (s) => !skipped.has(`${s.file}::${s.fullName}`),
      );
      problems.push(
        ...verifyShardRun({
          expected: expectedExecutable,
          executed,
          shard,
        }),
      );
    }
  } finally {
    fs.rmSync(path.dirname(manifestPath), { recursive: true, force: true });
  }

  return {
    shard,
    ok: problems.length === 0,
    measurements,
    problems,
    report: mergedReport,
  };
}

function chunk<T>(arr: T[], size: number): T[][] {
  if (arr.length === 0) return [];
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function tail(s: string, n: number): string {
  return s.length <= n ? s : `...${s.slice(-n)}`;
}

function spawnJestCapture(
  cwd: string,
  args: string[],
  opts: {
    jestBin?: string;
    timeoutMs: number;
    selectionManifestPath: string;
    shimPath: string;
  },
): Promise<{ code: number; stdout: string; stderr: string }> {
  const { promise, resolve, reject } = Promise.withResolvers<{
    code: number;
    stdout: string;
    stderr: string;
  }>();
  const bin = opts.jestBin ?? resolveJestBinFrom(cwd);
  const child = spawn(bin, args, {
    cwd,
    env: {
      ...process.env,
      JEST_ORCHESTRATOR_SELECTION: opts.selectionManifestPath,
      JEST_ORCHESTRATOR_SHIM: opts.shimPath,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  const timer = setTimeout(() => {
    child.kill("SIGKILL");
    reject(new ShardRunError(`shard run timed out after ${formatDuration(opts.timeoutMs)}`, ""));
  }, opts.timeoutMs);
  child.stdout.on("data", (d: Buffer) => {
    stdout += d.toString();
  });
  child.stderr.on("data", (d: Buffer) => {
    stderr += d.toString();
  });
  child.on("error", (err) => {
    clearTimeout(timer);
    reject(err);
  });
  child.on("close", (code) => {
    clearTimeout(timer);
    resolve({ code: code ?? -1, stdout, stderr });
  });
  return promise;
}

function resolveJestBinFrom(cwd: string): string {
  const local = path.join(cwd, "node_modules", ".bin", "jest");
  if (fs.existsSync(local)) return local;
  return "jest";
}
