// Filing a meeting action into the task system — extracted from the Tasks
// screen so the Tasks hub and Meetings screen share one implementation.
//
// Filing = create a work_item carrying the action's due date and owner, then
// mark the action `pushed` inside its source meeting note so it stops showing
// as "needs filing". The two hazards this guards against:
//  • double-filing (rapid taps, stale realtime snapshots) → an in-flight set
//    plus a pushed-check against the freshest note body;
//  • clobbering a concurrent edit to a sibling action in the same note → the
//    note body is re-read via `getNotes()` right before writing.

import type { Note, WorkItem } from './types';
import { parseMeeting, serializeMeeting } from './meetingData';
import { buildTaskFromAction } from './tasks';
import type { OpenMeetingAction, PushTarget } from './tasks';

export interface MeetingActionStore {
  insert: (table: 'work_items', row: Partial<WorkItem>) => Promise<unknown>;
  update: (table: 'notes', id: string, patch: Partial<Note>) => Promise<unknown>;
}

export type FileOutcome = 'filed' | 'already-filed' | 'in-flight';

// Label recorded in the note as `pushed_to` when no explicit target is chosen
// (the action goes straight to the Tasks hub).
export const UNTARGETED_LABEL = 'Tasks';

export function createMeetingActionFiler(store: MeetingActionStore) {
  const inFlight = new Set<string>();

  return async function fileAction(
    getNotes: () => Note[],
    action: OpenMeetingAction,
    target: PushTarget | null,
  ): Promise<FileOutcome> {
    const guardKey = `${action.noteId}:${action.id}`;
    if (inFlight.has(guardKey)) return 'in-flight';

    const note = getNotes().find((n) => n.id === action.noteId);
    if (note) {
      const { data: parsed } = parseMeeting(note.body);
      const current = parsed.actions.find((a) => a.id === action.id);
      if (current?.pushed) return 'already-filed';
    }

    inFlight.add(guardKey);
    try {
      const payload = buildTaskFromAction(action, action.noteTitle, target) as Partial<WorkItem>;
      // No target = "send to Tasks": it is deliberately filed, not re-inboxed.
      if (!target) payload.inboxed = false;
      await store.insert('work_items', payload);

      // Re-read the freshest note body right before writing so we don't
      // clobber a concurrent edit to a sibling action in the same note.
      const fresh = getNotes().find((n) => n.id === action.noteId);
      if (fresh) {
        const { data: parsed, raw } = parseMeeting(fresh.body);
        const label = target ? target.name : UNTARGETED_LABEL;
        const updated = parsed.actions.map((a) =>
          a.id === action.id ? { ...a, pushed: true, pushed_to: label } : a);
        await store.update('notes', action.noteId, {
          body: serializeMeeting({ ...parsed, actions: updated }, raw),
        } as Partial<Note>);
      }
      return 'filed';
    } finally {
      inFlight.delete(guardKey);
    }
  };
}
