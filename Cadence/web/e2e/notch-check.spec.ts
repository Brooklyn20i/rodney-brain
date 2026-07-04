import { test, expect, type Page } from '@playwright/test';

const NOTCH = 47;

async function simulateNotch(page: Page) {
  await page.addStyleTag({ content: `
    :root { --safe-top: ${NOTCH}px !important; --safe-bottom: 0px !important; }
    @media (max-width: 768px) { #sidebar { padding-top: calc(20px + ${NOTCH}px) !important; } }
  `});
}

async function readPositions(page: Page) {
  // Force the sidebar open (bypass click flakiness) and read rects.
  return await page.evaluate(() => {
    const sb = document.querySelector('#sidebar');
    sb?.classList.add('open');
    const logo = document.querySelector('#sidebar-title')?.getBoundingClientRect();
    const header = document.querySelector('.screen-header')?.getBoundingClientRect();
    const app = getComputedStyle(document.querySelector('#app')!).paddingTop;
    return {
      logoTop: logo ? Math.round(logo.top) : -1,
      headerTop: header ? Math.round(header.top) : -1,
      appPadTop: app,
    };
  });
}

test('notch clearance across Work / Financial / Fitness', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await simulateNotch(page);
  await expect(page.locator('.screen-header').first()).toBeVisible();

  const results: Record<string, unknown> = {};
  results.work = await readPositions(page);

  await page.locator('.domain-switch-btn', { hasText: 'Financial' }).click();
  await page.waitForTimeout(300);
  results.financial = await readPositions(page);

  // reopen sidebar to reach the switcher, then go Fitness
  await page.evaluate(() => document.querySelector('#sidebar')?.classList.add('open'));
  await page.locator('.domain-switch-btn', { hasText: 'Fitness' }).click();
  await page.waitForTimeout(300);
  results.fitness = await readPositions(page);

  console.log('NOTCH_MEASUREMENTS ' + JSON.stringify(results));
});
