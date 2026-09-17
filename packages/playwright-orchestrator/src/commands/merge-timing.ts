import * as fs from 'node:fs';
import * as path from 'node:path';
import { Command, Flags } from '@oclif/core';
import {
  DEFAULT_EMA_ALPHA,
  DEFAULT_PRUNE_DAYS,
  loadTimingData,
  mergeTimingData,
  pruneTimingData,
  type ShardTimingArtifact,
  saveTimingData,
  type TimingData,
} from '../core/index.js';

export default class MergeTiming extends Command {
  static override description =
    'Merge timing data from multiple shards using Exponential Moving Average';

  static override examples = [
    '<%= config.bin %> merge-timing --existing ./timing.json --new ./shard-1.json ./shard-2.json --output ./timing.json',
    '<%= config.bin %> merge-timing --new ./shard-*.json --output ./timing.json --alpha 0.3 --prune-days 30',
  ];

  static override flags = {
    existing: Flags.string({
      char: 'e',
      description: 'Path to existing timing data JSON (optional)',
    }),
    new: Flags.string({
      char: 'n',
      description: 'Paths to new timing artifact files',
      multiple: true,
      required: true,
    }),
    output: Flags.string({
      char: 'o',
      description: 'Path to write merged timing data',
      required: true,
    }),
    alpha: Flags.string({
      char: 'a',
      description: 'EMA smoothing factor (0-1)',
      default: String(DEFAULT_EMA_ALPHA),
    }),
    'prune-days': Flags.integer({
      description: 'Remove entries older than N days',
      default: DEFAULT_PRUNE_DAYS,
    }),
    'current-tests': Flags.string({
      description:
        'Path to file listing current test IDs (for pruning deleted tests)',
    }),
    verbose: Flags.boolean({
      char: 'v',
      description: 'Show verbose output',
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(MergeTiming);

    const alpha = Number.parseFloat(flags.alpha);
    if (Number.isNaN(alpha) || alpha < 0 || alpha > 1) {
      this.error('Alpha must be a number between 0 and 1');
    }

    // Load existing timing data
    let existingData: TimingData | null = null;
    if (flags.existing) {
      existingData = loadTimingData(flags.existing);
    }

    if (flags.verbose) {
      const testCount = existingData
        ? Object.keys(existingData.tests).length
        : 0;
      this.log(`Loaded existing timing data with ${testCount} tests`);
    }

    // Load new timing artifacts
    const newArtifacts: ShardTimingArtifact[] = [];

    for (const artifactPath of flags.new) {
      try {
        const content = fs.readFileSync(path.resolve(artifactPath), 'utf-8');
        const artifact = JSON.parse(content) as ShardTimingArtifact;

        if (artifact.tests) {
          newArtifacts.push(artifact);
          if (flags.verbose) {
            this.log(
              `Loaded timing artifact from shard ${artifact.shard} with ${Object.keys(artifact.tests).length} tests`,
            );
          }
        } else if (flags.verbose) {
          this.warn(`Artifact ${artifactPath} has no tests, skipping`);
        }
      } catch {
        this.warn(`Failed to load timing artifact: ${artifactPath}`);
      }
    }

    if (newArtifacts.length === 0) {
      this.warn('No valid timing artifacts found');
      return;
    }

    // Merge timing data using EMA
    let mergedData = mergeTimingData(existingData, newArtifacts, alpha);

    if (flags.verbose) {
      this.log(
        `Merged timing data now has ${Object.keys(mergedData.tests).length} tests`,
      );
    }

    // Load current test IDs for pruning if provided
    let currentTestIds: string[] | undefined;
    if (flags['current-tests']) {
      try {
        const content = fs.readFileSync(flags['current-tests'], 'utf-8');
        currentTestIds = content.split('\n').filter((line) => line.trim());
      } catch {
        this.warn(
          `Failed to load current test IDs list: ${flags['current-tests']}`,
        );
      }
    }

    // Prune old entries
    const beforePrune = Object.keys(mergedData.tests).length;
    mergedData = pruneTimingData(
      mergedData,
      flags['prune-days'],
      currentTestIds,
    );
    const afterPrune = Object.keys(mergedData.tests).length;

    if (flags.verbose && beforePrune !== afterPrune) {
      this.log(`Pruned ${beforePrune - afterPrune} old entries`);
    }

    // Save merged data
    saveTimingData(flags.output, mergedData);

    if (flags.verbose) {
      this.log(`Saved merged timing data to ${flags.output}`);
    }

    // Output summary
    this.log(
      JSON.stringify({
        tests: Object.keys(mergedData.tests).length,
        updatedAt: mergedData.updatedAt,
        version: mergedData.version,
      }),
    );
  }
}
