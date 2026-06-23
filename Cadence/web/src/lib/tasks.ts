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

// A task is considered "filed" (out of the triage Inbox) once it has been
// assigned a home: a person or a project. A bare due date is deliberately NOT
// enough — adding a date in the editor shouldn't make an un-triaged capture
// silently vanish from the Inbox before you've said where it belongs.
export const isFiled = (w: Pick<WorkItem, 'person_id' | 'project_id'>): boolean =>
  !!(w.person_id || w.project_id);

// Tasks owned by an agent rather than the user. `for:kobe` = delegated to Kobe;
// `agent:kobe` / `agent:ace` = created by an agent. These belong on the Kobe/Ace
// screens, not in the user's own Today / Tasks / Inbox lists or counts.
export const isAgentTask = (w: Pick<WorkItem, 'source'>): boolean =>
  /^(for:|agent:)/.test(w.source || '');

// The user's own open work — excludes completed and agent-owned items. This is
// the canonical base filter for every user-facing task list and count.
export const isUserTask = (w: Pick<WorkItem, 'done' | 'source'>): boolean =>
  !w.done && !isAgentTask(w);

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
