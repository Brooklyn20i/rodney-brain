// Shared task helpers — used by the Tasks hub, the Inbox, meeting "push"
// flows, and quick capture. Centralising these guarantees that converting a
// meeting action into a work_item always carries its due date and owner, and
// that the "filed vs needs-triage" rule is applied consistently everywhere.

import type { Note, WorkItem } from './types';
import type { ActionItem } from './meetingData';
import { parseMeeting } from './meetingData';

export const MTG_FOLDER_PREFIX = '__mtg__';

export interface PushTarget {
  id: string;
  type: 'person' | 'project';
  name: string;
}

// A task is considered "filed" (out of the triage Inbox) once it has any
// context that tells you where it belongs: a person, a project, or a due date.
export const isFiled = (w: Pick<WorkItem, 'person_id' | 'project_id' | 'due_date'>): boolean =>
  !!(w.person_id || w.project_id || w.due_date);

// Build the work_item payload for a meeting action. An explicit target wins;
// otherwise fall back to the action's own owner_person_id. The action's due
// date is always preserved. Unassigned actions land in the triage Inbox.
export function buildTaskFromAction(
  action: ActionItem,
  meetingTitle: string,
  target?: PushTarget | null,
): Partial<WorkItem> {
  const personId =
    target?.type === 'person' ? target.id : action.owner_person_id || null;
  const projectId = target?.type === 'project' ? target.id : null;
  const payload: Partial<WorkItem> = {
    title: action.title,
    type: 'task',
    priority: 'medium',
    due_date: action.due || null,
    person_id: personId,
    project_id: projectId,
    notes: `Action from: ${meetingTitle}`,
    inboxed: !(personId || projectId),
    source: 'meeting',
  };
  return payload;
}

export type OpenMeetingAction = ActionItem & {
  noteId: string;
  noteTitle: string;
  folderOwnerId: string; // the person/group id the meeting belongs to
};

// Every open (not done, not yet pushed) action across all meeting notes — the
// raw material for the "From meetings — needs filing" group in the Tasks hub.
export function collectOpenMeetingActions(notes: Note[]): OpenMeetingAction[] {
  const out: OpenMeetingAction[] = [];
  for (const note of notes) {
    if (!note.folder || !note.folder.startsWith(MTG_FOLDER_PREFIX)) continue;
    const { data } = parseMeeting(note.body);
    for (const a of data.actions) {
      if (!a.done && !a.pushed && a.title.trim()) {
        out.push({
          ...a,
          noteId: note.id,
          noteTitle: note.title,
          folderOwnerId: note.folder.slice(MTG_FOLDER_PREFIX.length),
        });
      }
    }
  }
  return out;
}
