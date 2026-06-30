import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

// Drives the real app in Chromium with the in-memory E2E provider (VITE_E2E=1),
// so no Supabase backend is needed. Prefer an explicit env override, then the
// CI/Linux browser cache, then the user's local macOS Chrome. If none exist,
// let Playwright fall back to its own browser resolution.
const executablePath = [
  process.env.PLAYWRIGHT_CHROMIUM_PATH,
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
].find((candidate): candidate is string => Boolean(candidate) && existsSync(candidate));

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
    launchOptions: executablePath ? { executablePath } : {},
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'VITE_E2E=1 npx vite --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
