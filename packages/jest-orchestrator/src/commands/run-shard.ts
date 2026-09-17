import * as fs from "node:fs";
import { Command, Flags } from "@oclif/core";
import {
  type AssignResult,
  DEFAULT_PROJECT_NAME,
  runShard,
  type ShardRunResult,
} from "../core/index.js";

export default class RunShard extends Command {
  static override description =
    "Run one shard: executes exactly its assigned tests via the selection shim (no regex patterns), verifies exact coverage, and writes a timing artifact";

  static override examples = [
    "<%= config.bin %> run-shard --root . --assignment assignment.json --shard 1 --output shard-1-timing.json",
  ];

  static override flags = {
    root: Flags.string({
      description: "Project root (jest spawn cwd)",
      required: true,
    }),
    assignment: Flags.string({
      description: "Path to assignment JSON (from `assign`)",
      required: true,
    }),
    shard: Flags.integer({
      description: "Shard number to execute (1-based)",
      required: true,
    }),
    "jest-args": Flags.string({
      description: "Extra args passed to jest",
      multiple: true,
    }),
    output: Flags.string({
      char: "o",
      description: "Output timing artifact JSON path",
      required: true,
    }),
    "report-output": Flags.string({
      description: "Optionally write the raw jest JSON report here",
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(RunShard);
    const assignment = JSON.parse(fs.readFileSync(flags.assignment, "utf8")) as AssignResult;
    if (!Array.isArray(assignment.shards)) {
      this.error(
        `assignment file ${flags.assignment} has no 'shards' array — is it the output of 'assign'?`,
      );
    }
    const plan = assignment.shards.find((s) => s.shard === flags.shard);
    if (!plan) {
      this.error(
        `shard ${flags.shard} not found in assignment (have: ${assignment.shards.map((s) => s.shard).join(", ")})`,
      );
    }

    const result: ShardRunResult = await runShard({
      root: flags.root,
      plan,
      jestArgs: flags["jest-args"] ?? [],
    });

    if (flags["report-output"] && result.report) {
      fs.writeFileSync(flags["report-output"], `${JSON.stringify(result.report, null, 2)}\n`);
    }

    const artifact = {
      project: DEFAULT_PROJECT_NAME,
      shard: plan.shard,
      measurements: result.measurements,
    };
    fs.writeFileSync(flags.output, `${JSON.stringify(artifact, null, 2)}\n`);

    if (!result.ok) {
      for (const p of result.problems) this.error(p);
    }
    this.log(
      `shard ${plan.shard}: ${result.measurements.length} tests executed and verified -> ${flags.output}`,
    );
  }
}
