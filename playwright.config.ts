import { defineConfig } from '@playwright/test';

const runId = Date.now();
export default defineConfig({
  testDir: './tests/e2e',
  testIgnore: 'online.spec.ts',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : {},
  },
  webServer: [
    {
      command: 'npm run dev:server',
      url: 'http://127.0.0.1:3001/api/trip',
      reuseExistingServer: false,
      env: { DB_PATH: `data/e2e-${runId}.sqlite`, PUBLIC_ORIGIN: '' },
    },
    {
      command: 'npm run dev:client',
      url: 'http://127.0.0.1:5173',
      reuseExistingServer: false,
    },
  ],
});
