import { useMemo } from 'react';
import { useCadence } from '../lib/store';
import { useMeetingDates, getNextMeeting, getUpcomingNoteId } from '../lib/meetings';
import { readAgendaQueue } from '../lib/agendaQueue';
import { readPrepTopics } from '../lib/prepTopics';
import { parseMeeting } from '../lib/meetingData';
import { initials, todayStr, addDaysStr, fmtWeekDM } from '../lib/util';

// The first thing Home answers: "what are my next meetings?" One card per
// person / series with an upcoming date — soonest first, today highlighted —
// each showing when it is and how ready the prep is. Tap to deep-open and prep.
const MAX_CARDS = 8;

function dateLabel(date: string, today: string): string {
  if (date === today) return 'Today';
  if (date === addDaysStr(1)) return 'Tomorrow';
  return fmtWeekDM(date); // e.g. "Tue 16/07"
}

export function TodayStrip({ onNavigate }: { onNavigate?: (screen: string, id?: string | null) => void }) {
  const { data } = useCadence();
  const { dates } = useMeetingDates();

  const cards = useMemo(() => {
    const today = todayStr();
    return data.people
      .filter((p) => !p.deleted_at)
      .map((p) => ({ p, date: getNextMeeting(p.id, data.notes, dates) }))
      .filter((x): x is { p: typeof x.p; date: string } => !!x.date)
      .sort((a, b) => a.date.localeCompare(b.date) || a.p.name.localeCompare(b.p.name))
      .slice(0, MAX_CARDS)
      .map(({ p, date }) => {
        const isGroup = p.type === 'meeting_group';
        let chip: string;
        if (isGroup) {
          const topics = readPrepTopics(data.notes, p.id).filter((t) => t.status !== 'covered');
          const ready = topics.filter((t) => t.status === 'ready').length;
          chip = topics.length ? `${ready} ready / ${topics.length} topics` : 'No topics yet';
        } else {
          const noteId = getUpcomingNoteId(p.id, data.notes, dates);
          const note = noteId ? data.notes.find((n) => n.id === noteId) : undefined;
          const agenda = note ? parseMeeting(note.body || '').data.agenda.filter((a) => a.status !== 'covered').length : 0;
          const queued = readAgendaQueue(data.notes, p.id).length;
          chip = agenda + queued ? `${agenda} agenda + ${queued} queued` : 'No agenda yet';
        }
        return { person: p, isGroup, chip, date, label: dateLabel(date, today), isToday: date === today };
      });
  }, [data.people, data.notes, dates]);

  // Only worth a section once there are people/series to schedule against.
  const hasPeople = data.people.some((p) => !p.deleted_at);
  if (!hasPeople && cards.length === 0) return null;

  return (
    <div className="today-strip" aria-label="Next meetings">
      <div className="today-strip-label">Next meetings</div>
      {cards.length === 0 ? (
        <div className="today-strip-empty">
          No upcoming meetings. Set a date on a 1:1 in People or Meetings and it shows here.
        </div>
      ) : (
        <div className="today-strip-cards">
          {cards.map(({ person: p, isGroup, chip, label, isToday }) => (
            <button
              key={p.id}
              className={`today-strip-card${isToday ? ' today-strip-card-now' : ''}`}
              onClick={() => onNavigate?.(isGroup ? 'meetings' : 'people', p.id)}
            >
              <span className="avatar avatar-sm" style={{ background: p.color || '#3A7CA5' }}>
                {isGroup ? '▣' : initials(p.name)}
              </span>
              <span className="today-strip-main">
                <span className="today-strip-name">{p.name}</span>
                <span className={`today-strip-date${isToday ? ' now' : ''}`}>{label}</span>
              </span>
              <span className="today-strip-chip">{chip}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
