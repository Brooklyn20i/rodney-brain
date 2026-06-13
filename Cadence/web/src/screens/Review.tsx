import React, { useMemo } from 'react';
import { useCadence } from '../lib/store';
import { ScreenHeader } from '../components/bits';
import { isOverdue, healthIcon, fmtDate } from '../lib/util';

function Stat({ label, value, color }: { label: string; value: number | string; color?: string }) {
  return (
    <div className="stat-card">
      <div className="stat-value" style={color ? { color } : undefined}>{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

export function Review({ onMenu }: { onMenu?: () => void }) {
  const { data } = useCadence();

  const r = useMemo(() => {
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const completed = data.work_items.filter((w) => w.done && w.completed_at && w.completed_at >= weekAgo);
    const open = data.work_items.filter((w) => !w.done);
    return {
      completed,
      overdue: open.filter((w) => isOverdue(w.due_date)),
      openCount: open.length,
      pendingDecisions: data.decisions.filter((d) => d.status === 'pending'),
      activeProjects: data.projects.filter((p) => p.status === 'active'),
      atRisk: data.projects.filter((p) => p.status === 'active' && p.health !== 'green'),
      waiting: open.filter((w) => w.type === 'waitingFor'),
    };
  }, [data]);

  const dateLabel = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <>
      <ScreenHeader title="Weekly Review" subtitle={dateLabel} onMenu={onMenu} />
      <div className="screen-content">
        <div className="stat-grid">
          <Stat label="Done this week" value={r.completed.length} color="var(--green)" />
          <Stat label="Still open" value={r.openCount} />
          <Stat label="Overdue" value={r.overdue.length} color={r.overdue.length ? 'var(--red)' : undefined} />
          <Stat label="Waiting on others" value={r.waiting.length} color="var(--purple)" />
        </div>

        <div className="section-header"><h2>Projects at risk</h2><span className="section-count" style={{ background: 'var(--orange)' }}>{r.atRisk.length}</span></div>
        <div className="row-list">
          {r.atRisk.length ? r.atRisk.map((p) => (
            <div className="card card-compact" key={p.id}><div className="card-row">
              <span>{healthIcon(p.health)}</span><span className="card-title" style={{ flex: 1 }}>{p.name}</span>
              {p.target_date && <span className="card-meta">{fmtDate(p.target_date)}</span>}
            </div></div>
          )) : <div className="card-meta">All active projects are green. 🎉</div>}
        </div>

        <div className="section-header"><h2>Decisions to make</h2><span className="section-count" style={{ background: 'var(--purple)' }}>{r.pendingDecisions.length}</span></div>
        <div className="row-list">
          {r.pendingDecisions.length ? r.pendingDecisions.map((d) => (
            <div className="card card-compact" key={d.id}><div className="card-row">
              <span className="card-title" style={{ flex: 1 }}>{d.title}</span>
              {d.due_date && <span className="card-meta">{fmtDate(d.due_date)}</span>}
            </div></div>
          )) : <div className="card-meta">No open decisions.</div>}
        </div>

        <div className="section-header"><h2>Overdue</h2><span className="section-count" style={{ background: 'var(--red)' }}>{r.overdue.length}</span></div>
        <div className="row-list">
          {r.overdue.length ? r.overdue.map((w) => (
            <div className="card card-compact" key={w.id}><div className="card-row">
              <span className="card-title" style={{ flex: 1 }}>{w.title}</span>
              <span className="due-overdue" style={{ fontSize: 12 }}>{fmtDate(w.due_date)}</span>
            </div></div>
          )) : <div className="card-meta">Nothing overdue. Clean slate.</div>}
        </div>

        <div className="section-header"><h2>Wins this week</h2><span className="section-count" style={{ background: 'var(--green)' }}>{r.completed.length}</span></div>
        <div className="row-list">
          {r.completed.length ? r.completed.map((w) => (
            <div className="card card-compact" key={w.id}><div className="card-row">
              <span style={{ color: 'var(--green)' }}>✓</span>
              <span className="card-title" style={{ flex: 1, color: 'var(--text2)' }}>{w.title}</span>
            </div></div>
          )) : <div className="card-meta">No completed items logged this week yet.</div>}
        </div>
      </div>
    </>
  );
}
