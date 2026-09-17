import * as fs from "node:fs";
import { Command, Flags } from "@oclif/core";
import { type DiscoveredTest, type DiscoveryResult, discoverTests } from "../core/index.js";

export default class Discover extends Command {
  static override description =
    "Discover all registered Jest tests (per-test inventory, includes skips and todos)";

  static override examples = [
    "<%= config.bin %> discover --root . --output tests.json",
    '<%= config.bin %> discover --root . --jest-args "--config jest.config.ts" --output tests.json',
  ];

  static override flags = {
    root: Flags.string({
      description: "Project root (jest spawn cwd)",
      required: true,
    }),
    "jest-args": Flags.string({
      description: "Extra args passed to jest (repeatable or space-split)",
      multiple: true,
    }),
    output: Flags.string({
      char: "o",
      description: "Output JSON path",
      required: true,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(Discover);
    const jestArgs = flags["jest-args"] ?? [];
    const result: DiscoveryResult = await discoverTests({
      root: flags.root,
      jestArgs,
    });
    const payload = {
      discoveredAt: new Date().toISOString(),
      root: flags.root,
      tests: result.tests,
    };
    fs.writeFileSync(flags.output, `${JSON.stringify(payload, null, 2)}\n`);
    this.log(`Discovered ${result.tests.length} tests -> ${flags.output}`);
  }
}

export interface DiscoveredManifest {
  discoveredAt: string;
  root: string;
  tests: DiscoveredTest[];
}

export function loadManifest(file: string): DiscoveredManifest {
  const raw = fs.readFileSync(file, "utf8");
  return JSON.parse(raw) as DiscoveredManifest;
}
