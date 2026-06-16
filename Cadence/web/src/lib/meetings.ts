// Next 1:1 meeting dates.
//
// Stored in a single synced `notes` record (title `__meeting_dates__`) as a JSON
// map. Keys are either:
//   - a note ID  → date set via the meeting modal for that specific meeting note
//   - a person ID → manual date set via the PersonModal "Next 1:1" field
//
// "Next meeting" for a person = earliest future date across all their meeting
// notes + any manual override. Deleting a meeting note automatically drops it
// from the calculation (the note is gone so we skip its key).

import { useMemo } from 'react';
import { useCadence } from './store';
import type { Note } from './types';

export const MEETING_DATES_NOTE_TITLE = '__meeting_dates__';

export type MeetingDates = Record<string, string>;

export function readMeetingDates(
  notes: { title: string; body: string; updated_at?: string }[],
): MeetingDates {
  const note = notes
    .filter((n) => n.title === MEETING_DATES_NOTE_TITLE)
    .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''))[0];
  if (!note) return {};
  try {
    const parsed = JSON.parse(note.body || '{}');
    if (parsed && typeof parsed === 'object') {
      const out: MeetingDates = {};
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof v === 'string' && v) out[k] = v;
      }
      return out;
    }
  } catch { /* unparseable */ }
  return {};
}

// Returns the earliest upcoming date for a person, considering:
//  • all meeting notes for that person that have a date in the map
//  • any manual date stored under personId (from PersonModal)
export function getNextMeeting(
  personId: string,
  allNotes: Note[],
  dateMap: MeetingDates,
): string | null {
  const today = new Date().toISOString().slice(0, 10);
  const folder = `__mtg__${personId}`;
  const candidates: string[] = [];

  for (const note of allNotes) {
    if (note.folder === folder && dateMap[note.id]) {
      candidates.push(dateMap[note.id]);
    }
  }

  // Also include any manual date set on the person directly
  if (dateMap[personId]) candidates.push(dateMap[personId]);

  const future = candidates.filter((d) => d >= today).sort();
  return future[0] || null;
}

export function useMeetingDates() {
  const { data, insert, update } = useCadence();
  const note = useMemo(
    () =>
      data.notes
        .filter((n) => n.title === MEETING_DATES_NOTE_TITLE)
        .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''))[0],
    [data.notes],
  );
  const dates = useMemo(() => readMeetingDates(data.notes), [data.notes]);

  // key can be a noteId (for meeting modal) or personId (for PersonModal)
  const setMeetingDate = async (key: string, date: string | null) => {
    const next = { ...dates };
    if (date) next[key] = date;
    else delete next[key];
    const body = JSON.stringify(next);
    if (note) await update('notes', note.id, { body } as any);
    else await insert('notes', { title: MEETING_DATES_NOTE_TITLE, body } as any);
  };

  return { dates, setMeetingDate };
}
