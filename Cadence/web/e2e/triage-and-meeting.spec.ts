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

// ── Meeting documents: typing persists, and inline task capture → Inbox ────────
test('meeting doc edits persist and captured tasks land in the Inbox', async ({ page }) => {
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
  await expect(page.locator('.mtg-modal-doc')).toBeVisible();

  // Write like a page — straight into the document.
  await page.locator('.mtg-modal-doc .ProseMirror').click();
  await page.keyboard.type('Q3 roadmap needs a second pass before CLT.');

  // Capture a task mid-meeting — it goes to the Inbox, not into some agenda.
  const capture = page.getByPlaceholder(/Capture a task/);
  await capture.fill('Chase the Q3 roadmap owners');
  await capture.press('Enter');
  await expect(page.locator('.mtg-captured-chip', { hasText: 'Chase the Q3 roadmap owners' })).toBeVisible();

  // …or straight onto Anna's ledger, skipping the Inbox entirely.
  await capture.fill('Anna to confirm the venue');
  await page.getByRole('button', { name: /Give to Anna/ }).click();
  await expect(page.locator('.mtg-captured-chip', { hasText: 'Anna to confirm the venue' })).toBeVisible();

  // Save & Close flushes the edit; the modal closes.
  await page.getByRole('button', { name: /Save & Close/ }).first().click();
  await expect(overlay).toBeHidden();

  // Reopen the same meeting — the typed content must still be there.
  await page.locator('.mtg-card', { hasText: '1:1 · Anna Lee' }).click();
  await expect(overlay).toBeVisible();
  await expect(page.locator('.mtg-modal-doc .ProseMirror')).toContainText('Q3 roadmap needs a second pass');
  await page.getByRole('button', { name: /Save & Close/ }).first().click();

  // The captured task waits in the Inbox for triage…
  await navTo(page, 'Inbox');
  await expect(page.getByText('Chase the Q3 roadmap owners')).toBeVisible();
  // …while the given task went straight to Anna's owes-me ledger, not the Inbox.
  await expect(page.getByText('Anna to confirm the venue')).toHaveCount(0);
  await navTo(page, 'People');
  await page.locator('.person-item', { hasText: 'Anna Lee' }).click();
  await expect(
    page.locator('.ledger-section', { hasText: 'Anna owes me' }).getByText('Anna to confirm the venue'),
  ).toBeVisible();
});

// ── Quick Add: give a capture straight to a person's ledger ────────────────────
test('Quick Add "Give to" files instantly to the ledger, skipping the Inbox', async ({ page }) => {
  await navTo(page, 'Inbox');
  await page.getByRole('button', { name: 'Capture task' }).click();
  await page.getByPlaceholder(/Try "Follow up/).fill('Anna to send the market scan');
  await page.getByRole('button', { name: /Give to Anna/ }).click();

  // Not in the Inbox…
  await expect(page.getByText('Anna to send the market scan')).toHaveCount(0);

  // …but on Anna's owes-me ledger, and in Home's Waiting lane.
  await navTo(page, 'People');
  await page.locator('.person-item', { hasText: 'Anna Lee' }).click();
  await expect(
    page.locator('.ledger-section', { hasText: 'Anna owes me' }).getByText('Anna to send the market scan'),
  ).toBeVisible();
  await navTo(page, 'Home');
  await page.locator('.hub-seg', { hasText: 'Waiting' }).click();
  await expect(page.getByText('Anna to send the market scan')).toBeVisible();
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

  // Triage ONE task on its own, straight from its row — no deck order imposed.
  const pricingRow = page.locator('.inbox-triage-row', { hasText: 'Pricing pack for review' });
  await pricingRow.getByRole('button', { name: 'Triage →' }).click();
  await expect(page.getByText('Card 1 of 1')).toBeVisible();
  // → Anna, something she owes me (lands on her ledger as a waiting-for).
  await page.getByRole('button', { name: 'Person…' }).click();
  await page.getByRole('button', { name: 'Anna Lee' }).click();
  await page.getByRole('button', { name: 'Something they owe me' }).click();
  // Single-item triage closes itself — no done screen, and the row is gone.
  await expect(page.getByText('Card 1 of 1')).toBeHidden();
  await expect(page.getByText('Pricing pack for review')).toHaveCount(0);

  // The remaining capture goes through the full deck.
  await page.getByRole('button', { name: 'Triage all (1)' }).click();
  await expect(page.getByText('Card 1 of 1')).toBeVisible();
  await page.getByRole('button', { name: 'Make it a note' }).click();
  await expect(page.getByText('Triage complete')).toBeVisible();
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
