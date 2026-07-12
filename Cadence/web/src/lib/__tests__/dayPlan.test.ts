import { describe, it, expect } from 'vitest';
import { DAY_PLAN_TITLE, findDayPlanNote, parseDayPlanBody, readDayPlan } from '../dayPlan';
import type { Note, WorkItem } from '../types';

const note = (o: Partial<Note>) =>
  ({ id: 'n', title: DAY_PLAN_TITLE, body: '', folder: '', created_at: '', updated_at: '', deleted_at: null, ...o }) as Note;
const wi = (o: Partial<WorkItem>) =>
  ({ id: 'w', title: 'T', type: 'task', priority: 'medium', due_date: null, project_id: null, person_id: null,
     notes: '', done: false, inboxed: false, source: '', completed_at: null, deleted_at: null, ...o }) as WorkItem;

describe('parseDayPlanBody', () => {
  it('reads the pinned array', () => {
    expect(parseDayPlanBody('{"pinned":["a","b"]}')).toEqual(['a', 'b']);
  });

  it('is defensive about garbage', () => {
    expect(parseDayPlanBody(null)).toEqual([]);
    expect(parseDayPlanBody('not json')).toEqual([]);
    expect(parseDayPlanBody('{"pinned":"a"}')).toEqual([]);
    expect(parseDayPlanBody('{"pinned":["a",7,null,"b"]}')).toEqual(['a', 'b']);
  });
});

describe('findDayPlanNote', () => {
  it('prefers the newest live note when duplicates exist', () => {
    const notes = [
      note({ id: 'old', updated_at: '2026-01-01' }),
      note({ id: 'new', updated_at: '2026-02-01' }),
      note({ id: 'dead', updated_at: '2026-03-01', deleted_at: '2026-03-02' }),
      note({ id: 'other', title: 'Diary', updated_at: '2026-04-01' }),
    ];
    expect(findDayPlanNote(notes)?.id).toBe('new');
  });
});

describe('readDayPlan', () => {
  it('keeps plan order and prunes done, deleted, and missing ids', () => {
    const notes = [note({ body: JSON.stringify({ pinned: ['b', 'gone', 'a', 'done', 'dead'] }) })];
    const items = [
      wi({ id: 'a' }),
      wi({ id: 'b' }),
      wi({ id: 'done', done: true }),
      wi({ id: 'dead', deleted_at: '2026-01-01' }),
    ];
    expect(readDayPlan(notes, items)).toEqual(['b', 'a']);
  });

  it('is empty with no plan note', () => {
    expect(readDayPlan([], [wi({ id: 'a' })])).toEqual([]);
  });
});
