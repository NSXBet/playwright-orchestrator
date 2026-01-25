import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    // Use the package reporter for test-level distribution
    // When running standalone, use: ['@nsxbet/playwright-orchestrator/reporter']
    ['./playwright-orchestrator-reporter.ts'],
    ['json', { outputFile: 'results.json' }],
    ['list'],
  ],

  // Tests have controlled delays up to 120s, so we need a higher timeout
  timeout: 150_000, // 2.5 minutes per test

  use: {
    trace: 'on-first-retry',
  },

  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
});
