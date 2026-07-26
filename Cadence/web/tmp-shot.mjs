import { chromium } from '@playwright/test';
import { execSync } from 'node:child_process';

const seed = JSON.parse(execSync(
  `npx tsx -e "import{makeSeed}from'./e2e/seed.ts';console.log(JSON.stringify(makeSeed()))"`,
  { encoding: 'utf8' },
).trim().split('\n').pop());

// Make the follow-up instruments visible: the waiting item goes quiet for 10
// days, and a to-do sits undated for 5 weeks.
const iso = (daysAgo) => new Date(Date.now() - daysAgo * 86_400_000).toISOString();
for (const w of seed.work_items) {
  if (w.id === 'w9') { w.updated_at = iso(10); w.created_at = iso(30); }
  if (w.id === 'w6') { w.created_at = iso(35); w.updated_at = iso(35); }
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1366, height: 1024 } });
await page.addInitScript((s) => { window.__CADENCE_E2E__ = s; }, seed);
await page.goto('http://localhost:4173/work.html');
await page.waitForSelector('.commit-board');
await page.waitForTimeout(400);
await page.screenshot({ path: '/tmp/claude-0/-home-user-rodney-brain/c42cc598-e3f2-51a1-ae3e-15e7430d37ca/scratchpad/board-chase.png' });

// Triage wizard with a tagged capture — the suggestion row.
const seed2 = JSON.parse(JSON.stringify(seed));
seed2.work_items.push({
  id: 'wCap', title: 'Anna to send the Q3 numbers', type: 'waitingFor', priority: 'medium',
  due_date: null, project_id: null, person_id: 'pAnna', notes: '', done: false,
  inboxed: true, source: 'you', completed_at: null,
});
const page2 = await browser.newPage({ viewport: { width: 1366, height: 1024 } });
await page2.addInitScript((s) => { window.__CADENCE_E2E__ = s; }, seed2);
await page2.goto('http://localhost:4173/work.html');
await page2.waitForSelector('.commit-board');
await page2.getByRole('button', { name: 'Open Inbox →' }).click();
await page2.getByRole('button', { name: /Triage all/ }).click();
await page2.waitForSelector('.wizard-suggest');
await page2.waitForTimeout(300);
await page2.screenshot({ path: '/tmp/claude-0/-home-user-rodney-brain/c42cc598-e3f2-51a1-ae3e-15e7430d37ca/scratchpad/wizard-suggest.png' });
await browser.close();
