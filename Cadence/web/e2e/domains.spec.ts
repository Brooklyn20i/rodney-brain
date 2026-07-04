import { test, expect, type Page } from '@playwright/test';

// Drives the unified super-app's domain switcher (Work / Financial / Fitness)
// under VITE_E2E. Work uses the in-memory E2E provider; Financial and Fitness
// use their real stores but with no session -> ownerId null -> no queries, so
// their screens must still MOUNT and render an empty state without crashing.
// This is a render-smoke across every domain's every nav screen.

async function bootToControl(page: Page) {
  await page.goto('/');
  // Work boots straight in (no login gate under E2E).
  await expect(page.locator('.screen-header h1').first()).toBeVisible();
}

async function switchDomain(page: Page, label: 'Work' | 'Financial' | 'Fitness') {
  await page.locator('.domain-switch-btn', { hasText: label }).click();
  // active button reflects the switch
  await expect(
    page.locator('.domain-switch-btn.active', { hasText: label }),
  ).toBeVisible();
}

// Every screen renders a header when navigated to. Iterating the live nav-item
// buttons avoids hardcoding ids and proves nav<->router<->component all line up.
async function driveAllNavItems(page: Page, domain: string) {
  // Direct-child nav items only: the domain's own nav. Excludes #sidebar-footer's
  // Settings button, whose bare 'settings' id would flip the derived domain back
  // to Work mid-iteration.
  const items = page.locator('#sidebar > .nav-item');
  const count = await items.count();
  expect(count, `${domain} should have nav items`).toBeGreaterThan(0);
  const labels = await items.allInnerTexts();
  for (let i = 0; i < count; i++) {
    const label = (labels[i] || `#${i}`).trim().split('\n')[0];
    await page.locator('#sidebar > .nav-item').nth(i).click();
    await expect(
      page.locator('.screen-header h1').first(),
      `${domain} > ${label} should render a screen header`,
    ).toBeVisible({ timeout: 10_000 });
  }
}

test('Financial domain: switch in and every screen renders', async ({ page }) => {
  await bootToControl(page);
  await switchDomain(page, 'Financial');
  // landing screen (financial:overview) renders
  await expect(page.locator('.screen-header h1').first()).toBeVisible();
  await driveAllNavItems(page, 'Financial');
});

test('Fitness domain: switch in and every screen renders', async ({ page }) => {
  await bootToControl(page);
  await switchDomain(page, 'Fitness');
  await expect(page.locator('.screen-header h1').first()).toBeVisible();
  await driveAllNavItems(page, 'Fitness');
});

test('round-trips Work -> Financial -> Fitness -> Work without crashing', async ({ page }) => {
  await bootToControl(page);
  await switchDomain(page, 'Financial');
  await expect(page.locator('.screen-header h1').first()).toBeVisible();
  await switchDomain(page, 'Fitness');
  await expect(page.locator('.screen-header h1').first()).toBeVisible();
  await switchDomain(page, 'Work');
  await expect(page.locator('.screen-header h1').first()).toBeVisible();
});
