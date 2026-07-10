import { useMemo } from 'react';
import { useCadence } from '../lib/store';
import { getDecideItems, getKobeHandling, getLoadSummary, getWaitingOnOthers } from '../lib/selectors';
import { isUserTask } from '../lib/tasks';

export function WeeklyReview() {
  const { data } = useCadence();
  const stats = useMemo(() => {
    const work = data.work_items.filter((w) => !w.deleted_at);
    const active = work.filter((w) => !w.done);
    const completed = data.work_items.filter((w) => w.done && !w.deleted_at);
    const load = getLoadSummary(work);
    return {
      doNow: load.active,
      quickCapture: active.filter((w) => isUserTask(w) && w.inboxed).length,
      overdue: load.overdue,
      waiting: getWaitingOnOthers(work).length,
      decisions: getDecideItems(work, data.decisions).length,
      withKobe: getKobeHandling(work).length,
      completed: completed.length,
      projects: data.projects.filter((p) => p.status === 'active' && !p.deleted_at).length,
    };
  }, [data]);

  return (
    <>
      <div className="screen-header"><div><h1>Weekly Review</h1><div className="subtitle">Reset the operating loop</div></div></div>
      <div className="screen-content">
        <div className="metric-grid">
          <Metric label="Needs Rodney / Do now" value={stats.doNow} />
          <Metric label="Inbox / untriaged" value={stats.quickCapture} />
          <Metric label="Overdue" value={stats.overdue} tone={stats.overdue ? 'bad' : 'good'} />
          <Metric label="Waiting / owed by others" value={stats.waiting} />
          <Metric label="Decide" value={stats.decisions} />
          <Metric label="With Kobe" value={stats.withKobe} />
          <Metric label="Active projects" value={stats.projects} />
        </div>
        <div className="card"><div className="card-title">Review checklist</div><ol className="checklist"><li>Clear the Inbox / untriaged to zero or explicitly defer.</li><li>Confirm top three Needs Rodney / Do now priorities for Monday.</li><li>Close or defer stale Decide items.</li><li>Review Waiting / owed by others and choose follow-ups.</li><li>Confirm With Kobe contains only source=for:kobe delegated items.</li><li>Confirm every active project has a next action.</li></ol></div>
      </div>
    </>
  );
}

function Metric({ label, value, tone = 'neutral' }: { label: string; value: number; tone?: 'neutral' | 'good' | 'bad' }) {
  return <div className={`metric-card ${tone}`}><strong>{value}</strong><span>{label}</span></div>;
}
