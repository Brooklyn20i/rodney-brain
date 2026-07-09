import { test, expect, type Page } from './fixtures';
import { makeSeed } from './seed';

test.beforeEach(async ({ page }) => {
  const seed = makeSeed();
  await page.addInitScript((s) => { (window as any).__CADENCE_E2E__ = s; }, seed);
  await page.goto('/work.html');
});

async function navTo(page: Page, label: string) {
  await page.locator('#sidebar').getByRole('button', { name: new RegExp(`\\b${label}\\b`) }).click();
}

// ── Meeting notes: typing persists (regression: edits/bullets were vanishing) ────
test('meeting note edits persist after closing and reopening', async ({ page }) => {
  await navTo(page, 'People');
  await page.locator('.person-item', { hasText: 'Anna Lee' }).click();
  await page.locator('.people-tab', { hasText: 'Meetings' }).click();

  // The meetings tab may auto-open the upcoming 1:1; wait briefly for that
  // effect before clicking the card. Without this, CI can race the auto-open:
  // the modal appears between isVisible() and click(), then intercepts the click.
  const overlay = page.locator('.mtg-overlay');
  const autoOpened = await overlay.waitFor({ state: 'visible', timeout: 1_000 })
    .then(() => true)
    .catch(() => false);
  if (!autoOpened) {
    await page.locator('.mtg-card', { hasText: '1:1 · Anna Lee' }).click();
  }
  await expect(overlay).toBeVisible();

  // Add an agenda item and type into it.
  await page.getByText('+ Add agenda item').click();
  await page.locator('.agenda-topic-input').last().fill('Discuss Q3 roadmap');

  // Save & Close flushes the edit; the modal closes.
  await page.getByRole('button', { name: /Save & Close/ }).first().click();
  await expect(overlay).toBeHidden();

  // Reopen the same meeting — the typed content must still be there.
  await page.locator('.mtg-card', { hasText: '1:1 · Anna Lee' }).click();
  await expect(overlay).toBeVisible();
  await expect(page.locator('.agenda-topic-input').first()).toHaveValue('Discuss Q3 roadmap');
});

// ── Quick Add captures to Quick Capture, even when tagged with a person/project ──
test('a person/project-tagged quick note waits in Quick Capture, not the folder', async ({ page }) => {
  await navTo(page, 'Quick Capture');
  await page.getByRole('button', { name: 'Capture task' }).click();
  const input = page.getByPlaceholder(/Try "Follow up/);
  await input.fill('Talk to Anna about Apollo');
  // Button reflects capture-first behaviour.
  await expect(page.getByRole('button', { name: /Add to Quick Capture/ })).toBeVisible();
  await input.press('Enter');

  // It lands in the Quick Capture triage queue.
  await expect(page.getByText('Talk to Anna about Apollo')).toBeVisible();

  // …and does NOT leak into Anna's folder (still untriaged), while her genuinely
  // filed task does show there.
  await navTo(page, 'People');
  await page.locator('.person-item', { hasText: 'Anna Lee' }).click();
  await expect(page.getByText('Approve Q3 budget')).toBeVisible();
  await expect(page.getByText('Talk to Anna about Apollo')).toHaveCount(0);
});
