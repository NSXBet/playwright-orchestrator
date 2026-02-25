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
      required: true,
    }),
    'shard-file': Flags.string({
      description:
        'Path to shard JSON file — only extract timing for tests in this file',
      required: true,
    }),
    verbose: Flags.boolean({
      char: 'v',
      description: 'Show verbose output',
      default: false,
    }),
  };

  // Base directory for path resolution (resolved testDir)
  private testDir: string = '';
  // Root directory from Playwright config (where config file is)
  private rootDir: string = '';

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

    // Extract rootDir and testDir from report config
    const { rootDir, testDir } = this.getPathsFromReport(report, flags.project);
    this.rootDir = rootDir;
    this.testDir = testDir;

    if (flags.verbose) {
      this.log(`Using rootDir: ${this.rootDir}`);
      this.log(`Using testDir: ${this.testDir}`);
    }

    // Extract test-level durations
    const testDurations = this.extractTestDurations(report);

    // Filter by shard file (required)
    const shardFilePath = path.resolve(flags['shard-file']);
    if (!fs.existsSync(shardFilePath)) {
      this.error(`Shard file not found: ${shardFilePath}`);
    }

    let shardIds: unknown;
    try {
      shardIds = JSON.parse(fs.readFileSync(shardFilePath, 'utf-8'));
    } catch {
      this.error(`Failed to parse shard file: ${shardFilePath}`);
    }
    if (!Array.isArray(shardIds)) {
      this.error(`Shard file must contain a JSON array: ${shardFilePath}`);
    }
    const allowed = new Set(shardIds as string[]);
    const beforeCount = Object.keys(testDurations).length;

    for (const testId of Object.keys(testDurations)) {
      if (!allowed.has(testId)) {
        delete testDurations[testId];
      }
    }

    if (flags.verbose) {
      const afterCount = Object.keys(testDurations).length;
      this.log(
        `Filtered by shard file: ${beforeCount} → ${afterCount} tests (removed ${beforeCount - afterCount})`,
      );
    }

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
      // Root suites represent files - their title is the filename
      // We skip this title from titlePath since it's redundant with file
      // This matches test-discovery.ts behavior
      this.extractTestsFromSuite(suite, [], testDurations, true);
    }

    return testDurations;
  }

  /**
   * Recursively extract test durations from a suite
   *
   * @param suite - Playwright suite from JSON report
   * @param parentTitles - Title path from parent suites (describe blocks)
   * @param testDurations - Map to collect test durations
   * @param isRootSuite - Whether this is a root file suite (title is filename, should be skipped)
   */
  private extractTestsFromSuite(
    suite: PlaywrightReport['suites'][0],
    parentTitles: string[],
    testDurations: Record<string, number>,
    isRootSuite = false,
  ): void {
    const file = this.normalizeFilePath(suite.file);
    // Root suites have the filename as title - skip it from titlePath
    // Nested suites (describe blocks) have meaningful titles to include
    // This matches test-discovery.ts behavior exactly
    const currentTitles =
      !isRootSuite && suite.title && suite.title !== ''
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

    // Process nested suites (describe blocks - never root suites)
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
          false, // Nested suites are never root suites
        );
      }
    }
  }

  /**
   * Normalize file path to be relative to testDir.
   *
   * DETERMINISTIC APPROACH:
   * 1. suite.file in Playwright report is always relative to rootDir
   * 2. testDir is either absolute or relative to rootDir
   * 3. We resolve both to get absolute paths, then compute relative path
   *
   * This ensures consistent test IDs regardless of container path differences.
   */
  private normalizeFilePath(filePath: string): string {
    const normalizedFile = filePath.replace(/\\/g, '/');
    const normalizedTestDir = this.testDir.replace(/\\/g, '/');
    const normalizedRootDir = this.rootDir.replace(/\\/g, '/');

    // suite.file in Playwright JSON report is relative to rootDir
    // Resolve it to get the "logical" absolute path
    const absoluteFile = path.isAbsolute(normalizedFile)
      ? normalizedFile
      : path.join(normalizedRootDir, normalizedFile).replace(/\\/g, '/');

    // testDir might be relative to rootDir, resolve it
    const absoluteTestDir = path.isAbsolute(normalizedTestDir)
      ? normalizedTestDir
      : path.join(normalizedRootDir, normalizedTestDir).replace(/\\/g, '/');

    // Now compute relative path from testDir to file
    // Both are now in the same "logical" path space
    const relativePath = path
      .relative(absoluteTestDir, absoluteFile)
      .replace(/\\/g, '/');

    // Sanity check: result should not start with ../
    // If it does, the file is outside testDir which shouldn't happen
    if (relativePath.startsWith('../')) {
      // Log warning but continue - use basename as fallback
      // This handles edge cases where paths are truly mismatched
      return path.basename(filePath);
    }

    return relativePath;
  }

  /**
   * Extract rootDir and testDir from Playwright report config.
   *
   * CRITICAL: We need both paths to correctly resolve file locations:
   * - rootDir: where playwright.config.ts is located (absolute)
   * - testDir: where tests are located (can be relative to rootDir)
   */
  private getPathsFromReport(
    report: PlaywrightReport,
    projectName: string,
  ): { rootDir: string; testDir: string } {
    const config = report.config;

    if (!config) {
      this.error(
        '[Orchestrator] Report has no config section. ' +
          'Ensure you are using Playwright JSON reporter with config output enabled.',
      );
    }

    // rootDir is where playwright.config.ts is located
    if (!config.rootDir) {
      this.error(
        '[Orchestrator] Report has no rootDir in config. ' +
          'This is required to resolve test file paths correctly.',
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
          'Ensure your playwright.config.ts project has testDir set.',
      );
    }

    return {
      rootDir: config.rootDir,
      testDir: project.testDir,
    };
  }
}
