import { test, expect, type Page } from './fixtures';
import { makeSeed } from './seed';

// The full 1:1 loop: raise a task at the next 1:1 from Home → it queues on the
// person → opens onto the upcoming meeting's agenda → actions agreed in the
// meeting auto-split on close (mine → Home, theirs → their owes-me ledger).

test.beforeEach(async ({ page }) => {
  const seed = makeSeed();
  await page.addInitScript((s) => { (window as any).__CADENCE_E2E__ = s; }, seed);
  await page.goto('/work.html');
});

async function navTo(page: Page, label: string) {
  await page.locator('#sidebar').getByRole('button', { name: new RegExp(`\\b${label}\\b`) }).click();
}

test('raise → queue → agenda merge → auto-split into ledger and Home', async ({ page }) => {
  // 1. Raise Anna's overdue task at her next 1:1, straight from Home's detail panel.
  await page.getByText('Overdue review').click();
  await page.locator('.task-detail').getByRole('button', { name: /1:1/ }).click();
  await expect(page.locator('.task-detail').getByText('✓ Queued')).toBeVisible();

  // 2. It waits in Anna's "Queued for next 1:1".
  await navTo(page, 'People');
  await page.locator('.person-item', { hasText: 'Anna Lee' }).click();
  await expect(page.getByText('Queued for next 1:1')).toBeVisible();

  // 3. The Meetings tab auto-opens the upcoming 1:1 — the queue merges into
  //    its agenda on open.
  await page.getByRole('button', { name: /^Meetings/ }).click();
  await expect(page.locator('.mtg-agenda-section input[value="Overdue review"]')).toBeVisible();

  // 4. …agree two actions in the meeting: one mine, one Anna's.
  await page.getByRole('button', { name: '+ For me' }).click();
  await page.locator('.action-title-input').last().fill('Draft the summary');
  await page.getByRole('button', { name: '+ For Anna' }).click();
  await page.locator('.action-title-input').last().fill('Send corrected numbers');

  // 5. Save & Close auto-splits with zero filing.
  await page.getByRole('button', { name: 'Save & Close' }).first().click();

  // Anna's action landed in her owes-me ledger…
  await page.getByRole('button', { name: /^Ledger/ }).click();
  await expect(page.getByText('📤 Anna owes me')).toBeVisible();
  await expect(page.locator('.topic-card', { hasText: 'Send corrected numbers' })).toBeVisible();
  // …and mine is in my Home list.
  await navTo(page, 'Home');
  await expect(page.getByText('Draft the summary')).toBeVisible();
});
