import { expect, test, type Page } from '@playwright/test';

// Drives the REAL Health → Workout (Gym Focus) screen in the in-memory demo
// build at the viewports Rodney actually trains on. Covers the reliability
// defects and Phil's remediation asks: rapid steppers, phone layout at
// 320/375/390, carry-forward that preserves done/edited rows, typing+Done race,
// rest-timer durability, live clock, incomplete/empty finish confirmation,
// same-tick add-set dedupe, landscape full-viewport, and accessibility.
//
// Selectors use CONTEXTUAL accessible names (e.g. "…, set 1, weight in
// kilograms") so repeated per-set controls are never ambiguous.

const LANDSCAPE = { width: 844, height: 390 };
const PORTRAIT_TALL = { width: 390, height: 844 };
const MOBILE = { hasTouch: true, isMobile: true } as const;

// Nav labels carry an icon glyph in their accessible name (e.g. "▶ Workout"),
// and the sidebar is an off-canvas drawer under a menu button on phones but
// persistent on wider screens — open the drawer only when the button shows.
async function navTo(page: Page, name: string) {
  const menuBtn = page.locator('.menu-btn').first();
  await menuBtn.waitFor({ state: 'attached' });
  if (await menuBtn.isVisible()) {
    await menuBtn.click();
    await page.locator('#sidebar.open').waitFor();
  }
  await page.getByRole('button', { name, exact: false }).first().click();
}

async function openWorkoutScreen(page: Page) {
  await page.goto('/health');
  await navTo(page, 'Workout');
}

async function startSuggestedSession(page: Page) {
  await page.locator('button.btn-primary', { hasText: 'Start' }).first().click();
  await expect(page.locator('.wo-set-row').first()).toBeVisible();
}

// Per-set field/control locators by contextual accessible name.
const weightInput = (page: Page, n: number) =>
  page.getByRole('spinbutton', { name: new RegExp(`set ${n}, weight in kilograms`, 'i') });
const repsInput = (page: Page, n: number) =>
  page.getByRole('spinbutton', { name: new RegExp(`set ${n}, reps`, 'i') });
const doneCheck = (page: Page, n: number) =>
  page.getByRole('button', { name: new RegExp(`set ${n}, mark (done|not done)`, 'i') });
const weightUp = (page: Page, n: number) =>
  page.getByRole('button', { name: new RegExp(`set ${n}, weight up 2\\.5 kilograms`, 'i') });
const repUp = (page: Page, n: number) =>
  page.getByRole('button', { name: new RegExp(`set ${n}, one rep more`, 'i') });

// ── Layout across the three phone widths ──────────────────────────────────
for (const vp of [
  { width: 320, height: 568 },
  { width: 375, height: 667 },
  { width: 390, height: 844 },
]) {
  test.describe(`Gym Focus layout — ${vp.width}×${vp.height}`, () => {
    test.use({ viewport: vp, ...MOBILE });

    test('values are readable and every touch target clears 44px', async ({ page }) => {
      await openWorkoutScreen(page);
      await startSuggestedSession(page);

      const weight = weightInput(page, 1);
      await expect(weight).toHaveValue('105');
      const box = await weight.boundingBox();
      expect(box, 'weight input should be measurable').not.toBeNull();
      // Baseline collapsed this to ~6px — must now comfortably fit "112.5".
      expect(box!.width).toBeGreaterThanOrEqual(60);

      for (const control of [weightUp(page, 1), repUp(page, 1), doneCheck(page, 1)]) {
        const b = await control.boundingBox();
        expect(b).not.toBeNull();
        expect(b!.width).toBeGreaterThanOrEqual(44);
        expect(b!.height).toBeGreaterThanOrEqual(44);
      }
    });
  });
}

