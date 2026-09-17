import * as fs from "node:fs";
import { Command, Flags } from "@oclif/core";
import {
  emptyTimingData,
  identityKey,
  loadTimingDataFile,
  mergeTimingData,
  pruneTimingData,
  type ShardTimingArtifact,
  saveTimingDataFile,
  type TimingData,
} from "../core/index.js";

export default class MergeTiming extends Command {
  static override description =
    "Merge per-shard timing artifacts into the store using EMA; optionally prune stale entries";

  static override examples = [
    "<%= config.bin %> merge-timing --existing jest-timings.json --new shard-1-timing.json shard-2-timing.json --output jest-timings.json",
    "<%= config.bin %> merge-timing --new shard-1-timing.json --output jest-timings.json --prune-manifest tests.json",
  ];

  static override flags = {
    existing: Flags.string({
      char: "e",
      description: "Path to existing timing store JSON (optional)",
    }),
    new: Flags.string({
      char: "n",
      description: "Paths to new timing artifact files",
      multiple: true,
      required: true,
    }),
    output: Flags.string({
      char: "o",
      description: "Path to write merged timing store",
      required: true,
    }),
    alpha: Flags.string({
      description: "EMA smoothing factor (0-1)",
      default: "0.3",
    }),
    "prune-manifest": Flags.string({
      description: "Discovery manifest; entries absent from it are pruned",
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(MergeTiming);
    const alpha = Number.parseFloat(flags.alpha);
    if (!Number.isFinite(alpha) || alpha <= 0 || alpha > 1) {
      this.error(`invalid alpha: ${flags.alpha}`);
    }

    const existing: TimingData = flags.existing
      ? loadTimingDataFile(flags.existing)
      : emptyTimingData();

    const artifacts: ShardTimingArtifact[] = flags.new.map((f) =>
      JSON.parse(fs.readFileSync(f, "utf8")),
    );

    let merged = mergeTimingData(existing, artifacts, alpha);

    if (flags["prune-manifest"]) {
      const manifest = JSON.parse(fs.readFileSync(flags["prune-manifest"], "utf8")) as {
        tests: Array<{ project: string; file: string; fullName: string }>;
      };
      const currentKeys = new Set(
        manifest.tests.map((t) =>
          identityKey({
            project: t.project,
            file: t.file,
            fullName: t.fullName,
          }),
        ),
      );
      merged = pruneTimingData(merged, currentKeys);
    }

    saveTimingDataFile(flags.output, merged);
    const total = Object.values(merged.projects).reduce(
      (s, p) => s + Object.keys(p.files).length,
      0,
    );
    this.log(`Merged ${artifacts.length} artifacts (${total} entries) -> ${flags.output}`);
  }
}
