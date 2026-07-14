import { useMemo } from 'react';
import { useCadence } from '../lib/store';
import { useMeetingDates, getUpcomingNoteId, MTG_FOLDER_PREFIX } from '../lib/meetings';
import { readAgendaQueue } from '../lib/agendaQueue';
import { readPrepTopics } from '../lib/prepTopics';
import { parseMeeting } from '../lib/meetingData';
import { initials, todayStr, addDaysStr, fmtWeekDM } from '../lib/util';

// The first thing Home answers: "what's my meeting schedule?" Every scheduled
// meeting occurrence (a dated note in a person/series folder), grouped by day —
// so a day with three 1:1s shows all three, not just the next one. Today first,
// each card showing prep readiness. Tap to deep-open and prep.
const MAX_MEETINGS = 12;

function dayLabel(date: string, today: string): string {
  if (date === today) return 'Today';
  if (date === addDaysStr(1)) return 'Tomorrow';
  return fmtWeekDM(date); // e.g. "Tue 16/07"
}

export function TodayStrip({ onNavigate }: { onNavigate?: (screen: string, id?: string | null) => void }) {
  const { data } = useCadence();
  const { dates } = useMeetingDates();

  const days = useMemo(() => {
    const today = todayStr();

    // Every upcoming meeting occurrence — one per dated meeting note, so
    // multiple meetings on the same day (or with the same person) all appear.
    const occurrences = data.notes
      .filter((n) => !n.deleted_at && (n.folder || '').startsWith(MTG_FOLDER_PREFIX))
      .map((note) => {
        const date = dates[note.id];
        const personId = (note.folder || '').slice(MTG_FOLDER_PREFIX.length);
        const person = data.people.find((p) => p.id === personId && !p.deleted_at);
        return { note, date, person };
      })
      .filter((o): o is { note: typeof o.note; date: string; person: NonNullable<typeof o.person> } =>
        !!o.date && o.date >= today && !!o.person)
      .sort((a, b) => a.date.localeCompare(b.date) || a.person.name.localeCompare(b.person.name))
      .slice(0, MAX_MEETINGS);

    const cards = occurrences.map(({ note, date, person }) => {
      const isGroup = person.type === 'meeting_group';
      let chip: string;
      if (isGroup) {
        const topics = readPrepTopics(data.notes, person.id).filter((t) => t.status !== 'covered');
        const ready = topics.filter((t) => t.status === 'ready').length;
        chip = topics.length ? `${ready} ready / ${topics.length} topics` : 'No topics yet';
      } else {
        const agenda = parseMeeting(note.body || '').data.agenda.filter((a) => a.status !== 'covered').length;
        // Queued items merge into the person's soonest 1:1 — only badge that one.
        const isUpcoming = getUpcomingNoteId(person.id, data.notes, dates) === note.id;
        const queued = isUpcoming ? readAgendaQueue(data.notes, person.id).length : 0;
        chip = agenda + queued ? `${agenda} agenda${queued ? ` + ${queued} queued` : ''}` : 'No agenda yet';
      }
      return { note, person, isGroup, date, chip };
    });

    // Group into day buckets, preserving date order.
    const buckets: { date: string; label: string; isToday: boolean; cards: typeof cards }[] = [];
    for (const c of cards) {
      let g = buckets.find((b) => b.date === c.date);
      if (!g) { g = { date: c.date, label: dayLabel(c.date, today), isToday: c.date === today, cards: [] }; buckets.push(g); }
      g.cards.push(c);
    }
    return buckets;
  }, [data.notes, data.people, dates]);

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
                key={c.note.id}
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
