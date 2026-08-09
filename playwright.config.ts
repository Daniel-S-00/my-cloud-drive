import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';

// Playwright no carga .env.local automáticamente; el test runner lo necesita
// para leer E2E_TEST_EMAIL / E2E_TEST_PASSWORD (el dev server los lee por Next).
dotenv.config({ path: '.env.local' });

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  // Serial by default: every spec logs in via a Next server action, and
  // concurrent logins against the Supabase pooler intermittently stall
  // (the sign-in POST never resolves). One worker keeps the suite
  // deterministic; it's small enough that the cost is negligible.
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});