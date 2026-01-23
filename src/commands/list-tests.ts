import * as path from 'node:path';
import { Command, Flags } from '@oclif/core';
import {
  type DiscoveredTest,
  discoverTests,
  discoverTestsFromFiles,
  groupTestsByFile,
} from '../core/index.js';

export default class ListTests extends Command {
  static override description =
    'Discover all tests in a Playwright project using --list or file parsing';

  static override examples = [
    '<%= config.bin %> list-tests --test-dir ./src/test/e2e',
    '<%= config.bin %> list-tests --test-dir ./e2e --project "Mobile Chrome" --output-format json',
  ];

  static override flags = {
    'test-dir': Flags.string({
      char: 'd',
      description: 'Path to test directory',
      required: true,
    }),
    project: Flags.string({
      char: 'p',
      description: 'Playwright project name',
    }),
    'output-format': Flags.string({
      char: 'f',
      description: 'Output format',
      default: 'json',
      options: ['json', 'text'],
    }),
    'glob-pattern': Flags.string({
      description: 'Glob pattern for test files (used for fallback discovery)',
      default: '**/*.spec.ts',
    }),
    'use-fallback': Flags.boolean({
      description: 'Use file parsing instead of Playwright --list',
      default: false,
    }),
    verbose: Flags.boolean({
      char: 'v',
      description: 'Show verbose output',
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(ListTests);

    const testDir = path.resolve(flags['test-dir']);

    if (flags.verbose) {
      this.log(`Discovering tests in ${testDir}...`);
    }

    let tests: DiscoveredTest[];

    try {
      if (flags['use-fallback']) {
        // Use file parsing
        tests = discoverTestsFromFiles(testDir, flags['glob-pattern']);
        if (flags.verbose) {
          this.log('Using file parsing for test discovery');
        }
      } else {
        // Use Playwright --list
        tests = discoverTests(testDir, flags.project);
        if (flags.verbose) {
          this.log('Using Playwright --list for test discovery');
        }
      }
    } catch {
      // Fallback to file parsing if Playwright --list fails
      if (flags.verbose) {
        this.warn('Playwright --list failed, falling back to file parsing');
      }
      tests = discoverTestsFromFiles(testDir, flags['glob-pattern']);
    }

    if (flags.verbose) {
      this.log(`Discovered ${tests.length} tests`);
    }

    this.outputResult(tests, flags['output-format'], flags.verbose);
  }

  private outputResult(
    tests: DiscoveredTest[],
    format: string,
    verbose = false,
  ): void {
    if (format === 'json') {
      this.log(JSON.stringify(tests));
    } else {
      // Text format - group by file
      const grouped = groupTestsByFile(tests);

      this.log('\n=== Discovered Tests ===\n');

      for (const [file, fileTests] of grouped) {
        this.log(`${file}:`);
        for (const test of fileTests) {
          const titlePath = test.titlePath.join(' > ');
          this.log(`  - ${titlePath}`);
          if (verbose) {
            this.log(`    ID: ${test.testId}`);
          }
        }
        this.log('');
      }

      this.log(`Total: ${tests.length} tests in ${grouped.size} files`);
    }
  }
}
