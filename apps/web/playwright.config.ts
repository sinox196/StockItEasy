import { defineConfig } from '@playwright/test';

/**
 * Web E2E tests. They expect the API and the web app to be running with the
 * local demo seed (pnpm db:seed) — see docs/TESTING.md.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: 0,
  workers: 1,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    viewport: { width: 1440, height: 900 },
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : undefined,
  },
});
