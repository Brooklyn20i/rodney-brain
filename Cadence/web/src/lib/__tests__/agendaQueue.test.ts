/**
 * Per-person 1:1 agenda queue — the hidden `__agenda__<personId>` note that
 * holds "raise at next 1:1" items until the meeting modal merges them. Pins
 * the parse/dedupe rules and that queue notes stay invisible-by-convention.
 */
import { describe, it, expect } from 'vitest';
import {
  agendaQueueTitle, findAgendaQueueNote, parseQueueBody, readAgendaQueue, addToQueueItems,
} from '../agendaQueue';
import type { Note } from '../types';
import type { AgendaItem } from '../meetingData';

const note = (o: Partial<Note>): Note => ({
  id: 'n1', owner_id: 'o', title: '', body: '', folder: undefined,
  created_at: '2026-07-01T00:00:00Z', updated_at: '2026-07-01T00:00:00Z', deleted_at: null, ...o,
} as Note);

const item = (o: Partial<AgendaItem>): AgendaItem => ({
  id: 'a1', title: 'Topic', notes: '', status: 'discuss', ...o,
});

describe('queue note discovery', () => {
  it('titles are __-prefixed so the Notes screen hides them by convention', () => {
    expect(agendaQueueTitle('pAnna')).toBe('__agenda__pAnna');
  });

  it('finds the newest live queue note for the person', () => {
    const notes = [
      note({ id: 'old', title: '__agenda__pAnna', updated_at: '2026-07-01T00:00:00Z' }),
      note({ id: 'new', title: '__agenda__pAnna', updated_at: '2026-07-02T00:00:00Z' }),
      note({ id: 'del', title: '__agenda__pAnna', updated_at: '2026-07-03T00:00:00Z', deleted_at: '2026-07-03T00:00:00Z' }),
      note({ id: 'other', title: '__agenda__pBob' }),
    ];
    expect(findAgendaQueueNote(notes, 'pAnna')?.id).toBe('new');
  });
});

describe('parseQueueBody / readAgendaQueue', () => {
  it('parses items and tolerates junk bodies', () => {
    expect(parseQueueBody(JSON.stringify({ items: [item({ title: 'X' })] }))).toHaveLength(1);
    expect(parseQueueBody('')).toEqual([]);
    expect(parseQueueBody('not json')).toEqual([]);
    expect(parseQueueBody(JSON.stringify({ items: 'nope' }))).toEqual([]);
  });

  it('reads through to the person queue note', () => {
    const notes = [note({ title: '__agenda__pAnna', body: JSON.stringify({ items: [item({ title: 'Raise budget' })] }) })];
    expect(readAgendaQueue(notes, 'pAnna').map((i) => i.title)).toEqual(['Raise budget']);
    expect(readAgendaQueue(notes, 'pBob')).toEqual([]);
  });
});

describe('addToQueueItems', () => {
  it('appends a discuss-status item with a fresh id', () => {
    const next = addToQueueItems([], { title: '  Raise budget  ' });
    expect(next).toHaveLength(1);
    expect(next![0]).toMatchObject({ title: 'Raise budget', status: 'discuss', notes: '' });
    expect(next![0].id).toBeTruthy();
  });

  it('carries source_item_id so the agenda row stays the same record as the task', () => {
    const next = addToQueueItems([], { title: 'Chase Q3 numbers', source_item_id: 'w9' });
    expect(next![0].source_item_id).toBe('w9');
  });

  it('dedupes by source_item_id first, then case-insensitive title', () => {
    const existing = [item({ title: 'Raise budget', source_item_id: 'w1' })];
    expect(addToQueueItems(existing, { title: 'Different title', source_item_id: 'w1' })).toBeNull();
    expect(addToQueueItems(existing, { title: 'RAISE BUDGET' })).toBeNull();
    expect(addToQueueItems(existing, { title: 'New topic' })).toHaveLength(2);
  });

  it('rejects empty titles', () => {
    expect(addToQueueItems([], { title: '   ' })).toBeNull();
  });
});
