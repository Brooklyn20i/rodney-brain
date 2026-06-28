import { defineConfig, devices } from '@playwright/test';

// Drives the real app in Chromium with the in-memory E2E provider (VITE_E2E=1),
// so no Supabase backend is needed. Browser comes from the pre-installed
// PLAYWRIGHT_BROWSERS_PATH (/opt/pw-browsers) — do NOT run `playwright install`.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    headless: true,
    trace: 'retain-on-failure',
    // Use the browser pre-installed in this environment rather than letting
    // Playwright resolve a version it expects to download. Overridable per-env.
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'VITE_E2E=1 npx vite --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
