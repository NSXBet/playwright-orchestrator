import * as fs from 'node:fs';
import * as path from 'node:path';
import { Command, Flags } from '@oclif/core';
import type {
  PlaywrightReport,
  ShardTimingArtifact,
  TestShardTimingArtifact,
} from '../core/index.js';
import { buildTestId } from '../core/index.js';

export default class ExtractTiming extends Command {
  static override description =
    'Extract timing data from Playwright JSON report (file-level or test-level)';

  static override examples = [
    '<%= config.bin %> extract-timing --report-file ./playwright-report/results.json --output-file ./timing.json',
    '<%= config.bin %> extract-timing --report-file ./results.json --shard 1 --project "Mobile Chrome" --level test',
  ];

  static override flags = {
    'report-file': Flags.string({
      char: 'r',
      description: 'Path to Playwright JSON report file',
      required: true,
    }),
    'output-file': Flags.string({
      char: 'o',
      description: 'Path to write timing JSON output',
    }),
    shard: Flags.integer({
      char: 's',
      description: 'Shard index for the artifact',
      default: 1,
    }),
    project: Flags.string({
      char: 'p',
      description: 'Playwright project name',
      default: 'default',
    }),
    level: Flags.string({
      char: 'l',
      description: 'Extraction level: file or test',
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
    const { flags } = await this.parse(ExtractTiming);

    // Read Playwright report
    const reportPath = path.resolve(flags['report-file']);
    let report: PlaywrightReport;

    try {
      const content = fs.readFileSync(reportPath, 'utf-8');
      report = JSON.parse(content) as PlaywrightReport;
    } catch {
      this.error(`Failed to read Playwright report: ${reportPath}`);
    }

    let output: string;

    if (flags.level === 'test') {
      // Extract test-level durations
      const testDurations = this.extractTestDurations(report);

      if (flags.verbose) {
        this.log(
          `Extracted timing for ${Object.keys(testDurations).length} tests`,
        );
      }

      // Create test-level artifact
      const artifact: TestShardTimingArtifact = {
        shard: flags.shard,
        project: flags.project,
        tests: testDurations,
      };

      output = JSON.stringify(artifact, null, 2);
    } else {
      // Extract file-level durations (legacy)
      const fileDurations = this.extractFileDurations(report);

      if (flags.verbose) {
        this.log(
          `Extracted timing for ${Object.keys(fileDurations).length} files`,
        );
      }

      // Create file-level artifact
      const artifact: ShardTimingArtifact = {
        shard: flags.shard,
        project: flags.project,
        files: fileDurations,
      };

      output = JSON.stringify(artifact, null, 2);
    }

    // Output
    if (flags['output-file']) {
      fs.writeFileSync(flags['output-file'], output, 'utf-8');
      if (flags.verbose) {
        this.log(`Wrote timing data to ${flags['output-file']}`);
      }
    } else {
      this.log(output);
    }
  }

  /**
   * Extract test-level durations from Playwright report
   *
   * Each test is identified by: file::describe::testTitle
   */
  private extractTestDurations(
    report: PlaywrightReport,
  ): Record<string, number> {
    const testDurations: Record<string, number> = {};

    for (const suite of report.suites) {
      this.extractTestsFromSuite(suite, [], testDurations);
    }

    return testDurations;
  }

  /**
   * Recursively extract test durations from a suite
   */
  private extractTestsFromSuite(
    suite: PlaywrightReport['suites'][0],
    parentTitles: string[],
    testDurations: Record<string, number>,
  ): void {
    const file = this.normalizeFilePath(suite.file);
    const currentTitles =
      suite.title && suite.title !== ''
        ? [...parentTitles, suite.title]
        : parentTitles;

    // Process specs (actual tests)
    if (suite.specs) {
      for (const spec of suite.specs) {
        const titlePath = [...currentTitles, spec.title];
        const testId = buildTestId(file, titlePath);

        // Sum all result durations (including retries)
        let totalDuration = 0;
        for (const test of spec.tests) {
          for (const result of test.results) {
            totalDuration += result.duration;
          }
        }

        testDurations[testId] = totalDuration;
      }
    }

    // Process nested suites
    if (suite.suites) {
      for (const nestedSuite of suite.suites) {
        // Pass the file from parent if nested suite doesn't have one
        const nestedWithFile = {
          ...nestedSuite,
          file: nestedSuite.file || suite.file,
        };
        this.extractTestsFromSuite(
          nestedWithFile,
          currentTitles,
          testDurations,
        );
      }
    }
  }

  /**
   * Extract file durations from Playwright report (legacy file-level)
   *
   * The report structure has nested suites where the top-level suite
   * represents the file. We sum up all test durations within each file.
   */
  private extractFileDurations(
    report: PlaywrightReport,
  ): Record<string, number> {
    const fileDurations: Record<string, number> = {};

    for (const suite of report.suites) {
      const file = this.normalizeFilePath(suite.file);
      const duration = this.calculateSuiteDuration(suite);
      fileDurations[file] = duration;
    }

    return fileDurations;
  }

  /**
   * Normalize file path to be relative and consistent
   */
  private normalizeFilePath(filePath: string): string {
    // Extract just the filename or relative path
    // Remove any absolute path prefix
    const parts = filePath.split('/');

    // Find the index of common test directories
    const testDirIndex = parts.findIndex(
      (p) => p === 'e2e' || p === 'test' || p === '__tests__',
    );

    if (testDirIndex !== -1) {
      return parts.slice(testDirIndex + 1).join('/');
    }

    // Just return the filename
    return parts[parts.length - 1] ?? filePath;
  }

  /**
   * Calculate total duration for a suite (recursively including nested suites)
   */
  private calculateSuiteDuration(suite: PlaywrightReport['suites'][0]): number {
    let total = 0;

    // Sum durations from specs
    if (suite.specs) {
      for (const spec of suite.specs) {
        for (const test of spec.tests) {
          for (const result of test.results) {
            total += result.duration;
          }
        }
      }
    }

    // Sum durations from nested suites
    if (suite.suites) {
      for (const nestedSuite of suite.suites) {
        total += this.calculateSuiteDuration(nestedSuite);
      }
    }

    return total;
  }
}
