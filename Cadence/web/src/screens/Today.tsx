import React, { useMemo, useState } from 'react';
import { useCadence } from '../lib/store';
import { priorityScore, isOverdue, isDueToday } from '../lib/util';
import type { WorkItem } from '../lib/types';
import { TypeTag, PriTag, Due, EmptyState } from '../components/bits';
import { QuickAdd } from './QuickAdd';

function TaskCard({ w }: { w: WorkItem }) {
  const { data, update } = useCadence();
  const proj = data.projects.find((p) => p.id === w.project_id);
  const toggle = () => update('work_items', w.id, {
    done: !w.done, completed_at: !w.done ? new Date().toISOString() : null,
  } as Partial<WorkItem>);
  return (
    <div className="card card-compact">
      <div className="card-row">
        <input type="checkbox" checked={w.done} onChange={toggle} style={{ width: 16, height: 16, accentColor: 'var(--accent)' }} />
        <div style={{ flex: 1 }}>
          <div className="card-title" style={w.done ? { textDecoration: 'line-through', color: 'var(--text2)' } : {}}>{w.title}</div>
          <div style={{ display: 'flex', gap: 6, marginTop: 4, alignItems: 'center', flexWrap: 'wrap' }}>
            <TypeTag type={w.type} /><PriTag priority={w.priority} />
            {proj && <span className="tag tag-task">{proj.name}</span>}
            <Due date={w.due_date} />
          </div>
        </div>
      </div>
    </div>
  );
}

export function Today({ onMenu }: { onMenu?: () => void }) {
  const { data } = useCadence();
  const [adding, setAdding] = useState(false);

  const view = useMemo(() => {
    const active = data.work_items.filter((w) => !w.done);
    const scored = [...active].sort((a, b) => priorityScore(b) - priorityScore(a));
    return {
      focus: scored[0],
      top3: scored.slice(0, 3),
      overdue: active.filter((w) => isOverdue(w.due_date)),
      waiting: active.filter((w) => w.type === 'waitingFor'),
      dueToday: active.filter((w) => isDueToday(w.due_date) && w.type !== 'waitingFor'),
      decisions: data.decisions.filter((d) => d.status === 'pending'),
    };
  }, [data]);

  const dateLabel = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <>
      <div className="screen-header">
        <div className="header-left">
          <button className="menu-btn" onClick={onMenu} aria-label="Open menu">☰</button>
          <div>
            <h1>Today</h1>
            <div className="subtitle">{dateLabel}</div>
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => setAdding(true)}>+ Quick Add</button>
      </div>
      <div className="screen-content">
        <div className="focus-block">
          <div style={{ fontSize: 28 }}>🧠</div>
          <div>
            <small>Suggested Focus</small>
            <p>{view.focus ? view.focus.title : 'Add items to see your top priority here'}</p>
          </div>
        </div>

        <Section title="Top 3 Priorities" count={view.top3.length} color="var(--accent)">
          {view.top3.length ? view.top3.map((w) => <TaskCard key={w.id} w={w} />) : <EmptyState icon="✓" title="All clear!" />}
        </Section>

        <Section title="Overdue" count={view.overdue.length} color="var(--red)">
          {view.overdue.length ? view.overdue.map((w) => <TaskCard key={w.id} w={w} />)
            : <div className="card-meta">None — great.</div>}
        </Section>

        <Section title="Waiting on Others" count={view.waiting.length} color="var(--purple)">
          {view.waiting.length ? view.waiting.map((w) => <TaskCard key={w.id} w={w} />)
            : <div className="card-meta">Nothing waiting.</div>}
        </Section>

        <Section title="Decisions Needed" count={view.decisions.length} color="var(--purple)">
          {view.decisions.length ? view.decisions.map((d) => (
            <div className="card card-compact" key={d.id}>
              <div className="card-row"><span className="tag tag-decision">Decision</span>
                <span className="card-title" style={{ flex: 1 }}>{d.title}</span></div>
            </div>
          )) : <div className="card-meta">No pending decisions.</div>}
        </Section>

        <Section title="Due Today" count={view.dueToday.length} color="var(--orange)">
          {view.dueToday.length ? view.dueToday.map((w) => <TaskCard key={w.id} w={w} />)
            : <div className="card-meta">Nothing else due today.</div>}
        </Section>
      </div>

      {adding && <QuickAdd onClose={() => setAdding(false)} />}
    </>
  );
}

function Section({ title, count, color, children }: { title: string; count: number; color: string; children: React.ReactNode }) {
  return (
    <>
      <div className="section-header">
        <h2>{title}</h2>
        <span className="section-count" style={{ background: color }}>{count}</span>
      </div>
      <div className="row-list">{children}</div>
    </>
  );
}
