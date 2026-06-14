import React, { useMemo, useState } from 'react';
import { useCadence } from '../lib/store';
import { Due, EmptyState, PriTag, TypeTag } from '../components/bits';
import { healthIcon } from '../lib/util';
import type { WorkItem } from '../lib/types';

export function Projects() {
  const { data, update } = useCadence();
  const activeProjects = useMemo(() => data.projects.filter((p) => !p.deleted_at), [data.projects]);
  const [selectedId, setSelectedId] = useState<string>('');
  const selected = activeProjects.find((p) => p.id === (selectedId || activeProjects[0]?.id));
  const items = selected ? data.work_items.filter((w) => w.project_id === selected.id && !w.done && !w.deleted_at) : [];
  const milestones = selected ? data.milestones.filter((m) => m.project_id === selected.id && !m.deleted_at) : [];
  const updates = selected ? data.project_updates.filter((u) => u.project_id === selected.id && !u.deleted_at).slice(-5).reverse() : [];

  return (
    <>
      <div className="screen-header"><div><h1>Projects</h1><div className="subtitle">Outcome, next action, open work</div></div></div>
      <div className="screen-content split-screen">
        <div className="split-list">
          {activeProjects.length === 0 ? <EmptyState icon="▤" title="No projects yet" /> : activeProjects.map((p) => {
            const open = data.work_items.filter((w) => w.project_id === p.id && !w.done && !w.deleted_at).length;
            return <button className={`list-row ${selected?.id === p.id ? 'active' : ''}`} key={p.id} onClick={() => setSelectedId(p.id)}>
              <span className="health-dot">{healthIcon(p.health)}</span>
              <span><strong>{p.name}</strong><small>{open} open · {p.status}</small></span>
            </button>;
          })}
        </div>
        <div className="split-detail">
          {!selected ? <EmptyState icon="▤" title="Select a project" sub="Or create one from Supabase/agent capture." /> : (
            <>
              <div className="detail-title"><h2>{selected.name}</h2><span>{healthIcon(selected.health)}</span></div>
              {selected.goal && <div className="card"><div className="label">Goal</div><p>{selected.goal}</p></div>}
              <div className="card"><div className="label">Next action</div><p>{selected.next_action || 'No next action captured.'}</p></div>
              <h3 className="mini-heading">Open work</h3>
              {items.length ? items.map((w) => <WorkRow key={w.id} w={w} onDone={() => update('work_items', w.id, { done: true, completed_at: new Date().toISOString() } as Partial<WorkItem>)} />) : <div className="card-meta">No open project work.</div>}
              <h3 className="mini-heading">Milestones</h3>
              {milestones.length ? milestones.map((m) => <div className="card card-compact" key={m.id}><div className="card-row"><span>{m.done ? '✓' : '○'}</span><span className="card-title" style={{ flex: 1 }}>{m.title}</span><Due date={m.due_date} /></div></div>) : <div className="card-meta">No milestones.</div>}
              <h3 className="mini-heading">Latest updates</h3>
              {updates.length ? updates.map((u) => <div className="card card-compact" key={u.id}><div className="card-meta">{u.author}</div><p>{u.text}</p></div>) : <div className="card-meta">No updates yet.</div>}
            </>
          )}
        </div>
      </div>
    </>
  );
}

function WorkRow({ w, onDone }: { w: WorkItem; onDone: () => void }) {
  return <div className="card card-compact"><div className="card-row"><div style={{ flex: 1 }}><div className="card-title">{w.title}</div><div className="inline-meta"><TypeTag type={w.type} /><PriTag priority={w.priority} /><Due date={w.due_date} /></div></div><button className="btn btn-secondary btn-sm" onClick={onDone}>Done</button></div></div>;
}
