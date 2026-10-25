import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'online.spec.ts',
  timeout: 45_000,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173/ferias-2026/',
    trace: 'retain-on-failure',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {},
  },
  webServer: [
    {
      command: 'npx --no-install supabase functions serve trip-api',
      url: 'http://127.0.0.1:54321/functions/v1/trip-api/health',
      reuseExistingServer: true,
      env: { SUPABASE_TELEMETRY_DISABLED: '1' },
    },
    {
      command: 'npm run build && npx --no-install vite preview --host 127.0.0.1 --port 4173 --strictPort',
      url: 'http://127.0.0.1:4173/ferias-2026/',
      reuseExistingServer: false,
      env: {
        VITE_BACKEND: 'supabase', VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
        VITE_SUPABASE_PUBLISHABLE_KEY: '', VITE_BASE_PATH: '/ferias-2026/',
      },
    },
  ],
});
