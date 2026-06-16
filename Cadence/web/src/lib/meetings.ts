// Next 1:1 meeting dates — stored in a single synced `notes` record titled
// `__meeting_dates__` as a JSON map { [noteId]: "YYYY-MM-DD" }.
//
// Keys are note IDs (the ID of the meeting-note itself). Person-ID-keyed entries
// written by older versions of the app are silently ignored — they will expire
// naturally and no longer appear in the UI.
//
// getNextMeeting() returns the soonest FUTURE date across all of a person's
// meeting notes. If all dates are in the past (or none exist), returns null.

import { useMemo, useRef } from 'react';
import { useCadence } from './store';
import type { Note } from './types';
import { todayStr } from './util';

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

// Returns the earliest upcoming date for a person, considering only meeting
// notes in that person's folder. Returns null when nothing is upcoming.
export function getNextMeeting(
  personId: string,
  allNotes: Note[],
  dateMap: MeetingDates,
): string | null {
  const today = todayStr();
  const folder = `__mtg__${personId}`;
  const candidates: string[] = [];

  for (const note of allNotes) {
    if (note.folder === folder && dateMap[note.id]) {
      candidates.push(dateMap[note.id]);
    }
  }

  const future = candidates.filter((d) => d >= today).sort();
  return future[0] || null;
}

export function useMeetingDates() {
  const { data, insert, update } = useCadence();

  const metaNote = useMemo(
    () =>
      data.notes
        .filter((n) => n.title === MEETING_DATES_NOTE_TITLE)
        .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''))[0],
    [data.notes],
  );

  const dates = useMemo(() => readMeetingDates(data.notes), [data.notes]);

  // Always holds the latest dates map so concurrent setMeetingDate calls don't
  // clobber each other with a stale snapshot from the previous render cycle.
  const datesRef = useRef<MeetingDates>({});
  datesRef.current = dates;

  const setMeetingDate = async (noteId: string, date: string | null) => {
    const next = { ...datesRef.current };
    if (date) next[noteId] = date;
    else delete next[noteId];
    // Optimistically update the ref so back-to-back calls see fresh state
    // before React re-renders.
    datesRef.current = next;
    const body = JSON.stringify(next);
    if (metaNote) await update('notes', metaNote.id, { body } as any);
    else await insert('notes', { title: MEETING_DATES_NOTE_TITLE, body } as any);
  };

  return { dates, setMeetingDate };
}
