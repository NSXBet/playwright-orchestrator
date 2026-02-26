import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './src/test/e2e',
  reporter:
    process.env.CI === 'true'
      ? [
          ['list'],
          ['blob'],
          ['html'],
          ['json', { outputFile: 'playwright-report/results.json' }],
          ['github'],
          [
            '@estruyf/github-actions-reporter',
            {
              showAnnotations: false,
              useDetails: true,
              showError: true,
            },
          ],
        ]
      : [['list'], ['html']],
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
