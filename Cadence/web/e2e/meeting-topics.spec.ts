import { test, expect, type Page } from './fixtures';
import { makeSeed } from './seed';

// Big-meeting topics with a work trail: create a topic on the CLT series, add
// a prep task (a REAL task that appears on Home), mark the topic ready, put it
// on a new occurrence's agenda, cover it in the meeting — the series topic
// resolves itself to covered.

test.beforeEach(async ({ page }) => {
  const seed = makeSeed();
  await page.addInitScript((s) => { (window as any).__CADENCE_E2E__ = s; }, seed);
  await page.goto('/work.html');
});

async function navTo(page: Page, label: string) {
  await page.locator('#sidebar').getByRole('button', { name: new RegExp(`\\b${label}\\b`) }).click();
}

test('topic → prep task on Home → agenda → covered sync', async ({ page }) => {
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

  // 4. Create today's occurrence and put the ready topic on its agenda.
  await page.getByRole('button', { name: /^Meetings/ }).click();
  await page.getByRole('button', { name: '+ New Meeting' }).click();
  await page.getByRole('button', { name: 'Topics ↓' }).click();
  await page.getByRole('button', { name: '+ Agenda' }).click();
  await expect(page.locator('.agenda-topic-input[value="Pricing strategy update"]')).toBeVisible();
  // Hide the topics panel again so it can't intercept the status buttons.
  await page.getByRole('button', { name: 'Topics ↓' }).click();

  // 5. Cover it in the meeting and close — the series topic syncs to covered.
  await page.getByRole('button', { name: '✅ Covered' }).first().click();
  await page.getByRole('button', { name: 'Save & Close' }).first().click();
  await page.getByRole('button', { name: /^Topics/ }).click();
  await expect(page.getByText('✓ Covered (1)')).toBeVisible();
});
