import * as path from 'node:path';
import { Command, Flags } from '@oclif/core';
import {
  assignWithCKK,
  DEFAULT_CKK_TIMEOUT,
  type DiscoveredTest,
  getTestDurations,
  loadTestListFromFile,
  loadTimingData,
  type TestAssignResult,
  type TestWithDuration,
  type TimingData,
} from '../core/index.js';

export default class Assign extends Command {
  static override description =
    'Assign tests to shards based on historical timing data';

  static override examples = [
    '<%= config.bin %> assign --test-list ./test-list.json --shards 4',
    '<%= config.bin %> assign --test-list ./test-list.json --timing-file ./timing.json --shards 4 --output-format json',
  ];

  static override flags = {
    'test-list': Flags.string({
      description:
        'Path to JSON file with test list (from npx playwright test --list --reporter=json)',
      required: true,
    }),
    'timing-file': Flags.string({
      char: 't',
      description: 'Path to timing data JSON file (optional)',
    }),
    shards: Flags.integer({
      char: 's',
      description: 'Number of shards to distribute tests across',
      required: true,
    }),
    project: Flags.string({
      char: 'p',
      description: 'Playwright project name (for multi-project configs)',
    }),
    'output-format': Flags.string({
      char: 'f',
      description: 'Output format',
      default: 'json',
      options: ['json', 'text'],
    }),
    verbose: Flags.boolean({
      char: 'v',
      description: 'Show verbose output',
      default: false,
    }),
    timeout: Flags.integer({
      description: 'CKK algorithm timeout in milliseconds',
      default: DEFAULT_CKK_TIMEOUT,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(Assign);

    const testListPath = path.resolve(flags['test-list']);
    const tests: DiscoveredTest[] = loadTestListFromFile(
      testListPath,
      flags.project,
    );

    if (flags.verbose) {
      this.log(`Loaded ${tests.length} tests from ${testListPath}`);
    }

    if (tests.length === 0) {
      this.warn(`No tests found in ${testListPath}`);
      this.outputResult(
        {
          shards: Object.fromEntries(
            Array.from({ length: flags.shards }, (_, i) => [i + 1, []]),
          ),
          expectedDurations: Object.fromEntries(
            Array.from({ length: flags.shards }, (_, i) => [i + 1, 0]),
          ),
          totalTests: 0,
          estimatedTests: [],
          isOptimal: true,
        },
        flags['output-format'],
      );
      return;
    }

    let timingData: TimingData | null = null;
    if (flags['timing-file']) {
      timingData = loadTimingData(flags['timing-file']);
    }

    const testsWithDurations = getTestDurations(tests, timingData);
    const estimatedTests = testsWithDurations
      .filter((t) => t.estimated)
      .map((t) => t.testId);

    if (flags.verbose && estimatedTests.length > 0) {
      this.log(
        `Estimated duration for ${estimatedTests.length} tests (no historical data)`,
      );
    }

    const testInputs: TestWithDuration[] = testsWithDurations.map((t) => ({
      testId: t.testId,
      file: t.file,
      duration: t.duration,
      estimated: t.estimated,
    }));

    const ckkResult = assignWithCKK(testInputs, flags.shards, flags.timeout);

    if (flags.verbose) {
      this.log(
        `Assignment ${ckkResult.isOptimal ? 'optimal' : 'near-optimal (LPT fallback)'}`,
      );
      this.log(`Makespan: ${this.formatDuration(ckkResult.makespan)}`);
    }

    const shardTests: Record<number, string[]> = {};
    for (const assignment of ckkResult.assignments) {
      shardTests[assignment.shardIndex] = assignment.tests;
    }

    const result: TestAssignResult = {
      shards: shardTests,
      expectedDurations: Object.fromEntries(
        ckkResult.assignments.map((a) => [a.shardIndex, a.expectedDuration]),
      ),
      totalTests: tests.length,
      estimatedTests,
      isOptimal: ckkResult.isOptimal,
    };

    this.outputResult(result, flags['output-format'], flags.verbose);
  }

  private outputResult(
    result: TestAssignResult,
    format: string,
    verbose = false,
  ): void {
    if (format === 'json') {
      this.log(JSON.stringify(result));
    } else {
      this.log('\n=== Shard Assignments ===\n');
      for (const [shard, tests] of Object.entries(result.shards)) {
        const duration = result.expectedDurations[Number(shard)];
        const durationStr = this.formatDuration(duration ?? 0);
        this.log(`Shard ${shard} (${durationStr}, ${tests.length} tests):`);

        if (verbose) {
          for (const testId of tests) {
            const isEstimated = result.estimatedTests.includes(testId);
            this.log(`  - ${testId}${isEstimated ? ' (estimated)' : ''}`);
          }
        }
        this.log('');
      }
      this.log(`Total tests: ${result.totalTests}`);
      this.log(
        `Optimal solution: ${result.isOptimal ? 'Yes' : 'No (LPT fallback)'}`,
      );
      if (result.estimatedTests.length > 0) {
        this.log(
          `Tests with estimated duration: ${result.estimatedTests.length}`,
        );
      }
    }
  }

  private formatDuration(ms: number): string {
    const seconds = Math.round(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return minutes > 0
      ? `${minutes}m ${remainingSeconds}s`
      : `${remainingSeconds}s`;
  }
}
