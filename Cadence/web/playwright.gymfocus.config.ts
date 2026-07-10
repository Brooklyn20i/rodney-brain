import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

// Gym Focus e2e needs the seeded demo data (a real program with bench sets to
// carry forward, a rest timer to run, etc.), so this config boots the app with
// BOTH the in-memory E2E provider (no Supabase) and demo seeding, on its own
// port so it never clashes with the Work e2e server. Separate testDir keeps it
// out of the default `npm run test:e2e` run.
const executablePath = [
  process.env.PLAYWRIGHT_CHROMIUM_PATH,
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
].find((candidate): candidate is string => Boolean(candidate) && existsSync(candidate));

export default defineConfig({
  testDir: './e2e-fitness',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4175',
    headless: true,
    trace: 'retain-on-failure',
    launchOptions: executablePath ? { executablePath } : {},
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'VITE_E2E=1 VITE_DEMO=1 npx vite --port 4175 --strictPort',
    url: 'http://localhost:4175',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
