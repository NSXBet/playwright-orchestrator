import * as fs from 'node:fs';
import { Command, Flags } from '@oclif/core';
import {
  type AssignResult,
  assignShards,
  loadTimingDataFile,
  type TestWithDuration,
} from '../core/index.js';
import { loadManifest } from './discover.js';

export default class Assign extends Command {
  static override description =
    'Assign discovered tests to shards using historical timing data (CKK/LPT balancing)';

  static override examples = [
    '<%= config.bin %> assign --manifest tests.json --shards 4 --output assignment.json',
    '<%= config.bin %> assign --manifest tests.json --timings jest-timings.json --shards 4 --output assignment.json --format text',
  ];

  static override flags = {
    manifest: Flags.string({
      description: 'Path to discovery manifest (from `discover`)',
      required: true,
    }),
    timings: Flags.string({
      description: 'Path to timing store JSON (optional)',
    }),
    shards: Flags.integer({
      char: 's',
      description: 'Number of shards',
      required: true,
    }),
    output: Flags.string({
      char: 'o',
      description: 'Output JSON path',
      required: true,
    }),
    level: Flags.string({
      description: "Assignment granularity: 'test' (default) or 'file'",
      default: 'test',
    }),
    format: Flags.string({
      description: 'Output format: json|text',
      default: 'json',
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(Assign);
    if (flags.level !== 'test' && flags.level !== 'file') {
      this.error(`invalid level: ${flags.level} (use 'test' or 'file')`);
    }
    if (flags.format !== 'json' && flags.format !== 'text') {
      this.error(`invalid format: ${flags.format} (use 'json' or 'text')`);
    }
    const manifest = loadManifest(flags.manifest);
    const timings = flags.timings ? loadTimingDataFile(flags.timings) : null;

    const withDurations: TestWithDuration[] = manifest.tests.map((t) => ({
      project: t.project,
      file: t.file,
      fullName: t.fullName,
      duration: 0,
    }));

    const result: AssignResult = assignShards({
      tests: withDurations,
      timings,
      shards: flags.shards,
      level: flags.level,
    });
    fs.writeFileSync(flags.output, `${JSON.stringify(result, null, 2)}\n`);

    if (flags.format === 'text') {
      for (const shard of result.shards) {
        this.log(
          `shard ${shard.shard}: ${shard.files.length} files, ${shard.testIds.length} tests, expected ${formatMs(shard.expectedDuration)}`,
        );
        for (const f of shard.files) this.log(`  ${f}`);
      }
    }
    this.log(
      `Assigned ${result.totalTests} tests across ${result.shards.length} shards -> ${flags.output}`,
    );
    if (result.unassigned.length > 0) {
      this.error(
        `${result.unassigned.length} tests were not assigned — this is a bug, refusing to continue`,
      );
    }
  }
}

function formatMs(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`;
}
