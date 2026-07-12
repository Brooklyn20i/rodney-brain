import { test, expect, type Page } from './fixtures';
import { makeSeed } from './seed';

// Notes as a real writing surface: create a note, get content down in the rich
// editor, then find it again by body text — plus folder creation via the modal.

test.beforeEach(async ({ page }) => {
  const seed = makeSeed();
  await page.addInitScript((s) => { (window as any).__CADENCE_E2E__ = s; }, seed);
  await page.goto('/work.html');
});

async function navTo(page: Page, label: string) {
  await page.locator('#sidebar').getByRole('button', { name: new RegExp(`\\b${label}\\b`) }).click();
}

test('create a note, write in it, find it again by body text', async ({ page }) => {
  await navTo(page, 'Notes');
  await page.getByRole('button', { name: '+ Note' }).click();

  // Title + rich body.
  await page.locator('#note-title-input').fill('Offsite thinking');
  await page.locator('.ProseMirror').click();
  await page.keyboard.type('The wombat strategy needs a second look.');
  // Blur flushes the save.
  await page.locator('#note-title-input').click();

  // Search by a word that only exists in the body.
  await page.getByPlaceholder('Search notes…').fill('wombat');
  await expect(page.locator('.note-list-item', { hasText: 'Offsite thinking' })).toBeVisible();

  // A miss says so.
  await page.getByPlaceholder('Search notes…').fill('zebra');
  await expect(page.getByText(/No notes match/)).toBeVisible();
});

test('folders are created through a modal and hold the open note', async ({ page }) => {
  await navTo(page, 'Notes');
  await page.getByRole('button', { name: '+ Note' }).click();
  await page.locator('#note-title-input').fill('Board pack draft');

  // New folder from the note's folder picker — the note moves into it.
  await page.locator('.note-folder-select').selectOption('__new__');
  await expect(page.getByRole('heading', { name: 'New folder' })).toBeVisible();
  await page.getByPlaceholder('e.g. Leadership').fill('Board');
  await page.getByRole('button', { name: 'Create' }).click();

  await expect(page.locator('.folder-header', { hasText: 'Board' })).toBeVisible();
  await expect(page.locator('.note-folder-select')).toHaveValue('Board');
});
