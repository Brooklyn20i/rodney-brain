import { test, expect, type Page } from './fixtures';
import { makeSeed } from './seed';

// Big-meeting topics with a work trail, decoupled from any agenda machinery:
// build a topic on the CLT series, give it a prep task (a REAL task on Home),
// mark it ready, and cover it from inside the meeting document's Topics panel.

test.beforeEach(async ({ page }) => {
  const seed = makeSeed();
  await page.addInitScript((s) => { (window as any).__CADENCE_E2E__ = s; }, seed);
  await page.goto('/work.html');
});

async function navTo(page: Page, label: string) {
  await page.locator('#sidebar').getByRole('button', { name: new RegExp(`\\b${label}\\b`) }).click();
}

test('topic → prep task on Home → ready → covered from the meeting doc', async ({ page }) => {
  // 1. Create a topic on the CLT series.
  await navTo(page, 'Meetings');
  await page.locator('.person-item', { hasText: 'CLT' }).click();
  const topicAdd = page.getByPlaceholder('+ Topic for the next CLT…');
  await topicAdd.fill('Pricing strategy update');
  await topicAdd.press('Enter');
  await expect(page.locator('.prep-topic-title')).toHaveValue('Pricing strategy update');

  // 2. Add a prep task with a work trail — it is a real task.
  const taskAdd = page.getByPlaceholder('+ Prep task (lands in your Home list)…');
  await taskAdd.fill('Build the pricing slide');
  await taskAdd.press('Enter');
  await expect(page.locator('.prep-topic-card').getByText('Build the pricing slide')).toBeVisible();

  // …visible in my Home list, tagged to the group.
  await navTo(page, 'Home');
  await expect(page.getByText('Build the pricing slide')).toBeVisible();

  // 3. Mark the topic ready.
  await navTo(page, 'Meetings');
  await page.locator('.person-item', { hasText: 'CLT' }).click();
  await page.locator('.topic-status-chip').click(); // building → ready
  await expect(page.locator('.topic-status-chip')).toHaveText('Ready');

  // 4. Create today's occurrence — a document, with the series topics one
  //    toggle away for prep and covering.
  await page.getByRole('button', { name: /^Meetings/ }).click();
  await page.getByRole('button', { name: '+ New Meeting' }).click();
  await expect(page.locator('.mtg-modal-doc')).toBeVisible();
  await page.getByRole('button', { name: 'Topics ↓' }).click();
  await expect(page.locator('.mtg-import-panel .prep-topic-title')).toHaveValue('Pricing strategy update');

  // 5. Cover it in the meeting: ready → covered on the topic's own status chip.
  await page.locator('.mtg-import-panel .topic-status-chip').click();
  await page.getByRole('button', { name: 'Save & Close' }).first().click();

  // The series page shows it resolved.
  await page.getByRole('button', { name: /^Topics/ }).click();
  await expect(page.getByText('✓ Covered (1)')).toBeVisible();
});
