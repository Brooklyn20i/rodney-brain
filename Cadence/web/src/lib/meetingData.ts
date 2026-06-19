// Pure (React-free) meeting-note data model + parser.
//
// Meeting notes store their structured body as JSON: { agenda, actions, notes }.
// These helpers are kept out of the React component (MeetingNoteModal) so that
// non-UI modules (e.g. lib/tasks.ts, the Tasks hub) can parse meeting bodies
// without pulling in the editor and creating an import cycle.

export interface AgendaItem {
  id: string; title: string; notes: string;
  status: 'discuss' | 'covered' | 'deferred';
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
export const uid = () => Math.random().toString(36).slice(2, 10);

export function parseMeeting(body: string): { data: MeetingData; isLegacy: boolean } {
  if (!body.trim()) return { data: emptyMeeting(), isLegacy: false };
  try {
    const p = JSON.parse(body);
    if (p && typeof p === 'object' && ('agenda' in p || 'actions' in p)) {
      return {
        data: { agenda: p.agenda || [], actions: p.actions || [], notes: p.notes || '' },
        isLegacy: false,
      };
    }
  } catch {}
  return { data: { agenda: [], actions: [], notes: body }, isLegacy: true };
}
