import { useMemo } from 'react';
import { useCadence } from '../lib/store';
import { useMeetingDates, getNextMeeting, getUpcomingNoteId } from '../lib/meetings';
import { readAgendaQueue } from '../lib/agendaQueue';
import { readPrepTopics } from '../lib/prepTopics';
import { parseMeeting } from '../lib/meetingData';
import { initials, todayStr } from '../lib/util';

// The first question Home answers: "do I have 1:1s or big meetings today?"
// One card per person/series meeting today, with a prep-readiness chip —
// tap to deep-open them and prep.
export function TodayStrip({ onNavigate }: { onNavigate?: (screen: string, id?: string | null) => void }) {
  const { data } = useCadence();
  const { dates } = useMeetingDates();

  const cards = useMemo(() => {
    const today = todayStr();
    return data.people
      .filter((p) => !p.deleted_at && getNextMeeting(p.id, data.notes, dates) === today)
      .map((p) => {
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
        return { person: p, isGroup, chip };
      })
      .sort((a, b) => Number(a.isGroup) - Number(b.isGroup) || a.person.name.localeCompare(b.person.name));
  }, [data.people, data.notes, dates]);

  if (cards.length === 0) return null;

  return (
    <div className="today-strip" aria-label="Meetings today">
      <div className="today-strip-label">Meetings today</div>
      <div className="today-strip-cards">
        {cards.map(({ person: p, isGroup, chip }) => (
          <button
            key={p.id}
            className="today-strip-card"
            onClick={() => onNavigate?.(isGroup ? 'meetings' : 'people', p.id)}
          >
            <span className="avatar avatar-sm" style={{ background: p.color || '#3A7CA5' }}>
              {isGroup ? '▣' : initials(p.name)}
            </span>
            <span className="today-strip-name">{p.name}</span>
            <span className="today-strip-chip">{chip}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
