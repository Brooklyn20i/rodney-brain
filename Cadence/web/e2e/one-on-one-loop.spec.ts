import { test, expect, type Page } from './fixtures';
import { makeSeed } from './seed';

// The ledger-first 1:1 loop — the ledger IS the agenda:
// raise a task from Home (a FLAG on the record, no copy) → it groups under
// "Next 1:1" at the top of the person page while staying in its ledger
// section → flip who owes whom in place → "Covered" unflags without
// completing → the row-level 🗓 flag re-raises → done prunes it everywhere.

test.beforeEach(async ({ page }) => {
  const seed = makeSeed();
  await page.addInitScript((s) => { (window as any).__CADENCE_E2E__ = s; }, seed);
  await page.goto('/work.html');
});

async function navTo(page: Page, label: string) {
  await page.locator('#sidebar').getByRole('button', { name: new RegExp(`\\b${label}\\b`) }).click();
}

test('raise → Next 1:1 section → flip → covered → re-raise → done prunes', async ({ page }) => {
  // 1. Raise Anna's overdue task at her next 1:1, straight from Home's detail
  //    panel. The button is a live toggle on the SAME record.
  await page.getByText('Overdue review').click();
  await page.locator('.task-detail').getByRole('button', { name: /1:1/ }).click();
  await expect(page.locator('.task-detail').getByText('✓ On 1:1 list')).toBeVisible();

  // 2. On Anna's page it groups under "Next 1:1" as a full ledger card…
  await navTo(page, 'People');
  await page.locator('.person-item', { hasText: 'Anna Lee' }).click();
  const nextSection = page.locator('.ledger-section', { hasText: 'Next 1:1' });
  await expect(nextSection.locator('.topic-card', { hasText: 'Overdue review' })).toBeVisible();

  // …while STAYING in its ledger section with the flag lit — one record, two views.
  const iOwe = page.locator('.ledger-section', { hasText: 'I owe Anna' });
  await expect(iOwe.locator('.topic-card', { hasText: 'Overdue review' })).toBeVisible();
  await expect(iOwe.locator('.raise-flag.active')).toBeVisible();

  // 3. We agree Anna now owes me the correction — flip ⇄ inside the Next 1:1
  //    row; the ledger side moves because it IS the ledger record.
  await nextSection.locator('.topic-card', { hasText: 'Overdue review' }).locator('.topic-flip').click();
  const owesMe = page.locator('.ledger-section', { hasText: 'Anna owes me' });
  await expect(owesMe.locator('.topic-card', { hasText: 'Overdue review' })).toBeVisible();

  // The handoff is on the task's history.
  await owesMe.locator('.topic-card', { hasText: 'Overdue review' }).locator('.topic-body').click();
  await expect(page.locator('.task-update-text', { hasText: '→ Anna Lee owes me' })).toBeVisible();
  await page.locator('.modal-close').click();

  // 4. Covered: drops off Next 1:1, stays open in the ledger.
  await nextSection.getByRole('button', { name: '✓ Covered' }).click();
  await expect(page.locator('.ledger-section', { hasText: 'Next 1:1' })).toBeHidden();
  await expect(owesMe.locator('.topic-card', { hasText: 'Overdue review' })).toBeVisible();

  // 5. The row-level 🗓 flag raises it straight back.
  await owesMe.locator('.topic-card', { hasText: 'Overdue review' }).locator('.raise-flag').click();
  await expect(page.locator('.ledger-section', { hasText: 'Next 1:1' })).toBeVisible();

  // 6. Ticking the task done prunes the flag — Next 1:1 empties itself.
  await owesMe.locator('.topic-card', { hasText: 'Overdue review' }).getByRole('checkbox').click();
  await expect(page.locator('.ledger-section', { hasText: 'Next 1:1' })).toBeHidden();

  // 7. Reopen from Recently Done so the record is live again, then confirm the
  //    same record sits in Home's Waiting lane — no new task was ever created.
  await page.getByText('✓ Recently Done').click();
  await page.locator('.work-item-row', { hasText: 'Overdue review' }).getByRole('button', { name: '↩' }).click();
  await navTo(page, 'Home');
  await page.locator('.hub-seg', { hasText: 'Waiting' }).click();
  await expect(page.getByText('Overdue review')).toBeVisible();
});
