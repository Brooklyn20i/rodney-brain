import { test, expect, type Page } from './fixtures';
import { makeSeed } from './seed';

// Home polish: the hand-picked "Today's focus" plan (pin → order → survive
// navigation → prune on complete) and the today's-meetings strip.

const pad = (n: number) => String(n).padStart(2, '0');
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

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

test("the Today strip surfaces today's 1:1 and deep-opens the person", async ({ page }) => {
  const seed = makeSeed();
  // Anna's next 1:1 is normally in two days — move it to today.
  const mdates = seed.notes.find((n) => n.id === 'mdates')!;
  mdates.body = JSON.stringify({ 'note-anna': today() });
  await page.addInitScript((s) => { (window as any).__CADENCE_E2E__ = s; }, seed);
  await page.goto('/work.html');

  await expect(page.getByText('Meetings today')).toBeVisible();
  const card = page.locator('.today-strip-card', { hasText: 'Anna Lee' });
  await expect(card).toBeVisible();

  // Tap → straight into Anna's detail (ledger first) to prep.
  await card.click();
  await expect(page.getByText('📤 Anna owes me')).toBeVisible();
});
