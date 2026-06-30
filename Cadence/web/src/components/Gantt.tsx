// Lightweight, dependency-free Gantt charts (percentage-positioned, responsive).
// ProjectGantt: phases as bars + milestones as markers for one project.
// PortfolioTimeline: every active project as a bar on a shared time axis.
import { useMemo } from 'react';
import type { Project, Milestone, ProjectPhase, WorkItem } from '../lib/types';
import { todayStr, fmtDate, isOverdue } from '../lib/util';

const MS_DAY = 86400000;
const t = (d: string) => new Date(d + 'T12:00:00').getTime();
const HEALTH: Record<string, string> = { green: 'var(--green)', amber: 'var(--orange)', red: 'var(--red)' };

interface Scale { pos: (d: string) => number; ticks: { left: number; label: string }[]; }

// Build a % scale over a date range, with month gridline ticks. Returns null
// when there aren't at least two distinct dates to span.
function buildScale(dates: string[]): Scale | null {
  const ts = dates.filter(Boolean).map(t);
  if (new Set(ts).size < 2) return null;
  let min = Math.min(...ts), max = Math.max(...ts);
  const pad = (max - min) * 0.06 || 7 * MS_DAY;
  min -= pad; max += pad;
  const span = max - min;
  const pos = (d: string) => Math.max(0, Math.min(100, ((t(d) - min) / span) * 100));
  const ticks: { left: number; label: string }[] = [];
  const cur = new Date(min); cur.setDate(1); cur.setHours(12, 0, 0, 0);
  while (cur.getTime() <= max) {
    ticks.push({
      left: ((cur.getTime() - min) / span) * 100,
      label: cur.toLocaleDateString('en-AU', { month: 'short' }),
    });
    cur.setMonth(cur.getMonth() + 1);
  }
  return { pos, ticks };
}

function Axis({ ticks }: { ticks: Scale['ticks'] }) {
  return (
    <div className="gantt-axis">
      {ticks.map((tk, i) => (
        <span key={i} className="gantt-tick" style={{ left: `${tk.left}%` }}>{tk.label}</span>
      ))}
    </div>
  );
}

// ── Per-project Gantt ────────────────────────────────────────────────────────
// Plots the whole project on one timeline: phase bars, milestone markers, and
// every open work item as an activity bar (its runway from today to its due
// date — or, if overdue, the stretch from due to today).
export function ProjectGantt({ phases, milestones, items, targetDate }: {
  phases: ProjectPhase[]; milestones: Milestone[]; items: WorkItem[]; targetDate: string | null;
}) {
  const today = todayStr();
  const activities = useMemo(() => items.filter((w) => !w.done && w.due_date), [items]);

  const scale = useMemo(() => {
    const dates = [
      ...phases.flatMap((p) => [p.start_date, p.end_date]),
      ...milestones.map((m) => m.due_date),
      ...activities.map((w) => w.due_date),
      targetDate, today,
    ].filter(Boolean) as string[];
    return buildScale(dates);
  }, [phases, milestones, activities, targetDate, today]);

  if (!scale) {
    return (
      <div className="gantt-empty">
        Add due dates to this project's tasks (or milestones / phase dates) to see the timeline.
      </div>
    );
  }
  const { pos, ticks } = scale;
  const datedMs = milestones.filter((m) => m.due_date);
  const noDate = items.filter((w) => !w.done && !w.due_date).length;
  const activityTone = (w: WorkItem) =>
    isOverdue(w.due_date) ? 'overdue' : w.priority === 'high' ? 'high' : 'upcoming';

  return (
    <div className="gantt">
      <Axis ticks={ticks} />
      <div className="gantt-grid">
        <div className="gantt-lines">
          <div className="gantt-today" style={{ left: `${pos(today)}%` }} title="Today" />
          {targetDate && <div className="gantt-target" style={{ left: `${pos(targetDate)}%` }} title={`Target · ${fmtDate(targetDate)}`} />}
        </div>

        {phases.map((ph) => (
          <div className="gantt-row" key={ph.id}>
            <span className="gantt-row-label" title={ph.name}>{ph.name}</span>
            <div className="gantt-track">
              {ph.start_date && ph.end_date ? (
                <div className="gantt-bar" style={{
                  left: `${pos(ph.start_date)}%`,
                  width: `${Math.max(1.5, pos(ph.end_date) - pos(ph.start_date))}%`,
                }} title={`${ph.name}: ${fmtDate(ph.start_date)} → ${fmtDate(ph.end_date)}`} />
              ) : (ph.start_date || ph.end_date) ? (
                <span className="gantt-ms upcoming" style={{ left: `${pos((ph.start_date || ph.end_date)!)}%` }} title={ph.name} />
              ) : null}
            </div>
          </div>
        ))}

        {datedMs.length > 0 && (
          <div className="gantt-row">
            <span className="gantt-row-label">Milestones</span>
            <div className="gantt-track">
              {datedMs.map((m) => (
                <span key={m.id}
                  className={`gantt-ms ${m.done ? 'done' : isOverdue(m.due_date) ? 'overdue' : 'upcoming'}`}
                  style={{ left: `${pos(m.due_date!)}%` }}
                  title={`${m.title} · ${fmtDate(m.due_date!)}${m.done ? ' ✓' : ''}`} />
              ))}
            </div>
          </div>
        )}

        {activities.map((w) => {
          const due = w.due_date!;
          const a = pos(due < today ? due : today);
          const b = pos(due < today ? today : due);
          const tone = activityTone(w);
          return (
            <div className="gantt-row" key={w.id}>
              <span className="gantt-row-label" title={w.title}>{w.title}</span>
              <div className="gantt-track">
                <div className={`gantt-abar ${tone}`}
                  style={{ left: `${a}%`, width: `${Math.max(1.5, b - a)}%` }}
                  title={`${w.title} · due ${fmtDate(due)}`} />
                <span className={`gantt-ms ${tone}`} style={{ left: `${pos(due)}%` }} />
              </div>
            </div>
          );
        })}
      </div>

      <div className="gantt-legend">
        <span><i className="gantt-key today" /> Today</span>
        <span><i className="gantt-key target" /> Target</span>
        <span><i className="gantt-key ms-upcoming" /> Milestone / task</span>
        <span><i className="gantt-key ms-overdue" /> Overdue</span>
        <span><i className="gantt-key ms-done" /> Done</span>
        {noDate > 0 && <span className="gantt-nodate">{noDate} task{noDate > 1 ? 's' : ''} with no date</span>}
      </div>
    </div>
  );
}

