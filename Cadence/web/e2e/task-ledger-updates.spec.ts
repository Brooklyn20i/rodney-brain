import { test, expect, type Page } from './fixtures';
import { makeSeed } from './seed';

// Swap a task's ledger direction in place (I owe → they owe me) and keep a
// running updates/history log on the same task.

test.beforeEach(async ({ page }) => {
  const seed = makeSeed();
  await page.addInitScript((s) => { (window as any).__CADENCE_E2E__ = s; }, seed);
  await page.goto('/work.html');
});

async function navTo(page: Page, label: string) {
  await page.locator('#sidebar').getByRole('button', { name: new RegExp(`\\b${label}\\b`) }).click();
}

test('flip who owes whom without recreating the task, and log an update', async ({ page }) => {
  await navTo(page, 'Home');
  // 'Overdue review' is Anna's, a plain task = something I owe Anna.
  await page.locator('.task-hub-row', { hasText: 'Overdue review' }).click();

  const detail = page.locator('.task-detail');
  await expect(detail.getByRole('button', { name: '📥 I owe Anna' })).toHaveAttribute('aria-pressed', 'true');

  // Flip it: now Anna owes me.
  await detail.getByRole('button', { name: '📤 Anna owes me' }).click();
  await expect(detail.getByRole('button', { name: '📤 Anna owes me' })).toHaveAttribute('aria-pressed', 'true');
  // The swap is logged into the task's history thread.
  await expect(detail.locator('.task-update-text', { hasText: '→ Anna Lee owes me' })).toBeVisible();

  // Add a manual update.
  await detail.getByPlaceholder(/Log an update/).fill('Agreed she sends numbers Friday');
  await detail.getByRole('button', { name: 'Add update' }).click();
  await expect(detail.locator('.task-update-text', { hasText: 'Agreed she sends numbers Friday' })).toBeVisible();

  // Same record moved sides: it now shows on Home's Waiting lane…
  await page.locator('.task-detail-close').click();
  await page.locator('.hub-seg', { hasText: 'Waiting' }).click();
  await expect(page.getByText('Overdue review')).toBeVisible();

  // …and on Anna's "owes me" ledger.
  await navTo(page, 'People');
  await page.locator('.person-item', { hasText: 'Anna Lee' }).click();
  await expect(
    page.locator('.ledger-section', { hasText: 'Anna owes me' }).getByText('Overdue review'),
  ).toBeVisible();
});
