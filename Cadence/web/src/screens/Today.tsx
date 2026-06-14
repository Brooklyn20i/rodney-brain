import React, { useMemo, useState } from 'react';
import { useCadence } from '../lib/store';
import { priorityScore, isOverdue, isDueToday } from '../lib/util';
import type { WorkItem } from '../lib/types';
import { TypeTag, PriTag, Due, ScreenHeader } from '../components/bits';
import { ItemModal } from '../components/ItemModal';

function Section({ title, count, color, children }: { title: string; count: number; color: string; children: React.ReactNode }) {
  return (
    <>
      <div className="section-header">
        <h2>{title}</h2>
        <span className="section-count" style={{ background: color }}>{count}</span>
      </div>
      {children}
    </>
  );
}

function RowCard({ w, onEdit }: { w: WorkItem; onEdit: (w: WorkItem) => void }) {
  const { data, update } = useCadence();
  const proj = data.projects.find((p) => p.id === w.project_id);
  const toggle = () => update('work_items', w.id, { done: !w.done, completed_at: !w.done ? new Date().toISOString() : null } as Partial<WorkItem>);
  return (
    <div className="card card-compact">
      <div className="card-row">
        <input type="checkbox" checked={w.done} onChange={toggle} style={{ width: 16, height: 16, accentColor: 'var(--accent)' }} />
        <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => onEdit(w)}>
          <div className={`card-title ${w.done ? 'checkbox-done' : ''}`}>{w.title}</div>
          <div style={{ display: 'flex', gap: 6, marginTop: 4, alignItems: 'center', flexWrap: 'wrap' }}>
            <TypeTag type={w.type} /><PriTag priority={w.priority} />
            {proj && <span className="tag tag-info">{proj.name}</span>}
            <Due date={w.due_date} />
          </div>
        </div>
      </div>
    </div>
  );
}

export function Today({ onMenu }: { onMenu?: () => void }) {
  const { data } = useCadence();
  const [editing, setEditing] = useState<WorkItem | null>(null);
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
      decisions: [
        ...data.decisions.filter((d) => d.status === 'pending'),
        ...data.work_items.filter((w) => w.type === 'decision' && !w.done),
      ] as { id: string; title: string }[],
    };
  }, [data]);

  const dateLabel = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <>
      <ScreenHeader title="Today" subtitle={dateLabel} onMenu={onMenu}>
        <button className="btn btn-primary" onClick={() => setAdding(true)}>+ Quick Add</button>
      </ScreenHeader>
      <div className="screen-content">
        <div id="today-focus-block">
          <div className="focus-icon">🧠</div>
          <div className="focus-text">
            <small>Suggested Focus</small>
            <p>{view.focus ? view.focus.title : 'Add items to see your top priority here'}</p>
          </div>
        </div>

        <Section title="Top 3 Priorities" count={view.top3.length} color="var(--accent)">
          {view.top3.length ? (
            <div className="priority-cards">
              {view.top3.map((w) => {
                const proj = data.projects.find((p) => p.id === w.project_id);
                return (
                  <div className="priority-card" key={w.id} onClick={() => setEditing(w)}>
                    <div className="card-tags"><TypeTag type={w.type} /><PriTag priority={w.priority} /></div>
                    <div className="card-title">{w.title}</div>
                    <div className="card-due">{proj ? proj.name + ' · ' : ''}<Due date={w.due_date} /></div>
                  </div>
                );
              })}
            </div>
          ) : <div className="empty-state"><div className="icon">✓</div><p>All clear!</p></div>}
        </Section>

        <Section title="Overdue" count={view.overdue.length} color="var(--red)">
          {view.overdue.length ? view.overdue.map((w) => <RowCard key={w.id} w={w} onEdit={setEditing} />)
            : <small style={{ color: 'var(--text3)' }}>None — great!</small>}
        </Section>

        <Section title="Waiting on Others" count={view.waiting.length} color="var(--purple)">
          {view.waiting.length ? view.waiting.map((w) => <RowCard key={w.id} w={w} onEdit={setEditing} />)
            : <small style={{ color: 'var(--text3)' }}>Nothing waiting</small>}
        </Section>

        <Section title="Decisions Needed" count={view.decisions.length} color="var(--purple)">
          {view.decisions.length ? view.decisions.map((d) => (
            <div className="card card-compact" key={d.id}>
              <div className="card-row"><span className="tag tag-decision">Decision</span>
                <span className="card-title" style={{ flex: 1 }}>{d.title}</span></div>
            </div>
          )) : <small style={{ color: 'var(--text3)' }}>No pending decisions</small>}
        </Section>

        <Section title="Due Today" count={view.dueToday.length} color="var(--orange)">
          {view.dueToday.length ? view.dueToday.map((w) => <RowCard key={w.id} w={w} onEdit={setEditing} />)
            : <small style={{ color: 'var(--text3)' }}>Nothing else due today</small>}
        </Section>
      </div>

      {adding && <ItemModal onClose={() => setAdding(false)} />}
      {editing && <ItemModal existing={editing} onClose={() => setEditing(null)} />}
    </>
  );
}
