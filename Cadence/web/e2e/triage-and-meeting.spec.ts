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

// ── Quick Add captures to the Inbox, even when tagged with a person/project ──
test('a person/project-tagged quick note waits in the Inbox, not the folder', async ({ page }) => {
  await navTo(page, 'Inbox');
  await page.getByRole('button', { name: 'Capture task' }).click();
  const input = page.getByPlaceholder(/Try "Follow up/);
  await input.fill('Talk to Anna about Apollo');
  // Button reflects capture-first behaviour.
  await expect(page.getByRole('button', { name: /Add to Inbox/ })).toBeVisible();
  await input.press('Enter');

  // It lands in the Inbox triage queue.
  await expect(page.getByText('Talk to Anna about Apollo')).toBeVisible();

  // …and does NOT leak into Anna's folder (still untriaged), while her genuinely
  // filed task does show there.
  await navTo(page, 'People');
  await page.locator('.person-item', { hasText: 'Anna Lee' }).click();
  await expect(page.getByText('Approve Q3 budget')).toBeVisible();
  await expect(page.getByText('Talk to Anna about Apollo')).toHaveCount(0);
});

// ── Triage wizard: the end-of-day ritual empties the inbox card by card ────────
test('triage wizard files captures to a ledger and a note, emptying the inbox', async ({ page }) => {
  await navTo(page, 'Inbox');

  // Capture two loose items (QuickAdd closes after each).
  for (const title of ['Pricing pack for review', 'Offsite reflections']) {
    await page.getByRole('button', { name: 'Capture task' }).click();
    const input = page.getByPlaceholder(/Try "Follow up/);
    await input.fill(title);
    await input.press('Enter');
    await expect(page.getByText(title)).toBeVisible();
  }

  // Run the wizard. Card order is newest-first but two rapid captures can tie
  // on created_at, so branch on whichever card is showing.
  await page.getByRole('button', { name: 'Start triage (2)' }).click();
  await expect(page.getByText('Card 1 of 2')).toBeVisible();
  for (let i = 0; i < 2; i++) {
    const title = await page.locator('.wizard-card-title').inputValue();
    if (title === 'Pricing pack for review') {
      // → Anna, something she owes me (lands on her ledger as a waiting-for).
      await page.getByRole('button', { name: 'Person…' }).click();
      await page.getByRole('button', { name: 'Anna Lee' }).click();
      await page.getByRole('button', { name: 'Something they owe me' }).click();
    } else {
      await page.getByRole('button', { name: 'Make it a note' }).click();
    }
  }
  await expect(page.getByText('Triage complete')).toBeVisible();
  await expect(page.getByText('2 filed · 0 skipped')).toBeVisible();
  await page.getByRole('button', { name: 'Done' }).click();

  // The inbox is empty — the ritual is complete.
  await expect(page.getByText('Inbox is clear')).toBeVisible();

  // The ledger item is on Anna's "owes me" side…
  await navTo(page, 'People');
  await page.locator('.person-item', { hasText: 'Anna Lee' }).click();
  await expect(
    page.locator('.ledger-section', { hasText: 'Anna owes me' }).getByText('Pricing pack for review'),
  ).toBeVisible();

  // …and the note now lives in Notes.
  await navTo(page, 'Notes');
  await expect(page.getByText('Offsite reflections')).toBeVisible();
});
