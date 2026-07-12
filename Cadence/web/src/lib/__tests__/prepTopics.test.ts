/**
 * Big-meeting prep topics — the hidden `__prep__<groupId>` note that carries
 * each topic's work trail (why, links, prep task ids, ready status) across
 * occurrences. Pins the parse/normalise/round-trip rules.
 */
import { describe, it, expect } from 'vitest';
import {
  prepNoteTitle, findPrepNote, parsePrepBody, readPrepTopics,
  serializeTopics, newTopic, upsertTopic,
} from '../prepTopics';
import type { Note } from '../types';

const note = (o: Partial<Note>): Note => ({
  id: 'n1', owner_id: 'o', title: '', body: '',
  created_at: '2026-07-01T00:00:00Z', updated_at: '2026-07-01T00:00:00Z', deleted_at: null, ...o,
} as Note);

describe('prep note discovery', () => {
  it('is a hidden __-prefixed note per series', () => {
    expect(prepNoteTitle('gCLT')).toBe('__prep__gCLT');
  });

  it('newest live note wins', () => {
    const notes = [
      note({ id: 'old', title: '__prep__gCLT', updated_at: '2026-07-01T00:00:00Z' }),
      note({ id: 'new', title: '__prep__gCLT', updated_at: '2026-07-02T00:00:00Z' }),
      note({ id: 'dead', title: '__prep__gCLT', updated_at: '2026-07-03T00:00:00Z', deleted_at: 'x' }),
    ];
    expect(findPrepNote(notes, 'gCLT')?.id).toBe('new');
  });
});

describe('parsePrepBody', () => {
  it('normalises sparse topics so no field is ever undefined', () => {
    const body = JSON.stringify({ topics: [{ id: 't1', title: 'Pricing' }] });
    expect(parsePrepBody(body)[0]).toEqual({
      id: 't1', title: 'Pricing', why: '', status: 'building', links: [], notes: '', prep_task_ids: [],
    });
  });

  it('tolerates junk', () => {
    expect(parsePrepBody('')).toEqual([]);
    expect(parsePrepBody('nope')).toEqual([]);
    expect(parsePrepBody(JSON.stringify({ topics: 42 }))).toEqual([]);
  });

  it('round-trips through serializeTopics', () => {
    const t = { ...newTopic('Pricing'), why: 'Board asked', status: 'ready' as const, prep_task_ids: ['w1'] };
    expect(parsePrepBody(serializeTopics([t]))).toEqual([t]);
  });
});

describe('upsertTopic / readPrepTopics', () => {
  it('replaces by id or appends', () => {
    const a = newTopic('A');
    const b = newTopic('B');
    expect(upsertTopic([a], { ...a, status: 'ready' })[0].status).toBe('ready');
    expect(upsertTopic([a], b)).toHaveLength(2);
  });

  it('reads through the series note', () => {
    const notes = [note({ title: '__prep__gCLT', body: serializeTopics([newTopic('Pricing')]) })];
    expect(readPrepTopics(notes, 'gCLT')[0].title).toBe('Pricing');
    expect(readPrepTopics(notes, 'gADX')).toEqual([]);
  });
});
