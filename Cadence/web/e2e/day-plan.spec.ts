import { test, expect, type Page } from './fixtures';
import { makeSeed } from './seed';

// Home polish: the hand-picked "Today's focus" plan (pin → order → survive
// navigation → prune on complete) and the today's-meetings strip.

const pad = (n: number) => String(n).padStart(2, '0');
const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => fmt(new Date());
const addDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return fmt(d); };

async function navTo(page: Page, label: string) {
  await page.locator('#sidebar').getByRole('button', { name: new RegExp(`\\b${label}\\b`) }).click();
}

const focusTitles = (page: Page) => page.locator('.day-plan-row .wi-title');

test('pin tasks, reorder, navigate away and back, complete to prune', async ({ page }) => {
  const seed = makeSeed();
  await page.addInitScript((s) => { (window as any).__CADENCE_E2E__ = s; }, seed);
  await page.goto('/work.html');

  // Pin two tasks from the master list via their stars.
  const starFor = (title: string) =>
    page.locator('.task-hub-row', { hasText: title }).getByTitle("Pin to Today's focus");
  await starFor('Finalise vendor list').click();
  await starFor('Prep board pack').click();

  await expect(page.getByText("★ Today's focus")).toBeVisible();
  await expect(focusTitles(page)).toHaveText(['Finalise vendor list', 'Prep board pack']);

  // Reorder: move the second one up.
  await page.locator('.day-plan-row', { hasText: 'Prep board pack' }).getByTitle('Move up').click();
  await expect(focusTitles(page)).toHaveText(['Prep board pack', 'Finalise vendor list']);

  // The plan survives leaving Home (it lives in a synced note, not screen state).
  await navTo(page, 'People');
  await navTo(page, 'Home');
  await expect(focusTitles(page)).toHaveText(['Prep board pack', 'Finalise vendor list']);

  // Completing a pinned task prunes it from the plan. (click, not check():
  // the row unmounts as soon as the task is done, so there is no checked
  // state left to assert against.)
  await page.locator('.day-plan-row', { hasText: 'Prep board pack' }).getByRole('checkbox').click();
  await expect(focusTitles(page)).toHaveText(['Finalise vendor list']);

  // Unpin the last one — the section disappears.
  await page.locator('.day-plan-row').getByTitle("Unpin from Today's focus").click();
  await expect(page.getByText("★ Today's focus")).toBeHidden();
});

test('the strip shows all of a day\'s meetings, plus upcoming days, and deep-opens', async ({ page }) => {
  const seed = makeSeed();
  // TWO meetings today (Anna + Bob) and one upcoming (Cara) — all must show,
  // grouped by day. The old strip only showed the single next meeting.
  seed.notes.push({ id: 'note-bob', title: '1:1 · Bob Ng', folder: '__mtg__pBob', body: '{}', updated_at: today() } as any);
  seed.notes.push({ id: 'note-cara', title: '1:1 · Cara Diaz', folder: '__mtg__pCara', body: '{}', updated_at: today() } as any);
  const mdates = seed.notes.find((n) => n.id === 'mdates')!;
  mdates.body = JSON.stringify({ 'note-anna': today(), 'note-bob': today(), 'note-cara': addDays(3) });
  await page.addInitScript((s) => { (window as any).__CADENCE_E2E__ = s; }, seed);
  await page.goto('/work.html');

  await expect(page.getByText('Upcoming meetings')).toBeVisible();
  // One "Today" header with both of today's meetings under it.
  const todayGroup = page.locator('.today-strip-day', { has: page.locator('.today-strip-daylabel.now') });
  await expect(todayGroup.locator('.today-strip-card')).toHaveCount(2);
  await expect(todayGroup.locator('.today-strip-card', { hasText: 'Anna Lee' })).toBeVisible();
  await expect(todayGroup.locator('.today-strip-card', { hasText: 'Bob Ng' })).toBeVisible();
  // Cara's meeting is days away but still listed.
  await expect(page.locator('.today-strip-card', { hasText: 'Cara Diaz' })).toBeVisible();

  // Tap → straight into Anna's detail (ledger first) to prep.
  await todayGroup.locator('.today-strip-card', { hasText: 'Anna Lee' }).click();
  await expect(page.getByText('📤 Anna owes me')).toBeVisible();
});
