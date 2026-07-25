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

// ── Home: the commitments board — all three columns at once ────────────────────
test('home shows the commitments board with all three columns visible', async ({ page }) => {
  await expect(page.getByText(/1 overdue/).first()).toBeVisible();
  // My to-do: the person-less capture-turned-task.
  await expect(page.getByTestId('col-todo').getByText('Loose idea')).toBeVisible();
  // I owe: person-grouped; agent:kobe is provenance only — renders like any
  // other task, no agent lane anywhere.
  const owed = page.getByTestId('col-owed');
  await expect(owed.getByText('Overdue review')).toBeVisible();
  await expect(owed.getByText('Created by Kobe check')).toBeVisible();
  // Waiting on: visible WITHOUT any lane click — the whole point.
  await expect(page.getByTestId('col-waiting').getByText('Awaiting legal sign-off')).toBeVisible();
});

// ── Quick Add is capture-first: a capture surfaces on Home's triage tray AND
//    the full Inbox — one queue, two views of the combined cockpit ────────────
test('a capture shows on the Home triage tray and in the Inbox', async ({ page }) => {
  await navTo(page, 'Home');
  await page.getByRole('button', { name: 'Capture task' }).click();
  const input = page.getByPlaceholder(/Try "Follow up/);
  await input.fill('Zebra checkpoint');
  await input.press('Enter');
  // The combined cockpit: it's right there on Home, ready to shape.
  await expect(page.getByTestId('triage-tray').getByText('Zebra checkpoint')).toBeVisible();
  // "Open Inbox →" leads to the same queue, full-screen.
  await page.getByTestId('triage-tray').getByRole('button', { name: 'Open Inbox →' }).click();
  await expect(page.getByRole('heading', { name: 'Inbox' })).toBeVisible();
  await expect(page.getByText('Zebra checkpoint')).toBeVisible();
});

// ── People: the two-way ledger ──────────────────────────────────────────────────
test('person detail is a two-way ledger and delegation lands in owes-me + Home Waiting', async ({ page }) => {
  await navTo(page, 'People');
  await page.locator('.person-item', { hasText: 'Bob Ng' }).click();
  // Bob owes the seeded waitingFor.
  await expect(page.getByText('📤 Bob owes me')).toBeVisible();
  await expect(page.getByText('Awaiting legal sign-off')).toBeVisible();

  // Delegate a new task to Bob via the owes-me quick-add.
  const give = page.getByPlaceholder('Give Bob a task — press Enter');
  await give.fill('Send me the Q3 numbers');
  await give.press('Enter');
  await expect(page.getByText('Send me the Q3 numbers')).toBeVisible();

  // The same record shows in Home's Waiting-on column — no lane click needed.
  await navTo(page, 'Home');
  await expect(page.getByTestId('col-waiting').getByText('Send me the Q3 numbers')).toBeVisible();
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
