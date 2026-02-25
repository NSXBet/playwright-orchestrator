import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './src/test/e2e',
  reporter:
    process.env.CI === 'true'
      ? [
          [
            '@nsxbet/playwright-orchestrator/reporter',
            { filterJson: 'playwright-report/results.json' },
          ],
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
              includeResults: ['pass', 'fail', 'flaky'],
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
