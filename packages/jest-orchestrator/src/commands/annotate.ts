import * as fs from "node:fs";
import { Command, Flags } from "@oclif/core";
import type { AssignResult, JestJsonReport } from "../core/types.js";

/**
 * Convert a Jest JSON report into GitHub Actions annotations
 * (::error file=... line=... messages) and a job summary table.
 *
 * Mirrors what the Playwright 'github' reporter and
 * @estruyf/github-actions-reporter provide for Playwright, using the
 * report jest already produced (run-shard --report-output).
 */

interface FailureFrame {
  file: string;
  line: number;
}

/** Best stack frame inside the test file (falls back to any frame). */
function bestFrame(testFile: string, messages: string[]): FailureFrame | null {
  const frames: FailureFrame[] = [];
  const re = /\(([^:()]+\.spec\.[tj]sx?):(\d+):(\d+)\)/;
  for (const msg of messages) {
    for (const line of msg.split("\n")) {
      const m = re.exec(line);
      if (m?.[1] && m[2]) {
        frames.push({ file: m[1], line: Number(m[2]) });
      }
    }
  }
  if (frames.length === 0) return null;
  const inFile = frames.find((f) => f.file.endsWith(testFile) || testFile.endsWith(f.file));
  return inFile ?? frames[0] ?? null;
}

function firstMessage(messages: string[]): string {
  const raw = messages[0] ?? "test failed";
  const first = raw.split("\n")[0] ?? raw;
  return first.slice(0, 300);
}

/**
 * GitHub annotations are single-line; CR/LF would break the directive.
 * Pipes are escaped because raw `|` splits markdown table cells even
 * inside backticks.
 */
function sanitize(text: string): string {
  return text.replaceAll(/[\r\n]+/g, " ").replaceAll("|", "\\|");
}

function selectionKey(file: string, fullName: string): string {
  return JSON.stringify([file.replaceAll("\\", "/"), fullName]);
}

export function selectedTestsForShard(assignment: AssignResult, shard: number): Set<string> {
  const plan = assignment.shards.find((candidate) => candidate.shard === shard);
  if (!plan) {
    throw new Error(
      `shard ${shard} is not present in assignment (have: ${assignment.shards.map((s) => s.shard).join(", ")})`,
    );
  }
  return new Set(plan.selection.map((test) => selectionKey(test.file, test.fullName)));
}

export function summarizeJestReport(
  report: JestJsonReport,
  selected?: ReadonlySet<string>,
): {
  passed: number;
  failed: number;
  skipped: number;
  notSelected: number;
} {
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  let notSelected = 0;
  for (const suite of report.testResults) {
    for (const assertion of suite.assertionResults) {
      if (assertion.status === "passed") {
        passed++;
      } else if (assertion.status === "pending" || assertion.status === "todo") {
        if (selected && !selected.has(selectionKey(suite.name, assertion.fullName))) {
          notSelected++;
        } else {
          skipped++;
        }
      } else {
        failed++;
      }
    }
  }
  return { passed, failed, skipped, notSelected };
}

export default class Annotate extends Command {
  static override description =
    "Convert a Jest JSON report into GitHub Actions annotations and a job summary (run-shard --report-output file)";

  static override examples = [
    "<%= config.bin %> annotate --report report-shard-1.json --summary-append summary.md",
  ];

  static override flags = {
    report: Flags.string({
      description: "Path to the Jest JSON report",
      required: true,
    }),
    "summary-append": Flags.string({
      description: "Append a markdown summary table to this file (use $GITHUB_STEP_SUMMARY)",
    }),
    shard: Flags.string({
      description: "Shard label shown in the summary heading",
    }),
    assignment: Flags.string({
      description: "Assignment JSON used for this shard; classifies filtered tests accurately",
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(Annotate);
    const report = JSON.parse(fs.readFileSync(flags.report, "utf8")) as JestJsonReport;
    if (flags.assignment && flags.shard === undefined) {
      this.error("--shard is required when --assignment is provided");
    }
    const shard = Number(flags.shard);
    if (flags.assignment && (!Number.isInteger(shard) || shard < 1)) {
      this.error("--shard must be a positive integer when --assignment is provided");
    }
    const selected = flags.assignment
      ? selectedTestsForShard(
          JSON.parse(fs.readFileSync(flags.assignment, "utf8")) as AssignResult,
          shard,
        )
      : undefined;
    const { passed, failed, skipped, notSelected } = summarizeJestReport(report, selected);

    const rows: string[] = [];
    for (const suite of report.testResults) {
      const absFile = suite.name;
      for (const a of suite.assertionResults) {
        const isSelected = !selected || selected.has(selectionKey(suite.name, a.fullName));
        if (a.status === "todo") {
          if (isSelected) {
            rows.push(`| ⊘ todo | \`${a.fullName}\` | author-declared todo |`);
          }
          continue;
        }
        if (a.status === "passed" || a.status === "pending") {
          continue;
        }
        const msg = firstMessage(a.failureMessages ?? []);
        // Primary: jest's own location (needs --testLocationInResults,
        // which run-shard always passes). Fallback: best stack frame.
        const line = a.location?.line ?? bestFrame(absFile, a.failureMessages ?? [])?.line;
        if (line) {
          const rel = sanitize(absFile.replace(`${process.cwd()}/`, ""));
          this.log(`::error file=${rel},line=${line}::${sanitize(a.fullName)} — ${sanitize(msg)}`);
        } else {
          this.log(`::error::${sanitize(a.fullName)} — ${sanitize(msg)}`);
        }
        rows.push(`| ❌ | \`${sanitize(a.fullName)}\` | ${sanitize(msg)} |`);
      }
    }

    if (flags["summary-append"]) {
      const total = report.numTotalTests;
      const summary = [
        `### Jest Results (shard ${flags.shard ?? "n/a"})`,
        "",
        `| Result | Test | Message |`,
        `|--------|------|---------|`,
        ...rows,
        "",
        `**${passed} passed**, ${failed} failed, ${skipped} skipped/todo${notSelected > 0 ? `, ${notSelected} not selected` : ""}, ${total} total`,
        "",
      ].join("\n");
      fs.appendFileSync(flags["summary-append"], summary);
    }

    this.log(
      `Annotated: ${passed} passed, ${failed} failed, ${skipped} skipped/todo${notSelected > 0 ? `, ${notSelected} not selected` : ""}`,
    );
  }
}
