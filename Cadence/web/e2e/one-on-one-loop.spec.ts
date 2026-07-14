import { test, expect, type Page } from './fixtures';
import { makeSeed } from './seed';

// The v3 1:1 loop — the ledger IS the meeting system:
// raise a task from Home → it appears on the person's "To raise" list →
// in the 1:1 you work the two-way ledger, flipping who owes whom in place
// (one tap, logged to the task's history) → tick raised items as covered.

test.beforeEach(async ({ page }) => {
  const seed = makeSeed();
  await page.addInitScript((s) => { (window as any).__CADENCE_E2E__ = s; }, seed);
  await page.goto('/work.html');
});

async function navTo(page: Page, label: string) {
  await page.locator('#sidebar').getByRole('button', { name: new RegExp(`\\b${label}\\b`) }).click();
}

test('raise → to-raise list → ledger flip in the 1:1 → Home Waiting', async ({ page }) => {
  // 1. Raise Anna's overdue task at her next 1:1, straight from Home's detail panel.
  await page.getByText('Overdue review').click();
  await page.locator('.task-detail').getByRole('button', { name: /1:1/ }).click();
  await expect(page.locator('.task-detail').getByText('✓ Queued')).toBeVisible();

  // 2. It waits on Anna's "To raise at next 1:1" prep list, above her ledger.
  await navTo(page, 'People');
  await page.locator('.person-item', { hasText: 'Anna Lee' }).click();
  await expect(page.getByText('To raise at next 1:1')).toBeVisible();
  await expect(page.locator('.work-item-row', { hasText: 'Overdue review' })).toBeVisible();

  // 3. In the 1:1: the task sits on my side of the ledger ("I owe Anna").
  const iOwe = page.locator('.ledger-section', { hasText: 'I owe Anna' });
  await expect(iOwe.locator('.topic-card', { hasText: 'Overdue review' })).toBeVisible();

  // 4. We agree Anna now owes me the correction — one tap ⇄ flips it in place.
  await iOwe.locator('.topic-card', { hasText: 'Overdue review' }).locator('.topic-flip').click();
  const owesMe = page.locator('.ledger-section', { hasText: 'Anna owes me' });
  await expect(owesMe.locator('.topic-card', { hasText: 'Overdue review' })).toBeVisible();

  // The handoff is on the task's history.
  await owesMe.locator('.topic-card', { hasText: 'Overdue review' }).locator('.topic-body').click();
  await expect(page.locator('.task-update-text', { hasText: '→ Anna Lee owes me' })).toBeVisible();
  await page.locator('.modal-close').click();

  // 5. Raised item covered — tick it off the prep list.
  await page.locator('.work-item-row', { hasText: 'Overdue review' }).getByRole('checkbox').click();
  await expect(page.getByText('To raise at next 1:1')).toBeHidden();

  // 6. Same record now sits in Home's Waiting lane — no new task was created.
  await navTo(page, 'Home');
  await page.locator('.hub-seg', { hasText: 'Waiting' }).click();
  await expect(page.getByText('Overdue review')).toBeVisible();
});
