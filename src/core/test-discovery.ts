import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { glob } from 'glob';
import type {
  DiscoveredTest,
  PlaywrightListOutput,
  PlaywrightListSuite,
} from './types.js';
import { buildTestId } from './types.js';

/**
 * Discover tests by running Playwright with --list flag
 *
 * @param testDir - Path to test directory
 * @param project - Optional Playwright project name
 * @returns List of discovered tests
 */
export function discoverTests(
  testDir: string,
  project?: string,
): DiscoveredTest[] {
  const projectFlag = project ? `--project="${project}"` : '';
  const cmd =
    `npx playwright test --list --reporter=json ${projectFlag}`.trim();

  try {
    const output = execSync(cmd, {
      cwd: testDir,
      encoding: 'utf-8',
      maxBuffer: 50 * 1024 * 1024, // 50MB buffer for large test suites
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    return parsePlaywrightListOutput(output);
  } catch (error) {
    // Playwright might exit with non-zero even for --list if there are issues
    const execError = error as { stdout?: string; stderr?: string };
    if (execError.stdout) {
      return parsePlaywrightListOutput(execError.stdout);
    }
    throw error;
  }
}

/**
 * Parse Playwright --list JSON output
 *
 * @param jsonOutput - Raw JSON output from Playwright --list
 * @returns List of discovered tests
 */
export function parsePlaywrightListOutput(
  jsonOutput: string,
): DiscoveredTest[] {
  const tests: DiscoveredTest[] = [];

  try {
    const data = JSON.parse(jsonOutput) as PlaywrightListOutput;

    for (const suite of data.suites) {
      extractTestsFromSuite(suite, [], tests);
    }
  } catch {
    // Try parsing line by line if JSON is malformed (older Playwright versions)
    // or if output contains additional text
    const jsonMatch = jsonOutput.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const data = JSON.parse(jsonMatch[0]) as PlaywrightListOutput;
      for (const suite of data.suites) {
        extractTestsFromSuite(suite, [], tests);
      }
    }
  }

  return tests;
}

/**
 * Recursively extract tests from a Playwright suite
 */
function extractTestsFromSuite(
  suite: PlaywrightListSuite,
  parentTitles: string[],
  tests: DiscoveredTest[],
): void {
  const currentTitles =
    suite.title && suite.title !== ''
      ? [...parentTitles, suite.title]
      : parentTitles;

  // Process specs (actual tests)
  if (suite.specs) {
    for (const spec of suite.specs) {
      const titlePath = [...currentTitles, spec.title];
      const file = getRelativeFilePath(spec.file || suite.file);

      tests.push({
        file,
        title: spec.title,
        titlePath,
        testId: buildTestId(file, titlePath),
      });
    }
  }

  // Process nested suites
  if (suite.suites) {
    for (const nestedSuite of suite.suites) {
      extractTestsFromSuite(nestedSuite, currentTitles, tests);
    }
  }
}

/**
 * Get relative file path from absolute path
 */
function getRelativeFilePath(filePath: string): string {
  // Extract just the filename for test IDs
  return path.basename(filePath);
}

/**
 * Discover tests by scanning test files directly (fallback method)
 *
 * This parses test files to find test definitions when Playwright --list isn't available.
 * Uses regex to find test() and it() calls.
 *
 * @param testDir - Path to test directory
 * @param globPattern - Glob pattern for test files
 * @returns List of discovered tests
 */
export function discoverTestsFromFiles(
  testDir: string,
  globPattern: string = '**/*.spec.ts',
): DiscoveredTest[] {
  const tests: DiscoveredTest[] = [];

  const files = glob.sync(globPattern, { cwd: testDir, absolute: true });

  for (const filePath of files) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const fileName = path.basename(filePath);
    const fileTests = parseTestsFromSource(content, fileName);
    tests.push(...fileTests);
  }

  return tests;
}

/**
 * Parse test definitions from source code
 *
 * Extracts test() and it() calls with their describe() context.
 * This is a simple regex-based parser that handles common patterns.
 *
 * @param source - Source code content
 * @param fileName - Name of the source file
 * @returns List of discovered tests
 */
export function parseTestsFromSource(
  source: string,
  fileName: string,
): DiscoveredTest[] {
  const tests: DiscoveredTest[] = [];

  // Match describe blocks and test/it calls
  // This is a simplified parser - for full accuracy, use Playwright --list
  const describeRegex = /(?:test\.)?describe\s*\(\s*['"`]([^'"`]+)['"`]/g;
  const testRegex = /(?:test|it)\s*\(\s*['"`]([^'"`]+)['"`]/g;

  // Find all describe blocks with their positions
  const describes: { title: string; start: number; end: number }[] = [];

  // Extract all describe blocks
  for (const match of source.matchAll(describeRegex)) {
    // Find matching closing brace (simplified - counts braces)
    const start = match.index ?? 0;
    let braceCount = 0;
    let end = start;
    let foundOpen = false;

    for (let i = start; i < source.length; i++) {
      if (source[i] === '{') {
        braceCount++;
        foundOpen = true;
      } else if (source[i] === '}') {
        braceCount--;
        if (foundOpen && braceCount === 0) {
          end = i;
          break;
        }
      }
    }

    describes.push({ title: match[1] ?? '', start, end });
  }

  // Find all tests
  for (const match of source.matchAll(testRegex)) {
    const testTitle = match[1] ?? '';
    const testPos = match.index ?? 0;

    // Find which describe blocks contain this test
    const titlePath: string[] = [];
    for (const desc of describes) {
      if (testPos > desc.start && testPos < desc.end) {
        titlePath.push(desc.title);
      }
    }
    titlePath.push(testTitle);

    tests.push({
      file: fileName,
      title: testTitle,
      titlePath,
      testId: buildTestId(fileName, titlePath),
    });
  }

  return tests;
}

/**
 * Group tests by file
 *
 * @param tests - List of discovered tests
 * @returns Map of file name to tests
 */
export function groupTestsByFile(
  tests: DiscoveredTest[],
): Map<string, DiscoveredTest[]> {
  const grouped = new Map<string, DiscoveredTest[]>();

  for (const test of tests) {
    const existing = grouped.get(test.file) || [];
    existing.push(test);
    grouped.set(test.file, existing);
  }

  return grouped;
}
