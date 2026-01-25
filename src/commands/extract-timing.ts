import * as fs from 'node:fs';
import * as path from 'node:path';
import { Command, Flags } from '@oclif/core';
import type { PlaywrightReport, ShardTimingArtifact } from '../core/index.js';
import { buildTestId } from '../core/index.js';

export default class ExtractTiming extends Command {
  static override description =
    'Extract timing data from Playwright JSON report';

  static override examples = [
    '<%= config.bin %> extract-timing --report-file ./playwright-report/results.json --output-file ./timing.json',
    '<%= config.bin %> extract-timing --report-file ./results.json --shard 1 --project "Mobile Chrome"',
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
    verbose: Flags.boolean({
      char: 'v',
      description: 'Show verbose output',
      default: false,
    }),
  };

  // Base directory for path resolution (set from report config)
  private baseDir: string = '';

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

    // Determine base directory from report config
    // Use project.testDir if available, otherwise fall back to rootDir
    this.baseDir = this.getBaseDirFromReport(report, flags.project);

    if (flags.verbose) {
      this.log(`Using base directory: ${this.baseDir}`);
    }

    // Extract test-level durations
    const testDurations = this.extractTestDurations(report);

    if (flags.verbose) {
      this.log(
        `Extracted timing for ${Object.keys(testDurations).length} tests`,
      );
    }

    // Create artifact
    const artifact: ShardTimingArtifact = {
      shard: flags.shard,
      project: flags.project,
      tests: testDurations,
    };

    const output = JSON.stringify(artifact, null, 2);

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
   * Normalize file path to be relative and consistent
   * Uses the base directory from report config for consistency with discovery
   */
  private normalizeFilePath(filePath: string): string {
    return path.relative(this.baseDir, filePath).replace(/\\/g, '/');
  }

  /**
   * Extract base directory from Playwright report config.
   *
   * CRITICAL: This must match what discovery uses (project.testDir).
   * NO FALLBACKS - if testDir is not available, fail loudly.
   */
  private getBaseDirFromReport(
    report: PlaywrightReport,
    projectName: string,
  ): string {
    const config = report.config;

    if (!config) {
      this.error(
        '[Orchestrator] Report has no config section. ' +
          'Ensure you are using Playwright JSON reporter with config output enabled.',
      );
    }

    if (!config.projects || config.projects.length === 0) {
      this.error(
        '[Orchestrator] Report has no projects in config. ' +
          'Ensure your playwright.config.ts has at least one project configured.',
      );
    }

    // Find the matching project
    const project =
      config.projects.find((p) => p.name === projectName) || config.projects[0];

    if (!project) {
      const availableProjects = config.projects.map((p) => p.name).join(', ');
      this.error(
        `[Orchestrator] Project "${projectName}" not found in report config. ` +
          `Available projects: ${availableProjects}`,
      );
    }

    if (!project.testDir) {
      this.error(
        `[Orchestrator] Project "${project.name}" has no testDir in report config. ` +
          'Ensure your playwright.config.ts project has testDir set. ' +
          'Do NOT use rootDir as fallback - it causes path mismatch bugs.',
      );
    }

    return project.testDir;
  }
}
