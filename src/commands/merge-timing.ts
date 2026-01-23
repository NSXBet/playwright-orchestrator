import * as fs from 'node:fs';
import * as path from 'node:path';
import { Command, Flags } from '@oclif/core';
import {
  DEFAULT_EMA_ALPHA,
  DEFAULT_PRUNE_DAYS,
  isTimingDataV2,
  loadTimingData,
  mergeTestTimingData,
  mergeTimingData,
  pruneTestTimingData,
  pruneTimingData,
  type ShardTimingArtifact,
  saveTimingData,
  type TestShardTimingArtifact,
  type TimingDataV2,
} from '../core/index.js';

export default class MergeTiming extends Command {
  static override description =
    'Merge timing data from multiple shards using Exponential Moving Average';

  static override examples = [
    '<%= config.bin %> merge-timing --existing ./timing.json --new ./shard-1.json ./shard-2.json --output ./timing.json',
    '<%= config.bin %> merge-timing --new ./shard-*.json --output ./timing.json --alpha 0.3 --prune-days 30',
    '<%= config.bin %> merge-timing --new ./shard-*.json --output ./timing.json --level test',
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
    'current-files': Flags.string({
      description:
        'Path to file listing current test files/IDs (for pruning deleted tests)',
    }),
    level: Flags.string({
      char: 'l',
      description: 'Data level: file or test',
      default: 'test',
      options: ['file', 'test'],
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

    if (flags.level === 'test') {
      await this.runTestLevel(flags, alpha);
    } else {
      await this.runFileLevel(flags, alpha);
    }
  }

  private async runTestLevel(
    flags: {
      existing?: string;
      new: string[];
      output: string;
      'prune-days': number;
      'current-files'?: string;
      verbose: boolean;
    },
    alpha: number,
  ): Promise<void> {
    // Load existing timing data
    let existingData: TimingDataV2 | null = null;
    if (flags.existing) {
      const loaded = loadTimingData(flags.existing);
      if (isTimingDataV2(loaded)) {
        existingData = loaded;
      } else if (flags.verbose) {
        this.warn(
          'Existing timing data is v1 (file-level), starting fresh for test-level',
        );
      }
    }

    if (flags.verbose) {
      const testCount = existingData
        ? Object.keys(existingData.tests).length
        : 0;
      this.log(`Loaded existing timing data with ${testCount} tests`);
    }

    // Load new timing artifacts
    const newArtifacts: TestShardTimingArtifact[] = [];

    for (const artifactPath of flags.new) {
      try {
        const content = fs.readFileSync(path.resolve(artifactPath), 'utf-8');
        const artifact = JSON.parse(content) as TestShardTimingArtifact;

        // Check if it has tests (v2) or files (v1)
        if (artifact.tests) {
          newArtifacts.push(artifact);
          if (flags.verbose) {
            this.log(
              `Loaded timing artifact from shard ${artifact.shard} with ${Object.keys(artifact.tests).length} tests`,
            );
          }
        } else if (flags.verbose) {
          this.warn(
            `Artifact ${artifactPath} is file-level, skipping for test-level merge`,
          );
        }
      } catch {
        this.warn(`Failed to load timing artifact: ${artifactPath}`);
      }
    }

    if (newArtifacts.length === 0) {
      this.warn('No valid test-level timing artifacts found');
      return;
    }

    // Merge timing data using EMA
    let mergedData = mergeTestTimingData(existingData, newArtifacts, alpha);

    if (flags.verbose) {
      this.log(
        `Merged timing data now has ${Object.keys(mergedData.tests).length} tests`,
      );
    }

    // Load current test IDs for pruning if provided
    let currentTestIds: string[] | undefined;
    if (flags['current-files']) {
      try {
        const content = fs.readFileSync(flags['current-files'], 'utf-8');
        currentTestIds = content.split('\n').filter((line) => line.trim());
      } catch {
        this.warn(
          `Failed to load current test IDs list: ${flags['current-files']}`,
        );
      }
    }

    // Prune old entries
    const beforePrune = Object.keys(mergedData.tests).length;
    mergedData = pruneTestTimingData(
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

  private async runFileLevel(
    flags: {
      existing?: string;
      new: string[];
      output: string;
      'prune-days': number;
      'current-files'?: string;
      verbose: boolean;
    },
    alpha: number,
  ): Promise<void> {
    // Load existing timing data
    const existingData = flags.existing
      ? loadTimingData(flags.existing)
      : { version: 1 as const, updatedAt: new Date().toISOString(), files: {} };

    if (flags.verbose) {
      const fileCount =
        'files' in existingData ? Object.keys(existingData.files).length : 0;
      this.log(`Loaded existing timing data with ${fileCount} files`);
    }

    // Load new timing artifacts
    const newArtifacts: ShardTimingArtifact[] = [];

    for (const artifactPath of flags.new) {
      try {
        const content = fs.readFileSync(path.resolve(artifactPath), 'utf-8');
        const artifact = JSON.parse(content) as ShardTimingArtifact;

        // Check if it has files (v1)
        if (artifact.files) {
          newArtifacts.push(artifact);
          if (flags.verbose) {
            this.log(
              `Loaded timing artifact from shard ${artifact.shard} with ${Object.keys(artifact.files).length} files`,
            );
          }
        } else if (flags.verbose) {
          this.warn(
            `Artifact ${artifactPath} is test-level, skipping for file-level merge`,
          );
        }
      } catch {
        this.warn(`Failed to load timing artifact: ${artifactPath}`);
      }
    }

    if (newArtifacts.length === 0) {
      this.warn('No valid file-level timing artifacts found');
      return;
    }

    // Merge timing data using EMA
    let mergedData = mergeTimingData(existingData, newArtifacts, alpha);

    if (flags.verbose) {
      this.log(
        `Merged timing data now has ${Object.keys(mergedData.files).length} files`,
      );
    }

    // Load current files for pruning if provided
    let currentFiles: string[] | undefined;
    if (flags['current-files']) {
      try {
        const content = fs.readFileSync(flags['current-files'], 'utf-8');
        currentFiles = content.split('\n').filter((line) => line.trim());
      } catch {
        this.warn(
          `Failed to load current files list: ${flags['current-files']}`,
        );
      }
    }

    // Prune old entries
    const beforePrune = Object.keys(mergedData.files).length;
    const prunedData = pruneTimingData(
      mergedData,
      flags['prune-days'],
      currentFiles,
    );
    // pruneTimingData can return v1 or v2, but for file-level we expect v1
    if ('files' in prunedData) {
      mergedData = prunedData as typeof mergedData;
    }
    const afterPrune = Object.keys(mergedData.files).length;

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
        files: Object.keys(mergedData.files).length,
        updatedAt: mergedData.updatedAt,
        version: mergedData.version,
      }),
    );
  }
}
