// "Raise at next 1:1" — a flag on REAL ledger tasks, not a parallel agenda.
// The flagged tasks group at the top of the person page as "Next 1:1"; work
// them there (tick done, flip the ball, log updates) because they ARE the
// ledger records. "Covered" unflags without completing; finishing the task
// clears the flag automatically via the prune.
//
// Storage: one hidden note per person titled `__raise__<personId>` with body
// {"raised": ["<workItemId>", ...]} — the lib/dayPlan.ts id-list pattern. The
// `__` prefix keeps it out of the Notes screen, it syncs across devices via
// the notes realtime channel, and ids that stop being raisable (done, deleted,
// handed to someone else entirely) are pruned on read so the list never
// accumulates ghosts.
//
// Predecessor: `__agenda__<personId>` notes stored TITLE COPIES of tasks — a
// shadow list nothing merged anywhere. readRaiseList lazily migrates entries
// that reference a work_item (source_item_id); the first write finalises the
// migration by deleting the legacy note.

import { useCallback, useRef } from 'react';
import { useCadence } from './store';
import { isLinkedToPerson } from './tasks';
import type { Note, WorkItem } from './types';

export const RAISE_PREFIX = '__raise__';
export const raiseNoteTitle = (personId: string) => `${RAISE_PREFIX}${personId}`;

const LEGACY_AGENDA_PREFIX = '__agenda__';
const legacyAgendaTitle = (personId: string) => `${LEGACY_AGENDA_PREFIX}${personId}`;

const newestLive = (notes: Note[], title: string): Note | undefined =>
  notes
    .filter((n) => n.title === title && !n.deleted_at)
    .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''))[0];

export function findRaiseNote(notes: Note[], personId: string): Note | undefined {
  return newestLive(notes, raiseNoteTitle(personId));
}

export function parseRaiseBody(body: string | null | undefined): string[] {
  if (!body) return [];
  try {
    const p = JSON.parse(body);
    return Array.isArray(p?.raised) ? (p.raised as unknown[]).filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

// Legacy queue entries that reference a real work_item carry over; title-only
// copies are dropped (no shadow records in the new model).
function legacyRaisedIds(notes: Note[], personId: string): string[] {
  const note = newestLive(notes, legacyAgendaTitle(personId));
  if (!note?.body) return [];
  try {
    const p = JSON.parse(note.body);
    const items = Array.isArray(p?.items) ? (p.items as unknown[]) : [];
    return items
      .map((i) => (i && typeof i === 'object' ? (i as { source_item_id?: unknown }).source_item_id : undefined))
      .filter((x): x is string => typeof x === 'string');
  } catch {
    return [];
  }
}

// An id stays raised only while the task is open, live, and still "with" this
// person — holding the ball (person_id) or at least involved (linked).
const raisableFor = (w: WorkItem | undefined, personId: string): boolean =>
  Boolean(w && !w.deleted_at && !w.done && (w.person_id === personId || isLinkedToPerson(w, personId)));

/** Raised work_item ids for a person — migrated, deduped, pruned; order preserved. */
export function readRaiseList(notes: Note[], items: WorkItem[], personId: string): string[] {
  const ids = parseRaiseBody(findRaiseNote(notes, personId)?.body);
  for (const legacy of legacyRaisedIds(notes, personId)) {
    if (!ids.includes(legacy)) ids.push(legacy);
  }
  const byId = new Map(items.map((w) => [w.id, w]));
  return ids.filter((id) => raisableFor(byId.get(id), personId));
}

export function useRaiseList() {
  const { data, insert, update, remove } = useCadence();
  const notesRef = useRef(data.notes);
  notesRef.current = data.notes;
  const itemsRef = useRef(data.work_items);
  itemsRef.current = data.work_items;

  // All writes re-read the freshest snapshot (the useDayPlan pattern) so two
  // quick taps can't clobber each other. The first write also finalises the
  // legacy migration: once the ids live in the new note, the old queue note
  // must go, or an unraised legacy id would resurrect through the read-union.
  const write = useCallback(async (personId: string, next: string[]) => {
    const note = findRaiseNote(notesRef.current, personId);
    const body = JSON.stringify({ raised: next });
    if (note) await update('notes', note.id, { body } as Partial<Note>);
    else await insert('notes', { title: raiseNoteTitle(personId), body } as Partial<Note>);
    const legacy = newestLive(notesRef.current, legacyAgendaTitle(personId));
    if (legacy) {
      try {
        await remove('notes', legacy.id);
      } catch {
        // Best-effort; the read-union keeps behaving until the next write.
      }
    }
  }, [insert, update, remove]);

  const current = useCallback(
    (personId: string) => readRaiseList(notesRef.current, itemsRef.current, personId),
    []
  );

  // Append unconditionally — the prune applies to STORED ids on read, so
  // raising in the same tick as filing to the person (triage) can't lose the
  // flag to the store-echo race.
  const raise = useCallback(async (personId: string, workItemId: string) => {
    const now = current(personId);
    if (now.includes(workItemId)) return;
    await write(personId, [...now, workItemId]);
  }, [current, write]);

  const unraise = useCallback(async (personId: string, workItemId: string) => {
    await write(personId, current(personId).filter((x) => x !== workItemId));
  }, [current, write]);

  const toggle = useCallback(async (personId: string, workItemId: string) => {
    if (current(personId).includes(workItemId)) await unraise(personId, workItemId);
    else await raise(personId, workItemId);
  }, [current, raise, unraise]);

  return { raise, unraise, toggle };
}
