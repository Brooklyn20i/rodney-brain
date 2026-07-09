import { describe, it, expect, beforeEach, vi } from 'vitest';
import { isFiledTask, isUserTask } from '../tasks';
import { getTodoGroups, getHotThisWeek, getWaitingOnOthers, getProjectTopActions } from '../selectors';
import { todayStr } from '../util';
import type { WorkItem } from '../types';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 5, 20));
});

const wi = (o: Partial<WorkItem>): WorkItem => ({
  id: 'w' + Math.random().toString(36).slice(2, 7), owner_id: 'o', title: 'T',
  type: 'task', priority: 'medium', due_date: null, project_id: null, person_id: null,
  notes: '', done: false, inboxed: false, source: '', completed_at: null,
  created_at: '2026-06-01', updated_at: '2026-06-01', deleted_at: null, ...o,
}) as WorkItem;

// Capture-first triage: an item stays in the Inbox (inboxed) until filed, even
// when it carries a person or project. It must NOT leak into the filed-task
// surfaces (Today / Board / Tasks / People / Projects) until triaged.
describe('triage model — inboxed captures are Inbox-only until filed', () => {
  it('isFiledTask excludes inboxed captures but keeps them as user tasks', () => {
    const capture = wi({ inboxed: true, project_id: 'proj1' });
    expect(isUserTask(capture)).toBe(true);   // still the user's open work (shows in Inbox)
    expect(isFiledTask(capture)).toBe(false);  // but not yet filed → hidden from folders

    const filed = wi({ inboxed: false, project_id: 'proj1' });
    expect(isFiledTask(filed)).toBe(true);

    expect(isFiledTask(wi({ inboxed: false, done: true }))).toBe(false); // completed
    expect(isFiledTask(wi({ inboxed: false, source: 'for:kobe' }))).toBe(false); // delegated to Kobe
    expect(isFiledTask(wi({ inboxed: false, source: 'agent:kobe' }))).toBe(true); // provenance only
  });

  it("Today's to-do groups exclude an inboxed capture even if it is due today", () => {
    const today = todayStr();
    const items = [
      wi({ title: 'Filed task', due_date: today, inboxed: false }),
      wi({ title: 'Quick capture', due_date: today, inboxed: true, person_id: 'p1' }),
    ];
    const flat = getTodoGroups(items).flatMap((g) => g.items.map((w) => w.title));
    expect(flat).toContain('Filed task');
    expect(flat).not.toContain('Quick capture');
  });

  it('Hot-this-week and waiting-on-others exclude inboxed captures', () => {
    const soon = todayStr();
    expect(getHotThisWeek([wi({ due_date: soon, inboxed: true })])).toHaveLength(0);
    expect(getWaitingOnOthers([wi({ type: 'waitingFor', inboxed: true })])).toHaveLength(0);
    expect(getWaitingOnOthers([wi({ type: 'waitingFor', inboxed: false })])).toHaveLength(1);
  });

  it("a project's top actions exclude captures tagged with that project", () => {
    const items = [
      wi({ title: 'Real project task', project_id: 'proj1', inboxed: false }),
      wi({ title: 'Untriaged capture', project_id: 'proj1', inboxed: true }),
    ];
    const titles = getProjectTopActions('proj1', items).map((w) => w.title);
    expect(titles).toContain('Real project task');
    expect(titles).not.toContain('Untriaged capture');
  });
});
