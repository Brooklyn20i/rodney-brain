import { useMemo } from 'react';
import { useCadence } from '../lib/store';
import { getUpcomingNoteId, readMergedMeetingDates, MTG_FOLDER_PREFIX } from '../lib/meetings';
import { readAgendaQueue } from '../lib/agendaQueue';
import { readPrepTopics } from '../lib/prepTopics';
import { parseMeeting } from '../lib/meetingData';
import type { Note, Person } from '../lib/types';
import { initials, todayStr, addDaysStr, fmtWeekDM } from '../lib/util';

// The first thing Home answers: "what's my meeting schedule?" Every scheduled
// meeting occurrence, grouped by day — today first — so a day with three 1:1s
// shows all three. Robust about where the date is stored: a date filed against
// the meeting note (current) OR against the person (older format) both surface,
// and dates split across duplicate date-records are merged back in. Tap a card
// to deep-open and prep.
const MAX_MEETINGS = 12;

function dayLabel(date: string, today: string): string {
  if (date === today) return 'Today';
  if (date === addDaysStr(1)) return 'Tomorrow';
  return fmtWeekDM(date); // e.g. "Tue 16/07"
}

export function TodayStrip({ onNavigate }: { onNavigate?: (screen: string, id?: string | null) => void }) {
  const { data } = useCadence();

  const days = useMemo(() => {
    const today = todayStr();
    // Merge every copy of the meeting-dates record so nothing is dropped.
    const dates = readMergedMeetingDates(data.notes);
    const peopleById = new Map(data.people.filter((p) => !p.deleted_at).map((p) => [p.id, p] as const));

    type Occ = { key: string; person: Person; note?: Note; date: string };
    const occs: Occ[] = [];
    // Person+date pairs covered by a real meeting note — so a legacy
    // person-filed date for the SAME meeting isn't shown twice. Two distinct
    // notes for one person on one day are two real meetings and both stay.
    const noteCovered = new Set<string>();

    // 1. Dates filed against a specific meeting note (current format).
    for (const note of data.notes) {
      if (note.deleted_at || !(note.folder || '').startsWith(MTG_FOLDER_PREFIX)) continue;
      const date = dates[note.id];
      if (!date || date < today) continue;
      const person = peopleById.get((note.folder || '').slice(MTG_FOLDER_PREFIX.length));
      if (!person) continue;
      noteCovered.add(`${person.id}|${date}`);
      occs.push({ key: note.id, person, note, date });
    }

    // 2. Dates filed against the person directly (older format the reader used
    //    to ignore). This is the most likely reason established meetings went
    //    missing while only a freshly-dated one survived. Skip if a note already
    //    represents that person's meeting on that day.
    for (const [personId, person] of peopleById) {
      const date = dates[personId];
      if (!date || date < today) continue;
      if (noteCovered.has(`${personId}|${date}`)) continue;
      occs.push({ key: `${personId}@${date}`, person, date });
    }

    const ordered = occs
      .sort((a, b) => a.date.localeCompare(b.date) || a.person.name.localeCompare(b.person.name))
      .slice(0, MAX_MEETINGS);

    const cards = ordered.map(({ key, person, note, date }) => {
      const isGroup = person.type === 'meeting_group';
      let chip: string;
      if (isGroup) {
        const topics = readPrepTopics(data.notes, person.id).filter((t) => t.status !== 'covered');
        const ready = topics.filter((t) => t.status === 'ready').length;
        chip = topics.length ? `${ready} ready / ${topics.length} topics` : 'No topics yet';
      } else {
        const agenda = note ? parseMeeting(note.body || '').data.agenda.filter((a) => a.status !== 'covered').length : 0;
        const isUpcoming = getUpcomingNoteId(person.id, data.notes, dates) === note?.id;
        const queued = (!note || isUpcoming) ? readAgendaQueue(data.notes, person.id).length : 0;
        chip = agenda + queued ? `${agenda} agenda${queued ? ` + ${queued} queued` : ''}` : 'No agenda yet';
      }
      return { key, person, isGroup, date, chip };
    });

    const buckets: { date: string; label: string; isToday: boolean; cards: typeof cards }[] = [];
    for (const c of cards) {
      let g = buckets.find((b) => b.date === c.date);
      if (!g) { g = { date: c.date, label: dayLabel(c.date, today), isToday: c.date === today, cards: [] }; buckets.push(g); }
      g.cards.push(c);
    }
    return buckets;
  }, [data.notes, data.people]);

  const hasPeople = data.people.some((p) => !p.deleted_at);
  if (!hasPeople && days.length === 0) return null;

  return (
    <div className="today-strip" aria-label="Upcoming meetings">
      <div className="today-strip-label">Upcoming meetings</div>
      {days.length === 0 ? (
        <div className="today-strip-empty">
          No upcoming meetings. Set a date on a 1:1 in People or Meetings and it shows here.
        </div>
      ) : days.map((day) => (
        <div key={day.date} className="today-strip-day">
          <div className={`today-strip-daylabel${day.isToday ? ' now' : ''}`}>{day.label}</div>
          <div className="today-strip-cards">
            {day.cards.map((c) => (
              <button
                key={c.key}
                className={`today-strip-card${day.isToday ? ' today-strip-card-now' : ''}`}
                onClick={() => onNavigate?.(c.isGroup ? 'meetings' : 'people', c.person.id)}
              >
                <span className="avatar avatar-sm" style={{ background: c.person.color || '#3A7CA5' }}>
                  {c.isGroup ? '▣' : initials(c.person.name)}
                </span>
                <span className="today-strip-name">{c.person.name}</span>
                <span className="today-strip-chip">{c.chip}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