// ── Portfolio timeline (all active projects on one axis) ─────────────────────
export function PortfolioTimeline({ projects, milestones, onSelect }: {
  projects: Project[]; milestones: Milestone[]; onSelect: (id: string) => void;
}) {
  const today = todayStr();
  const active = useMemo(
    () => projects.filter((p) => p.status === 'active' && !p.deleted_at),
    [projects],
  );

  // Each project's span = from its earliest known date to its target/last date.
  const rows = useMemo(() => active.map((p) => {
    const ms = milestones.filter((m) => m.project_id === p.id && m.due_date);
    const dates = [...ms.map((m) => m.due_date!), p.target_date].filter(Boolean) as string[];
    const start = dates.length ? dates.reduce((a, b) => (a < b ? a : b)) : today;
    const end = dates.length ? dates.reduce((a, b) => (a > b ? a : b)) : today;
    return { p, ms, start: start < today ? start : today, end: end > today ? end : today };
  }), [active, milestones, today]);

  const scale = useMemo(() => {
    const dates = rows.flatMap((r) => [r.start, r.end, ...r.ms.map((m) => m.due_date!)]).concat(today);
    return buildScale(dates);
  }, [rows, today]);

  if (active.length === 0) return <div className="gantt-empty">No active projects to plot.</div>;
  if (!scale) return <div className="gantt-empty">Set target dates or milestone dates on your projects to see the portfolio timeline.</div>;
  const { pos, ticks } = scale;

  return (
    <div className="gantt gantt-portfolio">
      <Axis ticks={ticks} />
      <div className="gantt-grid">
        <div className="gantt-lines">
          <div className="gantt-today" style={{ left: `${pos(today)}%` }} title="Today" />
        </div>
        {rows.map(({ p, ms, start, end }) => (
          <button className="gantt-row gantt-row-btn" key={p.id} onClick={() => onSelect(p.id)}>
            <span className="gantt-row-label" title={p.name}>
              <span className="gantt-health-dot" style={{ background: HEALTH[p.health] || 'var(--text3)' }} />
              {p.name}
            </span>
            <div className="gantt-track">
              <div className="gantt-bar" style={{
                left: `${pos(start)}%`,
                width: `${Math.max(1.5, pos(end) - pos(start))}%`,
                background: HEALTH[p.health] || 'var(--accent)',
              }} />
              {ms.map((m) => (
                <span key={m.id}
                  className={`gantt-ms ${m.done ? 'done' : isOverdue(m.due_date) ? 'overdue' : 'upcoming'}`}
                  style={{ left: `${pos(m.due_date!)}%` }}
                  title={`${m.title} · ${fmtDate(m.due_date!)}`} />
              ))}
              {p.target_date && <span className="gantt-target-flag" style={{ left: `${pos(p.target_date)}%` }} title={`Target · ${fmtDate(p.target_date)}`} />}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
