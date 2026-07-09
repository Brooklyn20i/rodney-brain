import { test, expect, type Page } from './fixtures';
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
  // badge count suffix ("◎ My To Do 1") and avoids "Board" matching "Dashboard".
  await page.locator('#sidebar').getByRole('button', { name: new RegExp(`\\b${label}\\b`) }).click();
}

// ── Boot ──────────────────────────────────────────────────────────────────────
test('boots straight to Control (no login gate)', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Rodney To Do / Control' })).toBeVisible();
  await expect(page.getByText(/To do · 1 overdue/)).toBeVisible();
  await expect(page.locator('#sidebar').getByRole('button', { name: /\bHorizon\b/ })).toHaveCount(0);
  await expect(page.locator('#sidebar').getByRole('button', { name: /Rodney To Do/ })).toBeVisible();
  await expect(page.locator('#sidebar').getByRole('button', { name: /\bDashboard\b/ })).toHaveCount(0);
});

// ── Navigation smoke: every screen renders a header in a real browser ───────────
for (const label of ['Board', 'Filed Work', 'Quick Capture', 'Projects', 'People', 'Meetings', 'Notes', 'Review']) {
  test(`navigates to ${label} without crashing`, async ({ page }) => {
    await navTo(page, label);
    await expect(page.locator('.screen-header h1').first()).toBeVisible();
  });
}

// ── Control: ranked to-do + waiting + Kobe ───────────────────────────────────────
test('control shows do-now, decide, waiting and Kobe sections', async ({ page }) => {
  await expect(page.getByText(/To do · 1 overdue/)).toBeVisible();
  await expect(page.getByText('Overdue review')).toBeVisible();            // in Do now
  await expect(page.getByText('Approve Q3 budget')).toBeVisible();         // Decide
  await expect(page.getByText('Awaiting legal sign-off')).toBeVisible();   // Waiting
  await expect(page.getByText('Draft summary')).toBeVisible();             // With Kobe
});

// ── iPad/tablet review mode ────────────────────────────────────────────────────
test('iPad review mode presents the compact Work review queue without clutter', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await navTo(page, 'Review');
  await expect(page.getByRole('heading', { name: 'Review Mode' })).toBeVisible();
  const queue = page.getByLabel('Compact work review queue');
  await expect(queue).toBeVisible();
  for (const label of ['Needs Rodney / Do now', 'Decide', 'Waiting', 'With Kobe', 'Quick Capture', 'Projects']) {
    await expect(queue.getByText(label)).toBeVisible();
  }
  await expect(page.getByText('Projects needing attention', { exact: true })).toBeVisible();
  await expect(page.locator('#sidebar')).toBeVisible();
  await expect(page.locator('.review-queue-card')).toHaveCount(6);
  await expect(page.locator('.review-queue-card').first()).toBeInViewport();
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

// ── Quick Add is capture-first: an untagged note lands in Quick Capture to triage ─
test('creates a capture via Quick Add and it lands in Quick Capture', async ({ page }) => {
  await navTo(page, 'Filed Work');
  await page.getByRole('button', { name: 'Capture task' }).click();
  const input = page.getByPlaceholder(/Try "Follow up/);
  await input.fill('Zebra checkpoint');
  await input.press('Enter');
  // Capture-first: it waits in Quick Capture for triage rather than joining the filed task list.
  await navTo(page, 'Quick Capture');
  await expect(page.getByText('Zebra checkpoint')).toBeVisible();
});

// ── Projects: Analytical evidence-on-demand ─────────────────────────────────────
test('project detail opens as a practical control sheet', async ({ page }) => {
  await navTo(page, 'Projects');
  await page.getByText('Apollo', { exact: true }).first().click();
  await expect(page.getByRole('button', { name: 'Control sheet' })).toHaveClass(/active/);
  await expect(page.getByText('Outcome / goal')).toBeVisible();
  await expect(page.getByText('Ship v2')).toBeVisible();
  await expect(page.getByText(/Owner:/)).toBeVisible();
  await expect(page.getByText(/Anna Lee/)).toBeVisible();
  await expect(page.getByText('Next action')).toBeVisible();
  await expect(page.locator('.proj-control-next input')).toHaveValue('Lock the scope');
  await expect(page.getByRole('heading', { name: 'Open tasks / actions' })).toBeVisible();
  await expect(page.getByText('Finalise vendor list')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Timeline' })).toBeVisible();
});

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
