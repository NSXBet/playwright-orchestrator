import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './src/test/e2e',
  // Orchestrator reporter handles list-style output for sharded runs
  // No need for separate 'list' reporter when using orchestrator
  reporter: process.env.CI
    ? [
        ['@nsxbet/playwright-orchestrator/reporter'],
        ['json', { outputFile: 'test-results/results.json' }],
      ]
    : [['list']],
  use: {
    browserName: 'chromium',
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
});
