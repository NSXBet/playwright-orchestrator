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
 * Load tests from a pre-generated Playwright --list JSON file
 *
 * @param filePath - Path to JSON file (from `npx playwright test --list --reporter=json`)
 * @returns List of discovered tests
 */
export function loadTestListFromFile(filePath: string): DiscoveredTest[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  return parsePlaywrightListOutput(content);
}

/**
 * Discover tests by running Playwright with --list flag
 *
 * @param testDir - Path to test directory (used for fallback discovery)
 * @param project - Optional Playwright project name
 * @param configDir - Optional directory where playwright.config.ts is located (defaults to testDir)
 * @returns List of discovered tests
 */
export function discoverTests(
  testDir: string,
  project?: string,
  configDir?: string,
): DiscoveredTest[] {
  const projectFlag = project ? `--project="${project}"` : '';
  const cmd =
    `npx playwright test --list --reporter=json ${projectFlag}`.trim();

  // Run Playwright from the config directory (where playwright.config.ts is located)
  const cwd = configDir || testDir;

  try {
    const output = execSync(cmd, {
      cwd,
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
    const rootDir = data.config?.rootDir || process.cwd();

    for (const suite of data.suites) {
      // Root suites represent files - their title is the filename
      // We skip this title from titlePath since it's redundant with file
      extractTestsFromSuite(suite, [], tests, rootDir, true);
    }
  } catch {
    // Try parsing line by line if JSON is malformed (older Playwright versions)
    // or if output contains additional text
    const jsonMatch = jsonOutput.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const data = JSON.parse(jsonMatch[0]) as PlaywrightListOutput;
      const rootDir = data.config?.rootDir || process.cwd();

      for (const suite of data.suites) {
        extractTestsFromSuite(suite, [], tests, rootDir, true);
      }
    }
  }

  return tests;
}

/**
 * Recursively extract tests from a Playwright suite
 *
 * @param suite - Playwright suite from JSON output
 * @param parentTitles - Title path from parent suites (describe blocks)
 * @param tests - Array to collect discovered tests
 * @param rootDir - Test root directory from Playwright config
 * @param isRootSuite - Whether this is a root file suite (title is filename, should be skipped)
 */
function extractTestsFromSuite(
  suite: PlaywrightListSuite,
  parentTitles: string[],
  tests: DiscoveredTest[],
  rootDir: string,
  isRootSuite = false,
): void {
  // Root suites have the filename as title - skip it from titlePath
  // Nested suites (describe blocks) have meaningful titles to include
  const currentTitles =
    !isRootSuite && suite.title && suite.title !== ''
      ? [...parentTitles, suite.title]
      : parentTitles;

  // Process specs (actual tests)
  if (suite.specs) {
    for (const spec of suite.specs) {
      const titlePath = [...currentTitles, spec.title];
      const file = resolveFilePath(spec.file || suite.file, rootDir);

      tests.push({
        file,
        title: spec.title,
        titlePath,
        testId: buildTestId(file, titlePath),
        line: spec.line,
        column: spec.column,
      });
    }
  }

  // Process nested suites (describe blocks)
  if (suite.suites) {
    for (const nestedSuite of suite.suites) {
      extractTestsFromSuite(nestedSuite, currentTitles, tests, rootDir, false);
    }
  }
}

/**
 * Resolve file path to be relative to rootDir (Playwright's testDir/config dir)
 *
 * Playwright JSON output may contain:
 * - Just filename (relative to rootDir): "account.spec.ts"
 * - Full absolute path: "/Users/.../src/test/e2e/account.spec.ts"
 *
 * We return paths relative to rootDir for consistency.
 * This ensures test IDs match between:
 * - Orchestrator (running from repo root, reading test-list.json)
 * - Fixture (running from subdirectory where tests live)
 *
 * Both will generate paths like "src/test/e2e/login.spec.ts" regardless of CWD.
 */
function resolveFilePath(filePath: string, rootDir: string): string {
  // If it's already an absolute path, make it relative to rootDir
  if (path.isAbsolute(filePath)) {
    return path.relative(rootDir, filePath).replace(/\\/g, '/');
  }

  // If it's a relative path already (relative to rootDir), just normalize it
  return filePath.replace(/\\/g, '/');
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
    // Use relative path from CWD for consistency with reporter
    const relativeFile = path
      .relative(process.cwd(), filePath)
      .replace(/\\/g, '/');
    const fileTests = parseTestsFromSource(content, relativeFile);
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

    // Calculate line number from position (1-based)
    const line = source.substring(0, testPos).split('\n').length;
    // Calculate column (1-based, position within the line)
    const lastNewline = source.lastIndexOf('\n', testPos - 1);
    const column = testPos - lastNewline;

    tests.push({
      file: fileName,
      title: testTitle,
      titlePath,
      testId: buildTestId(fileName, titlePath),
      line,
      column,
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