// ── Behaviour (320×568 portrait) ──────────────────────────────────────────
test.describe('Gym Focus — 320×568 portrait', () => {
  test.use({ viewport: { width: 320, height: 568 }, ...MOBILE });

  test('rapid stepper taps accumulate instead of collapsing', async ({ page }) => {
    await openWorkoutScreen(page);
    await startSuggestedSession(page);

    // Fire three taps synchronously (before React re-renders) — the stale case.
    await page.evaluate(() => {
      const byName = (re: RegExp) =>
        [...document.querySelectorAll('button')].find((b) => re.test(b.getAttribute('aria-label') || ''));
      const w = byName(/set 1, weight up 2\.5 kilograms/i) as HTMLButtonElement;
      w.click();
      w.click();
      w.click();
      const r = byName(/set 1, one rep more/i) as HTMLButtonElement;
      r.click();
      r.click();
      r.click();
    });
    await expect(weightInput(page, 1)).toHaveValue('112.5');
    await expect(repsInput(page, 1)).toHaveValue('3');
  });

  test('carry-forward moves inherited siblings but preserves done and edited rows', async ({ page }) => {
    await openWorkoutScreen(page);
    await startSuggestedSession(page);

    // All four bench sets inherit 105.
    for (const n of [1, 2, 3, 4]) await expect(weightInput(page, n)).toHaveValue('105');

    // Deliberately edit set 2 to a different load, and tick set 3 done at 105.
    await weightInput(page, 2).fill('100');
    await weightInput(page, 2).blur();
    await doneCheck(page, 3).click();

    // Now change the first set — only the still-inherited, unfinished set 4 follows.
    await weightInput(page, 1).fill('115');
    await weightInput(page, 1).blur();

    await expect(weightInput(page, 1)).toHaveValue('115');
    await expect(weightInput(page, 2)).toHaveValue('100'); // user-edited, preserved
    await expect(weightInput(page, 3)).toHaveValue('105'); // done, preserved
    await expect(weightInput(page, 4)).toHaveValue('115'); // inherited, followed
  });

  test('direct typing then Done logs the typed reps (no stale-draft race)', async ({ page }) => {
    await openWorkoutScreen(page);
    await startSuggestedSession(page);

    await repsInput(page, 1).fill('12'); // typed but NOT blurred
    await doneCheck(page, 1).click(); // tick before the field commits
    await expect(page.locator('.wo-set-row').first()).toHaveClass(/wo-set-done/);
    await expect(repsInput(page, 1)).toHaveValue('12');
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

    await doneCheck(page, 1).click();
    await expect(page.locator('.rest-timer')).toBeVisible();
    expect(await page.locator('.rest-timer-time').innerText()).toMatch(/\d:\d\d/);

    await navTo(page, 'Dashboard');
    await navTo(page, 'Workout');

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
    await expect(page.locator('.wo-set-row').first()).toBeVisible();
  });

  test('finishing an EMPTY ad-hoc session is confirmed, not silent', async ({ page }) => {
    await openWorkoutScreen(page);
    await page.getByRole('button', { name: 'Start empty session' }).click();
    await expect(page.getByText(/No exercises in this session yet/i)).toBeVisible();

    let dialogMessage = '';
    page.once('dialog', (dialog) => {
      dialogMessage = dialog.message();
      void dialog.dismiss();
    });
    await page.getByRole('button', { name: /Finish/ }).first().click();

    await expect.poll(() => dialogMessage).toContain('empty');
    // Dismissed → still on the (empty) active session, not silently completed.
    await expect(page.getByText(/No exercises in this session yet/i)).toBeVisible();
  });

  test('double-tapping Add set never inserts a duplicate set', async ({ page }) => {
    await openWorkoutScreen(page);
    await startSuggestedSession(page);

    const rows = page.locator('.wo-set-row');
    await expect(rows).toHaveCount(4);
    // Two synchronous clicks before React can disable the button.
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim().startsWith('+ Add set'));
      (btn as HTMLButtonElement).click();
      (btn as HTMLButtonElement).click();
    });
    await expect(rows).toHaveCount(5);
    await page.waitForTimeout(250);
    await expect(rows).toHaveCount(5); // no delayed 6th row
  });

  test('the docked nav stays reachable and never permanently buries a set row', async ({ page }) => {
    await openWorkoutScreen(page);
    await startSuggestedSession(page);

    // The dock (rest timer + Prev/Next) is pinned inside the viewport at all
    // times — no scrolling to reach the nav mid-set.
    const dock = await page.locator('.gym-dock').boundingBox();
    expect(dock).not.toBeNull();
    expect(dock!.y + dock!.height).toBeLessThanOrEqual(568 + 1);

    // And because the dock occupies real layout space at the end of the flow,
    // scrolling to the bottom brings every set row fully above it — nothing is
    // permanently hidden underneath.
    await page
      .locator('.screen-content')
      .evaluate((el) => el.scrollTo(0, el.scrollHeight));
    const dockAfter = await page.locator('.gym-dock').boundingBox();
    const lastRow = await page.locator('.wo-set-row').last().boundingBox();
    expect(lastRow).not.toBeNull();
    expect(dockAfter!.y).toBeGreaterThanOrEqual(lastRow!.y + lastRow!.height - 1);
  });

  test('set controls and the progress navigator are accessible', async ({ page }) => {
    await openWorkoutScreen(page);
    await startSuggestedSession(page);

    // Repeated numeric inputs have a real, contextual accessible name.
    await expect(weightInput(page, 1)).toHaveAccessibleName(/set 1, weight in kilograms/i);
    await expect(repsInput(page, 1)).toHaveAccessibleName(/set 1, reps/i);

    // Progress segments: current step marked, and a >=44px hit area.
    const current = page.locator('.gym-seg-item[aria-current="step"]');
    await expect(current).toHaveCount(1);
    const seg = await page.locator('.gym-seg-item').first().boundingBox();
    expect(seg!.height).toBeGreaterThanOrEqual(44);
  });
});

// ── Landscape (844×390) ───────────────────────────────────────────────────
test.describe('Gym Focus — 844×390 landscape', () => {
  test.use({ viewport: LANDSCAPE, ...MOBILE });

  test('is startable in landscape and uses the full viewport', async ({ page }) => {
    // Reach the Workout screen upright, then rotate: the screen opts out of the
    // rotate guard AND takes the sidebar off-canvas so #main spans the width.
    await page.setViewportSize(PORTRAIT_TALL);
    await page.goto('/health');
    await navTo(page, 'Workout');

    await page.setViewportSize(LANDSCAPE);
    await expect(page.locator('.rotate-guard')).toBeHidden();

    await startSuggestedSession(page);
    await expect(page.locator('.wo-set-row').first()).toBeVisible();
    await expect(page.locator('.rotate-guard')).toBeHidden();

    // #main now starts at the left edge and spans (almost) the full 844px —
    // the desktop sidebar no longer reserves 204px of width. (Post-fix QA
    // measured main at x:204,w:640; it should now be x:~0,w:~844.)
    const main = await page.locator('#main').boundingBox();
    expect(main!.x).toBeLessThanOrEqual(1);
    expect(main!.width).toBeGreaterThanOrEqual(800);
    // Sidebar is translated off-canvas (negative origin), not in normal flow.
    const sidebar = await page.locator('#sidebar').boundingBox();
    expect(sidebar!.x).toBeLessThan(0);
  });
});
