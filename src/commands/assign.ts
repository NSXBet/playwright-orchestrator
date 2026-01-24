import * as path from 'node:path';
import { Command, Flags } from '@oclif/core';
import { glob } from 'glob';
import {
  assignWithCKK,
  assignWithLPT,
  DEFAULT_CKK_TIMEOUT,
  DEFAULT_MS_PER_LINE,
  type DiscoveredTest,
  discoverTests,
  discoverTestsFromFiles,
  estimateDuration,
  type FileWithDuration,
  formatAssignResult,
  generateGrepPatterns,
  getFileDuration,
  getTestDurations,
  isTimingDataV2,
  loadTestListFromFile,
  loadTimingData,
  type TestAssignResult,
  type TestWithDuration,
  type TimingDataV2,
} from '../core/index.js';

export default class Assign extends Command {
  static override description =
    'Assign test files or tests to shards based on historical timing data';

  static override examples = [
    '<%= config.bin %> assign --test-dir ./src/test/e2e --shards 4',
    '<%= config.bin %> assign --test-dir ./e2e --timing-file ./timing.json --shards 4 --output-format json',
    '<%= config.bin %> assign --test-dir ./e2e --shards 4 --level test --timeout 500',
  ];

  static override flags = {
    'test-dir': Flags.string({
      char: 'd',
      description: 'Path to test directory containing spec files',
      required: false, // Not required when using --test-list
    }),
    'test-list': Flags.string({
      description:
        'Path to JSON file with test list (from playwright --list --reporter=json). When provided, skips test discovery.',
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
      description: 'Playwright project name (for accurate test discovery)',
    }),
    'output-format': Flags.string({
      char: 'f',
      description: 'Output format',
      default: 'json',
      options: ['json', 'text'],
    }),
    'fallback-ms-per-line': Flags.integer({
      description: 'Milliseconds per line for duration estimation',
      default: DEFAULT_MS_PER_LINE,
    }),
    verbose: Flags.boolean({
      char: 'v',
      description: 'Show verbose output',
      default: false,
    }),
    'glob-pattern': Flags.string({
      description: 'Glob pattern for test files',
      default: '**/*.spec.ts',
    }),
    level: Flags.string({
      char: 'l',
      description: 'Distribution level: file or test',
      default: 'test',
      options: ['file', 'test'],
    }),
    timeout: Flags.integer({
      description: 'CKK algorithm timeout in milliseconds (test-level only)',
      default: DEFAULT_CKK_TIMEOUT,
    }),
    'use-fallback': Flags.boolean({
      description:
        'Use file parsing instead of Playwright --list for test discovery',
      default: false,
    }),
    'config-dir': Flags.string({
      char: 'c',
      description:
        'Directory where playwright.config.ts is located (defaults to test-dir)',
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(Assign);

    // Validate that either test-dir or test-list is provided
    if (!flags['test-dir'] && !flags['test-list']) {
      this.error('Either --test-dir or --test-list must be provided');
    }

    const testDir = flags['test-dir'] ? path.resolve(flags['test-dir']) : '';
    const pattern = flags['glob-pattern'];

    if (flags.level === 'test') {
      await this.runTestLevel(testDir, pattern, {
        ...flags,
        project: flags.project,
        'use-fallback': flags['use-fallback'],
        'config-dir': flags['config-dir'],
        'test-list': flags['test-list'],
      });
    } else {
      if (flags['test-list']) {
        this.error('--test-list is only supported with --level test');
      }
      await this.runFileLevel(testDir, pattern, flags);
    }
  }

  private async runTestLevel(
    testDir: string,
    pattern: string,
    flags: {
      shards: number;
      'timing-file'?: string;
      'output-format': string;
      verbose: boolean;
      timeout: number;
      'glob-pattern': string;
      project?: string;
      'use-fallback': boolean;
      'config-dir'?: string;
      'test-list'?: string;
    },
  ): Promise<void> {
    // Discover tests - prefer pre-generated test list, then Playwright --list, then file parsing
    let tests: DiscoveredTest[];

    if (flags['test-list']) {
      // Use pre-generated test list file (most reliable in CI)
      const testListPath = path.resolve(flags['test-list']);
      tests = loadTestListFromFile(testListPath);
      if (flags.verbose) {
        this.log(`Using pre-generated test list from ${testListPath}`);
      }
    } else if (flags['use-fallback']) {
      // Explicit fallback requested
      tests = discoverTestsFromFiles(testDir, pattern);
      if (flags.verbose) {
        this.log('Using file parsing for test discovery (--use-fallback)');
      }
    } else {
      try {
        // Try Playwright --list first (handles parameterized tests correctly)
        // Use config-dir if provided, otherwise use test-dir
        tests = discoverTests(testDir, flags.project, flags['config-dir']);
        if (flags.verbose) {
          this.log(
            'Using Playwright --list for test discovery (accurate, includes parameterized tests)',
          );
        }
      } catch {
        // Fallback to file parsing if Playwright --list fails
        if (flags.verbose) {
          this.warn(
            'Playwright --list failed, falling back to file parsing (may miss parameterized tests)',
          );
        }
        tests = discoverTestsFromFiles(testDir, pattern);
      }
    }

    if (tests.length === 0) {
      const source = flags['test-list'] || `${testDir} matching ${pattern}`;
      this.warn(`No tests found in ${source}`);
      this.outputTestResult(
        {
          shards: Object.fromEntries(
            Array.from({ length: flags.shards }, (_, i) => [i + 1, []]),
          ),
          grepPatterns: Object.fromEntries(
            Array.from({ length: flags.shards }, (_, i) => [i + 1, '']),
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

    if (flags.verbose) {
      this.log(`Found ${tests.length} tests in ${testDir}`);
    }

    // Load timing data if available
    let timingData: TimingDataV2 | null = null;
    if (flags['timing-file']) {
      const loadedData = loadTimingData(flags['timing-file']);
      if (isTimingDataV2(loadedData)) {
        timingData = loadedData;
      } else if (flags.verbose) {
        this.warn('Timing data is v1 (file-level), will estimate all tests');
      }
    }

    // Get test durations
    const testsWithDurations = getTestDurations(tests, timingData);
    const estimatedTests = testsWithDurations
      .filter((t) => t.estimated)
      .map((t) => t.testId);

    if (flags.verbose && estimatedTests.length > 0) {
      this.log(
        `Estimated duration for ${estimatedTests.length} tests (no historical data)`,
      );
    }

    // Convert to TestWithDuration format
    const testInputs: TestWithDuration[] = testsWithDurations.map((t) => ({
      testId: t.testId,
      file: t.file,
      duration: t.duration,
      estimated: t.estimated,
    }));

    // Run CKK algorithm
    const ckkResult = assignWithCKK(testInputs, flags.shards, flags.timeout);

    if (flags.verbose) {
      this.log(
        `Assignment ${ckkResult.isOptimal ? 'optimal' : 'near-optimal (LPT fallback)'}`,
      );
      this.log(`Makespan: ${this.formatDuration(ckkResult.makespan)}`);
    }

    // Generate grep patterns
    const shardTests: Record<number, string[]> = {};
    for (const assignment of ckkResult.assignments) {
      shardTests[assignment.shardIndex] = assignment.tests;
    }

    const grepPatterns = generateGrepPatterns(shardTests);

    // Build result
    const result: TestAssignResult = {
      shards: shardTests,
      grepPatterns,
      expectedDurations: Object.fromEntries(
        ckkResult.assignments.map((a) => [a.shardIndex, a.expectedDuration]),
      ),
      totalTests: tests.length,
      estimatedTests,
      isOptimal: ckkResult.isOptimal,
    };

    this.outputTestResult(result, flags['output-format'], flags.verbose);
  }

  private async runFileLevel(
    testDir: string,
    pattern: string,
    flags: {
      shards: number;
      'timing-file'?: string;
      'output-format': string;
      verbose: boolean;
      'fallback-ms-per-line': number;
    },
  ): Promise<void> {
    // Find all test files
    const testFiles = await glob(pattern, {
      cwd: testDir,
      nodir: true,
    });

    if (testFiles.length === 0) {
      this.warn(`No test files found in ${testDir} matching ${pattern}`);
      this.outputResult(
        {
          shards: Object.fromEntries(
            Array.from({ length: flags.shards }, (_, i) => [i + 1, []]),
          ),
          expectedDurations: Object.fromEntries(
            Array.from({ length: flags.shards }, (_, i) => [i + 1, 0]),
          ),
          totalFiles: 0,
          estimatedFiles: [],
        },
        flags['output-format'],
      );
      return;
    }

    if (flags.verbose) {
      this.log(`Found ${testFiles.length} test files in ${testDir}`);
    }

    // Load timing data if available
    const timingData = flags['timing-file']
      ? loadTimingData(flags['timing-file'])
      : { version: 1 as const, updatedAt: '', files: {} };

    // Build file list with durations
    const filesWithDurations: FileWithDuration[] = [];
    const estimatedFiles: string[] = [];

    for (const file of testFiles) {
      const historicalDuration = getFileDuration(timingData, file);

      if (historicalDuration !== undefined) {
        filesWithDurations.push({
          file,
          duration: historicalDuration,
          estimated: false,
        });
      } else {
        // Estimate based on line count
        const fullPath = path.join(testDir, file);
        const estimated = estimateDuration(
          fullPath,
          flags['fallback-ms-per-line'],
        );
        filesWithDurations.push({
          file,
          duration: estimated,
          estimated: true,
        });
        estimatedFiles.push(file);
      }
    }

    if (flags.verbose && estimatedFiles.length > 0) {
      this.log(
        `Estimated duration for ${estimatedFiles.length} files (no historical data)`,
      );
    }

    // Run LPT algorithm
    const assignments = assignWithLPT(filesWithDurations, flags.shards);
    const result = formatAssignResult(assignments, estimatedFiles);

    // Output result
    this.outputResult(result, flags['output-format'], flags.verbose);
  }

  private outputTestResult(
    result: TestAssignResult,
    format: string,
    verbose = false,
  ): void {
    if (format === 'json') {
      this.log(JSON.stringify(result));
    } else {
      // Text format
      this.log('\n=== Shard Assignments (Test-Level) ===\n');
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

        const grepPattern = result.grepPatterns[Number(shard)];
        if (grepPattern && grepPattern.length < 100) {
          this.log(`  grep: "${grepPattern}"`);
        } else if (grepPattern) {
          this.log(`  grep: (${grepPattern.length} chars, use --grep-file)`);
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

  private outputResult(
    result: ReturnType<typeof formatAssignResult>,
    format: string,
    _verbose = false,
  ): void {
    if (format === 'json') {
      this.log(JSON.stringify(result));
    } else {
      // Text format
      this.log('\n=== Shard Assignments (File-Level) ===\n');
      for (const [shard, files] of Object.entries(result.shards)) {
        const duration = result.expectedDurations[Number(shard)];
        const durationStr = this.formatDuration(duration ?? 0);
        this.log(`Shard ${shard} (${durationStr}):`);
        for (const file of files) {
          const isEstimated = result.estimatedFiles.includes(file);
          this.log(`  - ${file}${isEstimated ? ' (estimated)' : ''}`);
        }
        this.log('');
      }
      this.log(`Total files: ${result.totalFiles}`);
      if (result.estimatedFiles.length > 0) {
        this.log(
          `Files with estimated duration: ${result.estimatedFiles.length}`,
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
