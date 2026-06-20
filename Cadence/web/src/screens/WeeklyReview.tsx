import { useMemo } from 'react';
import { useCadence } from '../lib/store';
import { isOverdue } from '../lib/util';

export function WeeklyReview() {
  const { data } = useCadence();
  const stats = useMemo(() => {
    const active = data.work_items.filter((w) => !w.done && !w.deleted_at);
    const completed = data.work_items.filter((w) => w.done && !w.deleted_at);
    return {
      active: active.length,
      inbox: active.filter((w) => w.inboxed).length,
      overdue: active.filter((w) => isOverdue(w.due_date)).length,
      waiting: active.filter((w) => w.type === 'waitingFor').length,
      decisions: data.decisions.filter((d) => d.status === 'pending' && !d.deleted_at).length,
      completed: completed.length,
      projects: data.projects.filter((p) => p.status === 'active' && !p.deleted_at).length,
    };
  }, [data]);

  return (
    <>
      <div className="screen-header"><div><h1>Weekly Review</h1><div className="subtitle">Reset the operating loop</div></div></div>
      <div className="screen-content">
        <div className="metric-grid">
          <Metric label="Active work" value={stats.active} />
          <Metric label="Inbox" value={stats.inbox} />
          <Metric label="Overdue" value={stats.overdue} tone={stats.overdue ? 'bad' : 'good'} />
          <Metric label="Waiting" value={stats.waiting} />
          <Metric label="Decisions" value={stats.decisions} />
          <Metric label="Active projects" value={stats.projects} />
        </div>
        <div className="card"><div className="card-title">Review checklist</div><ol className="checklist"><li>Clear Inbox to zero or explicitly defer.</li><li>Confirm top three priorities for Monday.</li><li>Close or defer stale decisions.</li><li>Review waiting items and choose follow-ups.</li><li>Confirm every active project has a next action.</li></ol></div>
      </div>
    </>
  );
}

function Metric({ label, value, tone = 'neutral' }: { label: string; value: number; tone?: 'neutral' | 'good' | 'bad' }) {
  return <div className={`metric-card ${tone}`}><strong>{value}</strong><span>{label}</span></div>;
}
