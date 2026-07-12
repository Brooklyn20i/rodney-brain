// The per-person 1:1 agenda queue — "must raise X with Sarah at our next 1:1"
// captured from anywhere, held until the next meeting exists, then merged into
// its agenda by the meeting modal.
//
// Storage: one hidden note per person titled `__agenda__<personId>` with body
// {"items": AgendaItem[]}. The `__` prefix keeps it out of the Notes screen,
// the python agent treats note bodies as opaque, and no migration is needed.
// Queue item ids are preserved when merged into the meeting agenda, so a
// re-merge race is idempotent (dedupe by id first).

import { useCallback, useRef } from 'react';
import { useCadence } from './store';
import type { Note } from './types';
import type { AgendaItem } from './meetingData';
import { uid } from './meetingData';

export const AGENDA_QUEUE_PREFIX = '__agenda__';
export const agendaQueueTitle = (personId: string) => `${AGENDA_QUEUE_PREFIX}${personId}`;

export function findAgendaQueueNote(notes: Note[], personId: string): Note | undefined {
  // Newest updated_at wins if duplicates ever exist (same rule as
  // __meeting_dates__ in lib/meetings.ts).
  return notes
    .filter((n) => n.title === agendaQueueTitle(personId) && !n.deleted_at)
    .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''))[0];
}

export function parseQueueBody(body: string | null | undefined): AgendaItem[] {
  if (!body) return [];
  try {
    const p = JSON.parse(body);
    return Array.isArray(p?.items) ? (p.items as AgendaItem[]) : [];
  } catch {
    return [];
  }
}

export function readAgendaQueue(notes: Note[], personId: string): AgendaItem[] {
  return parseQueueBody(findAgendaQueueNote(notes, personId)?.body);
}

export interface QueueInput {
  title: string;
  notes?: string;
  source_item_id?: string; // set when raising an existing work_item — keeps ledger row and agenda row one record
}

// Pure: append an item to a queue, or return null when it's already there
// (by source_item_id, then case-insensitive title).
export function addToQueueItems(existing: AgendaItem[], input: QueueInput): AgendaItem[] | null {
  const title = input.title.trim();
  if (!title) return null;
  const dup = existing.some((e) =>
    (input.source_item_id && e.source_item_id === input.source_item_id) ||
    e.title.toLowerCase() === title.toLowerCase());
  if (dup) return null;
  const item: AgendaItem = {
    id: uid(), title, notes: input.notes || '', status: 'discuss',
    ...(input.source_item_id ? { source_item_id: input.source_item_id } : {}),
  };
  return [...existing, item];
}

export type EnqueueResult = 'queued' | 'duplicate' | 'empty';

// Hook: enqueue/clear against the freshest store snapshot (ref-guarded, the
// useMeetingDates pattern) so back-to-back enqueues can't clobber each other.
export function useAgendaQueue() {
  const { data, insert, update } = useCadence();
  const notesRef = useRef(data.notes);
  notesRef.current = data.notes;

  const enqueue = useCallback(async (personId: string, input: QueueInput): Promise<EnqueueResult> => {
    if (!input.title.trim()) return 'empty';
    const note = findAgendaQueueNote(notesRef.current, personId);
    const existing = parseQueueBody(note?.body);
    const next = addToQueueItems(existing, input);
    if (!next) return 'duplicate';
    const body = JSON.stringify({ items: next });
    if (note) await update('notes', note.id, { body } as Partial<Note>);
    else await insert('notes', { title: agendaQueueTitle(personId), body } as Partial<Note>);
    return 'queued';
  }, [insert, update]);

  const clear = useCallback(async (personId: string, ids: string[]) => {
    const note = findAgendaQueueNote(notesRef.current, personId);
    if (!note) return;
    const remaining = parseQueueBody(note.body).filter((i) => !ids.includes(i.id));
    await update('notes', note.id, { body: JSON.stringify({ items: remaining }) } as Partial<Note>);
  }, [update]);

  return { enqueue, clear };
}
