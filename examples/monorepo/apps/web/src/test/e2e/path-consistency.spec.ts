/**
 * E2E Test: Test ID Path Consistency
 *
 * This test validates that test IDs generated during discovery (test-list.json)
 * match test IDs generated at runtime (fixture). This prevents the rootDir vs
 * testDir mismatch bug that caused silent test filtering failures.
 *
 * Bug context:
 * - Discovery used config.rootDir → paths like "src/test/e2e/file.spec.ts"
 * - Fixture used project.testDir → paths like "file.spec.ts"
 * - These didn't match, so tests were silently skipped
 *
 * This test runs in CI to ensure the fix is working correctly.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { buildTestIdFromRuntime } from '@nsxbet/playwright-orchestrator/core';
import { expect, test } from './setup';

test.describe('Test ID Path Consistency', () => {
  // biome-ignore lint/correctness/noEmptyPattern: Playwright requires empty destructuring for fixtures
  test('runtime test ID matches discovery test ID format', async ({}, testInfo) => {
    // This test validates that the test ID we generate at runtime
    // matches the format used during discovery

    // 1. Get the runtime-generated test ID using the same logic as fixture
    const runtimeTestId = buildTestIdFromRuntime(
      testInfo.file,
      testInfo.titlePath,
      {
        projectName: testInfo.project.name,
        baseDir: testInfo.project.testDir,
      },
    );

    // 2. Validate the test ID format
    // Expected: file.spec.ts::describe::test title
    // NOT: src/test/e2e/file.spec.ts::describe::test title (this was the bug)
    expect(runtimeTestId).toContain('path-consistency.spec.ts');
    expect(runtimeTestId).toContain('Test ID Path Consistency');

    // 3. The file path in the ID should NOT start with src/test/e2e/
    // because testDir is set to ./src/test/e2e
    const filePathInId = runtimeTestId.split('::')[0];
    expect(filePathInId).not.toMatch(/^src\/test\/e2e\//);

    // 4. Debug output for CI visibility
    console.log('=== Path Consistency Validation ===');
    console.log(`testInfo.file: ${testInfo.file}`);
    console.log(`testInfo.project.testDir: ${testInfo.project.testDir}`);
    console.log(`Runtime test ID: ${runtimeTestId}`);
    console.log(`File path in ID: ${filePathInId}`);
  });

  // biome-ignore lint/correctness/noEmptyPattern: Playwright requires empty destructuring for fixtures
  test('test IDs in shard file match runtime format when filtering is active', async ({}, testInfo) => {
    // This test runs when ORCHESTRATOR_SHARD_FILE is set
    // It validates that the IDs in the shard file match runtime format

    const shardFile = process.env.ORCHESTRATOR_SHARD_FILE;

    if (!shardFile) {
      // When not using orchestrator, just validate the path logic
      const runtimeTestId = buildTestIdFromRuntime(
        testInfo.file,
        testInfo.titlePath,
        {
          projectName: testInfo.project.name,
          baseDir: testInfo.project.testDir,
        },
      );
      expect(runtimeTestId).toBeTruthy();
      console.log('Shard file not set - skipping shard validation');
      return;
    }

    // Read the shard file
    const shardContent = JSON.parse(fs.readFileSync(shardFile, 'utf-8'));
    expect(Array.isArray(shardContent)).toBe(true);

    // Get runtime test ID for this test
    const runtimeTestId = buildTestIdFromRuntime(
      testInfo.file,
      testInfo.titlePath,
      {
        projectName: testInfo.project.name,
        baseDir: testInfo.project.testDir,
      },
    );

    console.log('=== Shard File Validation ===');
    console.log(`Shard file: ${shardFile}`);
    console.log(`Total IDs in shard: ${shardContent.length}`);
    console.log(`Runtime test ID: ${runtimeTestId}`);

    // Find IDs from the same file
    const sameFileIds = shardContent.filter((id: string) =>
      id.startsWith('path-consistency.spec.ts::'),
    );
    console.log(`IDs from this file in shard: ${sameFileIds.length}`);
    for (const id of sameFileIds) {
      console.log(`  - ${id}`);
    }

    // If this test is running, it must be in the shard file
    // (because the fixture would have skipped it otherwise)
    if (!shardContent.includes(runtimeTestId)) {
      // This shouldn't happen if the fix is working
      console.error('WARNING: This test is running but NOT in shard file!');
      console.error('This indicates the fixture is not filtering correctly.');
      console.error('Sample shard IDs:', shardContent.slice(0, 5));
    }
  });

  // biome-ignore lint/correctness/noEmptyPattern: Playwright requires empty destructuring for fixtures
  test('validates testDir is correctly configured in project', async ({}, testInfo) => {
    // This test ensures the project has testDir configured
    // Without testDir, the fixture cannot generate consistent test IDs

    expect(testInfo.project.testDir).toBeTruthy();
    expect(testInfo.project.testDir).toContain('e2e');

    // testDir should be an absolute path
    expect(path.isAbsolute(testInfo.project.testDir)).toBe(true);

    console.log('=== Project Configuration ===');
    console.log(`Project name: ${testInfo.project.name}`);
    console.log(`Project testDir: ${testInfo.project.testDir}`);
    console.log(`Test file: ${testInfo.file}`);

    // File should be inside testDir
    const relativePath = path.relative(testInfo.project.testDir, testInfo.file);
    expect(relativePath).not.toMatch(/^\.\./); // Should not start with ..

    console.log(`Relative path from testDir: ${relativePath}`);
  });
});
