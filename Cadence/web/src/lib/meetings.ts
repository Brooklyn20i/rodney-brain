// Next 1:1 meeting dates.
//
// Stored in a single synced `notes` record (title `__meeting_dates__`) as a JSON
// map of { [personId]: "YYYY-MM-DD" }. This deliberately avoids a dedicated DB
// column (which would need a manual schema migration) — the `notes` table always
// exists, so saving a meeting date "just works" with no setup. Same pattern as
// the `__win_state__` / `__win_strategy__` records.

import { useMemo } from 'react';
import { useCadence } from './store';

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
      // keep only valid string dates
      const out: MeetingDates = {};
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof v === 'string' && v) out[k] = v;
      }
      return out;
    }
  } catch { /* unparseable — treat as empty */ }
  return {};
}

// Hook: returns the current map plus a setter that persists a single person's
// date (pass null/'' to clear it).
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

  const setMeetingDate = async (personId: string, date: string | null) => {
    const next = { ...dates };
    if (date) next[personId] = date;
    else delete next[personId];
    const body = JSON.stringify(next);
    if (note) await update('notes', note.id, { body } as any);
    else await insert('notes', { title: MEETING_DATES_NOTE_TITLE, body } as any);
  };

  return { dates, setMeetingDate };
}
