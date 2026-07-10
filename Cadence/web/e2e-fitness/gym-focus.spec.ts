import { expect, test, type Page } from '@playwright/test';

// Drives the REAL Health → Workout (Gym Focus) screen in the in-memory demo
// build at the two viewports Rodney actually trains on: a 320×568 phone in
// portrait and an 844×390 phone in landscape. Covers the reliability/polish
// defects: rapid steppers, phone layout, carry-forward, rest-timer durability,
// live clock, incomplete-finish confirmation and the landscape rotate guard.

const PORTRAIT = { width: 320, height: 568 };
const LANDSCAPE = { width: 844, height: 390 };
const PORTRAIT_TALL = { width: 390, height: 844 };

// Nav labels carry an icon glyph in their accessible name (e.g. "▶ Workout"),
// and the sidebar is an off-canvas drawer under a menu button on phones but
// persistent on wider screens — so open the drawer only when the menu button
// is actually showing.
async function navTo(page: Page, name: string) {
  // Wait for the shell to mount (the screen is lazy-loaded) so the menu
  // button's presence is settled before we decide whether to open the drawer.
  const menuBtn = page.locator('.menu-btn').first();
  await menuBtn.waitFor({ state: 'attached' });
  if (await menuBtn.isVisible()) {
    await menuBtn.click();
    await page.locator('#sidebar.open').waitFor(); // drawer slid in → nav on-screen
  }
  await page.getByRole('button', { name, exact: false }).first().click();
}

async function openWorkoutScreen(page: Page) {
  await page.goto('/health');
  await navTo(page, 'Workout');
}

async function startSuggestedSession(page: Page) {
  // The "▶ Start …" primary button is the suggested program day.
  await page.locator('button.btn-primary', { hasText: 'Start' }).first().click();
  await expect(page.locator('.wo-set-row').first()).toBeVisible();
}

const firstWeightInput = (page: Page) =>
  page.locator('.wo-set-row').first().locator('input[step="0.5"]');
const firstRepsInput = (page: Page) =>
  page.locator('.wo-set-row').first().locator('input[inputmode="numeric"]');

test.describe('Gym Focus — 320×568 portrait', () => {
  test.use({ viewport: PORTRAIT, hasTouch: true, isMobile: true });

  test('values are readable and touch targets clear 44px', async ({ page }) => {
    await openWorkoutScreen(page);
    await startSuggestedSession(page);

    const weight = firstWeightInput(page);
    await expect(weight).toHaveValue('105');
    const box = await weight.boundingBox();
    expect(box, 'weight input should be measurable').not.toBeNull();
    // The baseline collapsed this to 6px — it must now be genuinely usable
    // (comfortably fits a value like "112.5").
    expect(box!.width).toBeGreaterThanOrEqual(60);

    for (const label of ['Weight up 2.5kg', 'Weight down 2.5kg', 'One rep more']) {
      const b = await page.getByRole('button', { name: label }).first().boundingBox();
      expect(b, `${label} button should be measurable`).not.toBeNull();
      expect(b!.width, `${label} width`).toBeGreaterThanOrEqual(44);
      expect(b!.height, `${label} height`).toBeGreaterThanOrEqual(44);
    }
  });

  test('rapid stepper taps accumulate instead of collapsing', async ({ page }) => {
    await openWorkoutScreen(page);
    await startSuggestedSession(page);

    // Fire three taps synchronously (before React re-renders) — the stale-state case.
    await page.evaluate(() => {
      const btn = document.querySelector('[aria-label="Weight up 2.5kg"]') as HTMLButtonElement;
      btn.click();
      btn.click();
      btn.click();
    });
    await expect(firstWeightInput(page)).toHaveValue('112.5');

    await page.evaluate(() => {
      const btn = document.querySelector('[aria-label="One rep more"]') as HTMLButtonElement;
      btn.click();
      btn.click();
      btn.click();
    });
    await expect(firstRepsInput(page)).toHaveValue('3');
  });

  test('a deliberate load change carries forward to still-inherited sets', async ({ page }) => {
    await openWorkoutScreen(page);
    await startSuggestedSession(page);

    const rows = page.locator('.wo-set-row');
    await expect(rows.nth(1).locator('input[step="0.5"]')).toHaveValue('105');

    const first = firstWeightInput(page);
    await first.fill('110');
    await first.blur();

    // Untouched, unfinished siblings follow to 110; done/edited rows never would.
    await expect(rows.nth(1).locator('input[step="0.5"]')).toHaveValue('110');
    await expect(rows.nth(2).locator('input[step="0.5"]')).toHaveValue('110');
  });

  test('the elapsed clock is live, not a frozen "0 min"', async ({ page }) => {
    await openWorkoutScreen(page);
    await startSuggestedSession(page);
    const header = page.locator('.screen-header, header').first();
    await expect(header).toContainText(/\d+:\d\d/);
    await expect(header).not.toContainText('0 min');
  });

  test('the rest timer survives a Dashboard → Workout round-trip', async ({ page }) => {
    await openWorkoutScreen(page);
    await startSuggestedSession(page);

    // Complete the first set → the rest timer starts.
    await page.getByRole('button', { name: 'Mark set done' }).first().click();
    await expect(page.locator('.rest-timer')).toBeVisible();
    const before = await page.locator('.rest-timer-time').innerText();
    expect(before).toMatch(/\d:\d\d/);

    // Route away and back.
    await navTo(page, 'Dashboard');
    await navTo(page, 'Workout');

    // The timer is restored from its absolute deadline (not reset to 0:00).
    await expect(page.locator('.rest-timer')).toBeVisible();
    await expect(page.locator('.rest-timer-time')).not.toHaveText('0:00');
  });

  test('finishing with incomplete sets asks for confirmation', async ({ page }) => {
    await openWorkoutScreen(page);
    await startSuggestedSession(page);

    let dialogMessage = '';
    page.once('dialog', (dialog) => {
      dialogMessage = dialog.message();
      void dialog.dismiss();
    });
    await page.getByRole('button', { name: /Finish/ }).first().click();

    await expect.poll(() => dialogMessage).toContain('completed');
    // Dismissed → the session is still active (we did not silently finish).
    await expect(page.locator('.wo-set-row').first()).toBeVisible();
  });

  test('the nav does not overlap the set rows', async ({ page }) => {
    await openWorkoutScreen(page);
    await startSuggestedSession(page);
    const nav = await page.locator('.gym-nav').boundingBox();
    const lastRow = await page.locator('.wo-set-row').last().boundingBox();
    expect(nav).not.toBeNull();
    expect(lastRow).not.toBeNull();
    // Static nav sits below the sets — its top is at/under the last row's bottom.
    expect(nav!.y).toBeGreaterThanOrEqual(lastRow!.y + lastRow!.height - 1);
  });
});

test.describe('Gym Focus — 844×390 landscape', () => {
  test.use({ viewport: LANDSCAPE, hasTouch: true, isMobile: true });

  test('the workout is startable in landscape (rotate guard does not block)', async ({ page }) => {
    // Reach the Workout screen upright (the dashboard is allowed its portrait
    // guard), then rotate to landscape — the Workout screen itself opts out of
    // the guard so Start stays reachable.
    await page.setViewportSize(PORTRAIT_TALL);
    await page.goto('/health');
    await navTo(page, 'Workout');

    await page.setViewportSize(LANDSCAPE);
    await expect(page.locator('.rotate-guard')).toBeHidden();

    await startSuggestedSession(page);
    await expect(page.locator('.wo-set-row').first()).toBeVisible();
    await expect(page.locator('.rotate-guard')).toBeHidden();
  });
});
