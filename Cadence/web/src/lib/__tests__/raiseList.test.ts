/**
 * The raise flag: "Raise at next 1:1" is a list of REAL work_item ids in a
 * hidden per-person note, never a copy. Prune-on-read keeps the list honest;
 * legacy __agenda__ queue entries that reference a work_item migrate over.
 */
import { describe, expect, it } from 'vitest';
import { findRaiseNote, parseRaiseBody, raiseNoteTitle, readRaiseList, RAISE_PREFIX } from '../raiseList';
import type { Note, WorkItem } from '../types';

const note = (o: Partial<Note>): Note =>
  ({
    id: o.id ?? 'n1', title: o.title ?? '', body: o.body ?? '', folder: null,
    created_at: '2026-06-01T00:00:00Z', updated_at: o.updated_at ?? '2026-06-01T00:00:00Z',
    deleted_at: o.deleted_at ?? null, ...o,
  }) as Note;

const wi = (o: Partial<WorkItem>): WorkItem =>
  ({
    id: o.id ?? 'w1', title: 'Task', type: 'task', priority: 'medium', due_date: null,
    project_id: null, person_id: o.person_id ?? 'pA', notes: '', done: false, inboxed: false,
    source: 'you', completed_at: null, related_entities: o.related_entities,
    created_at: '2026-06-01T00:00:00Z', updated_at: '', deleted_at: null, ...o,
  }) as WorkItem;

const raiseNote = (personId: string, ids: string[], extra: Partial<Note> = {}) =>
  note({ id: extra.id ?? `rn-${personId}`, title: raiseNoteTitle(personId), body: JSON.stringify({ raised: ids }), ...extra });

describe('raise list storage', () => {
  it('uses a __-prefixed title so the Notes screen hides it by convention', () => {
    expect(raiseNoteTitle('pAnna')).toBe('__raise__pAnna');
    expect(RAISE_PREFIX.startsWith('__')).toBe(true);
  });

  it('newest live note wins when duplicates exist (two-device race)', () => {
    const notes = [
      raiseNote('pA', ['old'], { id: 'r1', updated_at: '2026-06-01T00:00:00Z' }),
      raiseNote('pA', ['new'], { id: 'r2', updated_at: '2026-06-02T00:00:00Z' }),
      raiseNote('pA', ['deleted'], { id: 'r3', updated_at: '2026-06-03T00:00:00Z', deleted_at: '2026-06-04' }),
    ];
    expect(findRaiseNote(notes, 'pA')?.id).toBe('r2');
  });

  it('parses defensively: junk bodies yield an empty list', () => {
    expect(parseRaiseBody(null)).toEqual([]);
    expect(parseRaiseBody('not json')).toEqual([]);
    expect(parseRaiseBody('{"raised": "nope"}')).toEqual([]);
    expect(parseRaiseBody('{"raised": ["a", 5, null, "b"]}')).toEqual(['a', 'b']);
  });
});

describe('readRaiseList pruning (the list can never lie)', () => {
  it('keeps only ids whose task is open, live, and still with this person', () => {
    const items = [
      wi({ id: 'open' }),
      wi({ id: 'done', done: true }),
      wi({ id: 'gone', deleted_at: '2026-06-10' }),
      wi({ id: 'moved', person_id: 'pB' }), // handed off entirely, no link back
    ];
    const notes = [raiseNote('pA', ['open', 'done', 'gone', 'moved', 'missing'])];
    expect(readRaiseList(notes, items, 'pA')).toEqual(['open']);
  });

  it('keeps a task whose ball moved elsewhere but is still linked (involved)', () => {
    const items = [
      wi({
        id: 'shared', person_id: 'pB',
        related_entities: [
          { type: 'person', id: 'pA', name: 'Anna' },
          { type: 'person', id: 'pB', name: 'Bob' },
        ],
      }),
    ];
    expect(readRaiseList([raiseNote('pA', ['shared'])], items, 'pA')).toEqual(['shared']);
  });

  it('preserves raise order', () => {
    const items = [wi({ id: 'a' }), wi({ id: 'b' }), wi({ id: 'c' })];
    expect(readRaiseList([raiseNote('pA', ['b', 'c', 'a'])], items, 'pA')).toEqual(['b', 'c', 'a']);
  });
});

describe('legacy __agenda__ migration', () => {
  const legacy = (personId: string, items: unknown[], extra: Partial<Note> = {}) =>
    note({ id: extra.id ?? `lg-${personId}`, title: `__agenda__${personId}`, body: JSON.stringify({ items }), ...extra });

  it('carries queue entries that reference a work_item; title-only copies are dropped', () => {
    const items = [wi({ id: 'w1' })];
    const notes = [
      legacy('pA', [
        { id: 'q1', title: 'Real task', source_item_id: 'w1' },
        { id: 'q2', title: 'Loose title with no task' },
      ]),
    ];
    expect(readRaiseList(notes, items, 'pA')).toEqual(['w1']);
  });

  it('unions and dedupes against the new note, new ids first', () => {
    const items = [wi({ id: 'w1' }), wi({ id: 'w2' })];
    const notes = [
      raiseNote('pA', ['w1']),
      legacy('pA', [
        { id: 'q1', title: 'Dup', source_item_id: 'w1' },
        { id: 'q2', title: 'Fresh', source_item_id: 'w2' },
      ]),
    ];
    expect(readRaiseList(notes, items, 'pA')).toEqual(['w1', 'w2']);
  });

  it('legacy entries prune like native ones (done/unlinked tasks do not migrate)', () => {
    const items = [wi({ id: 'w1', done: true })];
    const notes = [legacy('pA', [{ id: 'q1', title: 'Done already', source_item_id: 'w1' }])];
    expect(readRaiseList(notes, items, 'pA')).toEqual([]);
  });

  it('another person\'s notes never bleed in', () => {
    const items = [wi({ id: 'w1' }), wi({ id: 'w2', person_id: 'pB' })];
    const notes = [raiseNote('pA', ['w1']), raiseNote('pB', ['w2'])];
    expect(readRaiseList(notes, items, 'pA')).toEqual(['w1']);
    expect(readRaiseList(notes, items, 'pB')).toEqual(['w2']);
  });
});
