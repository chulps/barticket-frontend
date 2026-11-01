import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  // Playwright clears its outputDir before running; preserve mocked-suite evidence.
  outputDir: './deployment-test-results',
  testDir: './tests/deployment', workers: 1, fullyParallel: false, retries: 0, timeout: 30000,
  use: { ...devices['Desktop Chrome'], baseURL: 'http://127.0.0.1:4175', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: { command: 'node scripts/serve-deployment-fixtures.mjs', url: 'http://127.0.0.1:4175', reuseExistingServer: false },
});
