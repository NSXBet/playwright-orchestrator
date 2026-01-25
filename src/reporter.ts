/**
 * Playwright Orchestrator Reporter
 *
 * A custom Playwright reporter that provides clean output for sharded tests.
 * Shows only tests assigned to the current shard, with proper counts and summaries.
 *
 * Features:
 * - Correct "Running X tests" count (only shard tests, not total)
 * - Clean output showing only shard tests (no skipped noise)
 * - Debug mode to see filtered tests
 * - Compatible with other reporters (json, html)
 *
 * Usage:
 * 1. Add to playwright.config.ts:
 *    reporter: [['@nsxbet/playwright-orchestrator/reporter'], ['json', {...}]]
 * 2. Set ORCHESTRATOR_SHARD_FILE env var to path of JSON file with test IDs
 *
 * Environment variables:
 * - ORCHESTRATOR_SHARD_FILE: Path to JSON file with array of test IDs
 * - ORCHESTRATOR_DEBUG: Set to "1" to show filtered tests
 *
 * @module @nsxbet/playwright-orchestrator/reporter
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestResult,
} from '@playwright/test/reporter';

// ANSI color codes
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  gray: '\x1b[90m',
  reset: '\x1b[0m',
  bold: '\x1b[1m',
};

// Check if colors should be used
const useColors =
  process.env.FORCE_COLOR !== '0' &&
  process.env.NO_COLOR === undefined &&
  process.stdout.isTTY;

function color(code: keyof typeof colors, text: string): string {
  return useColors ? `${colors[code]}${text}${colors.reset}` : text;
}

export default class OrchestratorReporter implements Reporter {
  private allowedTestIds: Set<string> | null = null;
  private debug = process.env.ORCHESTRATOR_DEBUG === '1';
  private startTime = 0;
  private rootDir = '';

  // Counters for summary
  private passed = 0;
  private failed = 0;
  private skipped = 0;
  private filtered = 0;

  onBegin(config: FullConfig, suite: Suite) {
    this.startTime = Date.now();
    this.rootDir = config.rootDir;
    const shardFile = process.env.ORCHESTRATOR_SHARD_FILE;

    if (!shardFile || !fs.existsSync(shardFile)) {
      // No shard file - let other reporters handle output
      if (this.debug) {
        console.log(
          color('gray', '[Orchestrator] No shard file, running all tests'),
        );
      }
      return;
    }

    try {
      const testIds = JSON.parse(fs.readFileSync(shardFile, 'utf-8'));
      this.allowedTestIds = new Set(testIds);

      // Count tests
      const allTests = suite.allTests();
      const shardTestCount = this.allowedTestIds.size;
      this.filtered = allTests.length - shardTestCount;

      // Print header
      const workers = config.workers;
      let header = `\nRunning ${color('bold', String(shardTestCount))} tests using ${workers} workers`;
      if (this.debug && this.filtered > 0) {
        header += color('gray', ` (${this.filtered} filtered by orchestrator)`);
      }
      console.log(header);
      console.log('');
    } catch (error) {
      console.error('[Orchestrator] Failed to load shard file:', error);
      throw error;
    }
  }

  onTestEnd(test: TestCase, result: TestResult) {
    const testId = this.buildTestId(test);
    const isInShard = !this.allowedTestIds || this.allowedTestIds.has(testId);

    if (isInShard) {
      // Track stats for shard tests
      if (result.status === 'passed') {
        this.passed++;
      } else if (result.status === 'failed' || result.status === 'timedOut') {
        this.failed++;
      } else if (result.status === 'skipped') {
        this.skipped++;
      }

      // Print test result
      this.printTestResult(test, result);
    } else if (this.debug) {
      // Show filtered tests only in debug mode
      this.printFiltered(test);
    }
  }

  onEnd(_result: FullResult) {
    // Only print summary if we have a shard file
    if (!this.allowedTestIds) return;

    const duration = Date.now() - this.startTime;
    const durationStr = this.formatDuration(duration);

    console.log('');

    // Build summary parts
    const parts: string[] = [];
    if (this.passed > 0) {
      parts.push(color('green', `${this.passed} passed`));
    }
    if (this.failed > 0) {
      parts.push(color('red', `${this.failed} failed`));
    }
    if (this.skipped > 0) {
      parts.push(color('yellow', `${this.skipped} skipped`));
    }

    if (parts.length > 0) {
      console.log(`  ${parts.join(', ')} ${color('gray', `(${durationStr})`)}`);
    }
  }

  /**
   * Print a test result line
   */
  private printTestResult(test: TestCase, result: TestResult): void {
    const duration = result.duration;
    const durationStr =
      duration > 0 ? color('gray', ` (${this.formatDuration(duration)})`) : '';

    const titlePath = this.getDisplayTitle(test);
    let status: string;

    switch (result.status) {
      case 'passed':
        status = color('green', '✓');
        break;
      case 'failed':
      case 'timedOut':
        status = color('red', '✗');
        break;
      case 'skipped':
        status = color('yellow', '-');
        break;
      default:
        status = '?';
    }

    console.log(`  ${status} ${titlePath}${durationStr}`);

    // Print error for failed tests
    if (result.status === 'failed' || result.status === 'timedOut') {
      for (const error of result.errors) {
        if (error.message) {
          const lines = error.message.split('\n').slice(0, 3);
          for (const line of lines) {
            console.log(color('red', `      ${line}`));
          }
        }
      }
    }
  }

  /**
   * Print a filtered test (debug mode only)
   */
  private printFiltered(test: TestCase): void {
    const titlePath = this.getDisplayTitle(test);
    console.log(`  ${color('gray', '○')} ${color('gray', titlePath)}`);
  }

  /**
   * Get display title for a test (file > describe > test)
   */
  private getDisplayTitle(test: TestCase): string {
    const file = path.basename(test.location.file);
    const filteredTitles = this.getFilteredTitles(test);
    return `${file} > ${filteredTitles.join(' > ')}`;
  }

  /**
   * Filter titlePath to get only describe blocks and test title.
   * Removes: empty strings, project name, file paths
   */
  private getFilteredTitles(test: TestCase): string[] {
    const titlePath = test.titlePath();
    const projectName = test.parent?.project()?.name;
    const fileName = path.basename(test.location.file);

    return titlePath.filter((title) => {
      if (!title || title === '') return false;
      if (title === projectName) return false;
      if (title === fileName) return false;
      // Filter out file paths (contain / or \ or end with .spec.ts/.test.ts)
      if (title.includes('/') || title.includes('\\')) return false;
      if (title.endsWith('.spec.ts') || title.endsWith('.test.ts'))
        return false;
      if (title.endsWith('.spec.js') || title.endsWith('.test.js'))
        return false;
      return true;
    });
  }

  /**
   * Format duration in human readable format
   */
  private formatDuration(ms: number): string {
    if (ms < 1000) {
      return `${ms}ms`;
    }
    const seconds = ms / 1000;
    if (seconds < 60) {
      return `${seconds.toFixed(1)}s`;
    }
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.round(seconds % 60);
    return `${minutes}m ${remainingSeconds}s`;
  }

  /**
   * Build test ID from TestCase.
   * Format: {relative-file}::{describe}::{test-title}
   */
  private buildTestId(test: TestCase): string {
    // Use project's testDir for consistent path resolution with test-discovery
    // This ensures paths match what the orchestrator assign command produces
    const testDir = test.parent?.project()?.testDir;
    const baseDir = testDir || this.rootDir || process.cwd();
    const file = path.relative(baseDir, test.location.file).replace(/\\/g, '/');
    const filteredTitles = this.getFilteredTitles(test);
    return [file, ...filteredTitles].join('::');
  }
}
