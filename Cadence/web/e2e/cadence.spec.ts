import { test, expect, Page } from '@playwright/test';
import { makeSeed } from './seed';

test.beforeEach(async ({ page }) => {
  const seed = makeSeed();
  await page.addInitScript((s) => { (window as any).__CADENCE_E2E__ = s; }, seed);
  // The app lives at the /work.html shell — the site root ('/') is the marketing
  // page. The dev/E2E server serves the raw shells (no Vercel rewrites).
  await page.goto('/work.html');
});

async function navTo(page: Page, label: string) {
  // Word-boundary, case-sensitive match on the accessible name. Survives a
  // badge count suffix ("◎ Tasks 1") and avoids "Board" matching "Dashboard".
  await page.locator('#sidebar').getByRole('button', { name: new RegExp(`\\b${label}\\b`) }).click();
}

// ── Boot ──────────────────────────────────────────────────────────────────────
test('boots straight to Control (no login gate)', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Control' })).toBeVisible();
  await expect(page.getByText('To do')).toBeVisible();
});

// ── Navigation smoke: every screen renders a header in a real browser ───────────
for (const label of ['Dashboard', 'Horizon', 'Board', 'Tasks', 'Inbox', 'Projects', 'People', 'Notes', 'Review']) {
  test(`navigates to ${label} without crashing`, async ({ page }) => {
    await navTo(page, label);
    await expect(page.locator('.screen-header h1').first()).toBeVisible();
  });
}

// ── Control: ranked to-do + waiting + Kobe ───────────────────────────────────────
test('control shows the ranked to-do, plus waiting and Kobe sections', async ({ page }) => {
  await expect(page.getByText(/holding 8 open items/)).toBeVisible();      // load nudge
  await expect(page.getByText('Overdue review')).toBeVisible();            // in My To-Do
  await expect(page.getByText('Awaiting legal sign-off')).toBeVisible();   // Waiting on others
  await expect(page.getByText('Draft summary')).toBeVisible();             // With Kobe
});

// ── Board: reassign a task across columns (the Arranger core) ────────────────────
test('board moves a task to another person and it leaves the old column', async ({ page }) => {
  await navTo(page, 'Board');
  await expect(page.getByRole('heading', { name: 'Board' })).toBeVisible();
  const annaCol = page.locator('.board-col', { hasText: 'Anna Lee' });
  const bobCol = page.locator('.board-col', { hasText: 'Bob Ng' });
  await expect(annaCol).toContainText('Overdue review');

  const card = page.locator('.board-card', { hasText: 'Overdue review' });
  await card.getByTitle(/Move to another person/).click();
  await page.locator('.action-send-picker').getByText('Bob Ng').click();

  await expect(bobCol).toContainText('Overdue review');
  await expect(annaCol).not.toContainText('Overdue review');
});

// ── Tasks: create a task through Quick Add ───────────────────────────────────────
test('creates a task via Quick Add and it appears in the list', async ({ page }) => {
  await navTo(page, 'Tasks');
  await page.getByRole('button', { name: 'Add Task' }).click();
  const input = page.getByPlaceholder(/Try "Follow up/);
  await input.fill('Zebra checkpoint');
  await input.press('Enter');
  await expect(page.getByText('Zebra checkpoint')).toBeVisible();
});

// ── Dashboard: a person card deep-links into People ──────────────────────────────
test('dashboard person card navigates to People', async ({ page }) => {
  await navTo(page, 'Dashboard');
  await page.locator('.dash-card', { hasText: 'Anna Lee' }).first().click();
  await expect(page.getByRole('heading', { name: 'People', exact: true })).toBeVisible();
});

// ── Horizon: forward markers render in their buckets ─────────────────────────────
test('horizon shows milestones, targets and a 1:1', async ({ page }) => {
  await navTo(page, 'Horizon');
  await expect(page.getByText('Design freeze')).toBeVisible();
  await expect(page.getByText('Beta launch')).toBeVisible();
  await expect(page.getByText('This week')).toBeVisible();
});

// ── Projects: Analytical evidence-on-demand ──────────────────────────────────────
test('project health evidence reveals raw numbers on demand', async ({ page }) => {
  await navTo(page, 'Projects');
  await page.getByText('Apollo', { exact: true }).first().click();
  await page.getByRole('button', { name: 'Why?' }).click();
  await expect(page.getByText(/open total/)).toBeVisible();
});

// ── Projects: portfolio Gantt timeline ───────────────────────────────────────────
test('projects Timeline view shows a portfolio Gantt and rows open the project', async ({ page }) => {
  await navTo(page, 'Projects');
  await page.getByRole('button', { name: 'Timeline', exact: true }).click();
  // each active project is a labelled row with a bar
  await expect(page.locator('.gantt-portfolio .gantt-bar').first()).toBeVisible();
  await page.locator('.gantt-row-btn', { hasText: 'Apollo' }).click();
  await expect(page.getByRole('heading', { name: 'Apollo' })).toBeVisible(); // detail opened
});
