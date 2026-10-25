import { defineConfig } from '@playwright/test';

const runId = Date.now();
const clientPort = Number(process.env.PLAYWRIGHT_PORT || 5173);
if (!Number.isInteger(clientPort) || clientPort < 1 || clientPort > 65535) throw new Error('Invalid PLAYWRIGHT_PORT.');
export default defineConfig({
  testDir: './tests/e2e',
  testIgnore: 'online.spec.ts',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: `http://127.0.0.1:${clientPort}`,
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
      command: `npm run dev:client -- --port ${clientPort}`,
      url: `http://127.0.0.1:${clientPort}`,
      reuseExistingServer: false,
    },
  ],
});
