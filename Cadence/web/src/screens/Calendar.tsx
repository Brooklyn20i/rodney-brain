import { useMemo, useState } from 'react';
import { useCadence } from '../lib/store';
import { useMeetingDates, getNextMeeting } from '../lib/meetings';
import {
  todayStr, monthGrid, addMonths, fmtMonthYear, isSameMonth, fmtHeaderDate,
} from '../lib/util';
import {
  getHorizonMarkers, getCalendarEvents, groupEventsByDate,
} from '../lib/selectors';
import type { CalendarEvent, CalendarKind } from '../lib/selectors';
import type { WorkItem } from '../lib/types';
import { ScreenHeader } from '../components/bits';
import { ItemModal } from '../components/ItemModal';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// One ink per kind, drawn from the shared design tokens so the calendar reads
// in the same language as the rest of the app.
const KIND_COLOR: Record<CalendarKind, string> = {
  task: 'var(--accent)', milestone: 'var(--purple)', target: 'var(--orange)', meeting: 'var(--green)',
};
const KIND_ICON: Record<CalendarKind, string> = {
  task: '◎', milestone: '◇', target: '▤', meeting: '👤',
};

const dayNum = (iso: string) => Number(iso.slice(8, 10));

export function Calendar({ onMenu, onNavigate }: {
  onMenu?: () => void;
  onNavigate: (screen: string, entityId?: string) => void;
}) {
  const { data } = useCadence();
  const { dates } = useMeetingDates();
  // `anchor` is any day inside the visible month; nav shifts it a month at a time.
  const [anchor, setAnchor] = useState<Date>(() => new Date());
  const [selected, setSelected] = useState<string>(() => todayStr());
  const [editing, setEditing] = useState<WorkItem | null>(null);
  const [addFor, setAddFor] = useState<string | null>(null);

  const people = useMemo(
    () => data.people.filter((p) => !p.type || p.type === 'person'),
    [data.people],
  );

  const byDate = useMemo(() => {
    const today = todayStr();
    const meetings = people
      .map((p) => ({ p, date: getNextMeeting(p.id, data.notes, dates) }))
      .filter((x) => x.date && x.date >= today)
      .map((x) => ({ personId: x.p.id, name: x.p.name, date: x.date as string }));
    const markers = getHorizonMarkers(data.projects, data.milestones, meetings);
    return groupEventsByDate(getCalendarEvents(data.work_items, markers));
  }, [people, data.work_items, data.projects, data.milestones, data.notes, dates]);

  const weeks = useMemo(() => monthGrid(anchor), [anchor]);
  const today = todayStr();
  const selectedEvents = byDate.get(selected) ?? [];

  const openEvent = (e: CalendarEvent) => {
    if (e.workItemId) {
      const w = data.work_items.find((it) => it.id === e.workItemId);
      if (w) setEditing(w);
    } else if (e.nav && e.refId) {
      onNavigate(e.nav, e.refId);
    }
  };

  const goToday = () => { setAnchor(new Date()); setSelected(todayStr()); };

  return (
    <>
      <ScreenHeader title="Calendar" subtitle="Tasks, milestones and 1:1s by day" onMenu={onMenu}>
        <button className="btn btn-primary" onClick={() => setAddFor(selected)}>+ Add</button>
      </ScreenHeader>

      <div className="screen-content">
        <div className="cal-toolbar">
          <div className="cal-nav">
            <button className="cal-nav-btn" aria-label="Previous month"
              onClick={() => setAnchor((a) => addMonths(a, -1))}>‹</button>
            <span className="cal-month-title">{fmtMonthYear(anchor)}</span>
            <button className="cal-nav-btn" aria-label="Next month"
              onClick={() => setAnchor((a) => addMonths(a, 1))}>›</button>
          </div>
          <button className="btn btn-secondary cal-today-btn" onClick={goToday}>Today</button>
        </div>

        <div className="cal-grid" role="grid">
          {WEEKDAYS.map((w) => (
            <div key={w} className="cal-weekday" role="columnheader">{w}</div>
          ))}
          {weeks.map((week) =>
            week.map((iso) => {
              const events = byDate.get(iso) ?? [];
              const inMonth = isSameMonth(iso, anchor);
              const cls = [
                'cal-cell',
                inMonth ? '' : 'cal-cell-out',
                iso === today ? 'cal-cell-today' : '',
                iso === selected ? 'cal-cell-selected' : '',
              ].filter(Boolean).join(' ');
              const shown = events.slice(0, 3);
              return (
                <button key={iso} className={cls} role="gridcell" onClick={() => setSelected(iso)}>
                  <span className="cal-daynum">{dayNum(iso)}</span>
                  <span className="cal-chips">
                    {shown.map((e) => (
                      <span key={e.id} className={`cal-chip${e.done ? ' cal-chip-done' : ''}${e.overdue ? ' cal-chip-overdue' : ''}`}>
                        <span className="cal-chip-dot" style={{ background: e.overdue ? 'var(--red)' : KIND_COLOR[e.kind] }} />
                        <span className="cal-chip-text">{e.title}</span>
                      </span>
                    ))}
                    {events.length > 3 && (
                      <span className="cal-more">+{events.length - 3} more</span>
                    )}
                  </span>
                </button>
              );
            })
          )}
        </div>

        <div className="cal-agenda">
          <div className="cal-agenda-hdr">
            <span className="cal-agenda-date">
              {selected === today ? 'Today' : ''}
              {selected === today ? ' · ' : ''}{fmtHeaderDate(selected)}
            </span>
            <button className="btn btn-secondary cal-agenda-add" onClick={() => setAddFor(selected)}>
              + Add for this day
            </button>
          </div>
          {selectedEvents.length === 0 ? (
            <div className="cal-agenda-empty">Nothing scheduled. Tap “Add for this day” to drop a task here.</div>
          ) : (
            <div className="cal-agenda-body">
              {selectedEvents.map((e) => (
                <button key={e.id} className={`cal-agenda-row${e.done ? ' done' : ''}`} onClick={() => openEvent(e)}>
                  <span className="cal-agenda-icon" style={{ color: e.overdue ? 'var(--red)' : KIND_COLOR[e.kind] }}>
                    {KIND_ICON[e.kind]}
                  </span>
                  <span className="cal-agenda-main">
                    <span className="cal-agenda-title">{e.title}</span>
                    <span className="cal-agenda-sub">{e.subtitle}</span>
                  </span>
                  {e.overdue && <span className="cal-agenda-flag">Overdue</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {editing && <ItemModal existing={editing} onClose={() => setEditing(null)} />}
      {addFor && (
        <ItemModal
          defaults={{ due_date: addFor } as Partial<WorkItem>}
          onClose={() => setAddFor(null)}
        />
      )}
    </>
  );
}
