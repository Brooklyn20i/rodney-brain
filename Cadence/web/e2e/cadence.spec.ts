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
  // badge count suffix and avoids partial-word matches.
  await page.locator('#sidebar').getByRole('button', { name: new RegExp(`\\b${label}\\b`) }).click();
}

// ── Boot ──────────────────────────────────────────────────────────────────────
test('boots straight to Home (no login gate)', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
  // Retired surfaces never render in the sidebar.
  for (const gone of ['Today', 'Board', 'Review', 'Calendar', 'Ace', 'Kobe', 'Tasks']) {
    await expect(page.locator('#sidebar').getByRole('button', { name: new RegExp(`\\b${gone}\\b`) })).toHaveCount(0);
  }
  await expect(page.locator('#sidebar').getByRole('button', { name: /\bHome\b/ })).toBeVisible();
  await expect(page.locator('#sidebar').getByRole('button', { name: /\bDashboard\b/ })).toBeVisible();
});

// ── Navigation smoke: every screen renders a header in a real browser ───────────
for (const label of ['Home', 'People', 'Meetings', 'Projects', 'Notes', 'Inbox', 'Dashboard']) {
  test(`navigates to ${label} without crashing`, async ({ page }) => {
    await navTo(page, label);
    await expect(page.locator('.screen-header h1').first()).toBeVisible();
  });
}

// ── Home: lanes, counts, and invisible agent provenance ─────────────────────────
test('home shows my open work with lanes and an agent-created item in a normal lane', async ({ page }) => {
  await expect(page.getByText(/1 overdue/).first()).toBeVisible();
  await expect(page.getByText('Overdue review')).toBeVisible();     // Mine lane (default)
  // agent:kobe is provenance only — the item renders like any other task,
  // with no agent lane anywhere.
  await page.locator('#sidebar'); // sidebar present
  await expect(page.locator('.hub-seg', { hasText: 'Mine' })).toHaveClass(/active/);
  await page.locator('.hub-seg', { hasText: 'Waiting' }).click();
  await expect(page.getByText('Awaiting legal sign-off')).toBeVisible(); // Waiting lane
});

// ── Quick Add is capture-first: an untagged note lands in the Inbox to triage ─
test('creates a capture via Quick Add and it lands in the Inbox and triage tray', async ({ page }) => {
  await navTo(page, 'Home');
  await page.getByRole('button', { name: 'Capture task' }).click();
  const input = page.getByPlaceholder(/Try "Follow up/);
  await input.fill('Zebra checkpoint');
  await input.press('Enter');
  // Capture-first: it waits in the triage tray on Home and the Inbox.
  await expect(page.getByTestId('triage-tray').getByText('Zebra checkpoint')).toBeVisible();
  await navTo(page, 'Inbox');
  await expect(page.getByText('Zebra checkpoint')).toBeVisible();
});

// ── Projects: Analytical evidence-on-demand ─────────────────────────────────────
test('project detail opens as a practical control sheet', async ({ page }) => {
  await navTo(page, 'Projects');
  await page.getByText('Apollo', { exact: true }).first().click();
  await expect(page.getByRole('button', { name: 'Overview' })).toHaveClass(/active/);
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
