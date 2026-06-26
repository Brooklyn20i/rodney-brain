// Pure (React-free) meeting-note data model + parser.
//
// Meeting notes store their structured body as JSON: { agenda, actions, notes }.
// These helpers are kept out of the React component (MeetingNoteModal) so that
// non-UI modules (e.g. lib/tasks.ts, the Tasks hub) can parse meeting bodies
// without pulling in the editor and creating an import cycle.

export interface AgendaItem {
  id: string; title: string; notes: string;
  status: 'discuss' | 'covered' | 'deferred';
  source_item_id?: string; // set when imported from a work item; enables "Close task" inline
}
export interface ActionItem {
  id: string; title: string;
  owner: 'me' | 'them';
  owner_label?: string;      // display name for 'them' owner
  owner_person_id?: string;  // links to a person in the people table
  due: string; done: boolean; pushed: boolean;
  pushed_to?: string;        // display label after send (e.g. "Sarah Chen" or "Project X")
}
export interface MeetingData {
  agenda: AgendaItem[];
  actions: ActionItem[];
  notes: string;
}

export const emptyMeeting = (): MeetingData => ({ agenda: [], actions: [], notes: '' });
// crypto.randomUUID avoids the collision risk of short Math.random ids — these
// ids are React keys and are matched across notes (carry-forward, dedupe).
export const uid = () =>
  (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2, 10);

// `raw` is the full parsed object. Unknown top-level keys (written by a newer
// web build, the Swift app, or the Python agent — all sharing the notes table)
// are preserved here so serializeMeeting can write them back instead of
// silently dropping them on the next save.
export function parseMeeting(body: string): { data: MeetingData; isLegacy: boolean; raw: Record<string, unknown> } {
  if (!body.trim()) return { data: emptyMeeting(), isLegacy: false, raw: {} };
  try {
    const p = JSON.parse(body);
    if (p && typeof p === 'object' && ('agenda' in p || 'actions' in p)) {
      return {
        data: { agenda: p.agenda || [], actions: p.actions || [], notes: p.notes || '' },
        isLegacy: false,
        raw: p as Record<string, unknown>,
      };
    }
  } catch {}
  return { data: { agenda: [], actions: [], notes: body }, isLegacy: true, raw: {} };
}

// Serialize a meeting body, preserving any forward-compat keys from `raw`.
// Always pass the `raw` returned by parseMeeting for the same note.
export function serializeMeeting(data: MeetingData, raw: Record<string, unknown> = {}): string {
  return JSON.stringify({ ...raw, agenda: data.agenda, actions: data.actions, notes: data.notes });
}
