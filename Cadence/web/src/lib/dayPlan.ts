// "Today's focus" — the handful of tasks Rodney hand-picks and orders for the
// day. Dates in this app are loose guides; the pinned list is the deliberate
// plan, so it sits above everything else on Home.
//
// Storage: one hidden note titled `__day_plan__` with body {"pinned": [ids]}.
// Being a note, it syncs across his three devices via the existing notes
// realtime channel; ids of done/deleted tasks are pruned on read so the plan
// never accumulates ghosts.

import { useCallback, useMemo, useRef } from 'react';
import { useCadence } from './store';
import type { Note, WorkItem } from './types';

export const DAY_PLAN_TITLE = '__day_plan__';

export function findDayPlanNote(notes: Note[]): Note | undefined {
  return notes
    .filter((n) => n.title === DAY_PLAN_TITLE && !n.deleted_at)
    .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''))[0];
}

export function parseDayPlanBody(body: string | null | undefined): string[] {
  if (!body) return [];
  try {
    const p = JSON.parse(body);
    return Array.isArray(p?.pinned) ? (p.pinned as unknown[]).filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

// Pinned ids that still point at open, live tasks — order preserved.
export function readDayPlan(notes: Note[], items: WorkItem[]): string[] {
  const ids = parseDayPlanBody(findDayPlanNote(notes)?.body);
  const live = new Set(items.filter((w) => !w.deleted_at && !w.done).map((w) => w.id));
  return ids.filter((id) => live.has(id));
}

export function useDayPlan() {
  const { data, insert, update } = useCadence();
  const notesRef = useRef(data.notes);
  notesRef.current = data.notes;
  const itemsRef = useRef(data.work_items);
  itemsRef.current = data.work_items;

  const pinned = useMemo(() => readDayPlan(data.notes, data.work_items), [data.notes, data.work_items]);

  // All writes re-read the freshest snapshot (the useMeetingDates pattern) so
  // pin/unpin/move from two quick taps can't clobber each other.
  const write = useCallback(async (next: string[]) => {
    const note = findDayPlanNote(notesRef.current);
    const body = JSON.stringify({ pinned: next });
    if (note) await update('notes', note.id, { body } as Partial<Note>);
    else await insert('notes', { title: DAY_PLAN_TITLE, body } as Partial<Note>);
  }, [insert, update]);

  const current = useCallback(() => readDayPlan(notesRef.current, itemsRef.current), []);

  const pin = useCallback(async (id: string) => {
    const now = current();
    if (now.includes(id)) return;
    await write([...now, id]);
  }, [current, write]);

  const unpin = useCallback(async (id: string) => {
    await write(current().filter((x) => x !== id));
  }, [current, write]);

  const move = useCallback(async (id: string, dir: -1 | 1) => {
    const now = current();
    const i = now.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= now.length) return;
    const next = [...now];
    [next[i], next[j]] = [next[j], next[i]];
    await write(next);
  }, [current, write]);

  return { pinned, pin, unpin, move };
}
