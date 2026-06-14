import React, { useMemo, useState } from 'react';
import { useCadence } from '../lib/store';
import { Due, EmptyState, PriTag, TypeTag } from '../components/bits';
import type { TalkingPoint, WorkItem } from '../lib/types';

export function People() {
  const { data, update } = useCadence();
  const people = useMemo(() => data.people.filter((p) => !p.deleted_at).sort((a, b) => a.name.localeCompare(b.name)), [data.people]);
  const [selectedId, setSelectedId] = useState<string>('');
  const selected = people.find((p) => p.id === (selectedId || people[0]?.id));
  const personItems = selected ? data.work_items.filter((w) => w.person_id === selected.id && !w.done && !w.deleted_at) : [];
  const talking = selected ? data.talking_points.filter((t) => t.person_id === selected.id && !t.deleted_at) : [];

  return (
    <>
      <div className="screen-header"><div><h1>People</h1><div className="subtitle">Follow-ups and waiting items by stakeholder</div></div></div>
      <div className="screen-content split-screen">
        <div className="split-list">
          {people.length === 0 ? <EmptyState icon="✦" title="No people yet" /> : people.map((p) => {
            const waiting = data.work_items.filter((w) => w.person_id === p.id && w.type === 'waitingFor' && !w.done && !w.deleted_at).length;
            const followUps = data.work_items.filter((w) => w.person_id === p.id && w.type === 'followUp' && !w.done && !w.deleted_at).length;
            return <button className={`list-row ${selected?.id === p.id ? 'active' : ''}`} key={p.id} onClick={() => setSelectedId(p.id)}>
              <span><strong>{p.name}</strong><small>{p.role || 'No role'} · {waiting} waiting · {followUps} follow-ups</small></span>
            </button>;
          })}
        </div>
        <div className="split-detail">
          {!selected ? <EmptyState icon="✦" title="Select a person" sub="Track follow-ups and waiting items." /> : (
            <>
              <div className="detail-title"><h2>{selected.name}</h2></div>
              <div className="card"><div className="label">Role</div><p>{selected.role || 'No role captured.'}</p>{selected.email && <p className="card-meta">{selected.email}</p>}{selected.notes && <p className="card-meta">{selected.notes}</p>}</div>
              <h3 className="mini-heading">Open items</h3>
              {personItems.length ? personItems.map((w) => <WorkRow key={w.id} w={w} onDone={() => update('work_items', w.id, { done: true, completed_at: new Date().toISOString() } as Partial<WorkItem>)} />) : <div className="card-meta">No open items for this person.</div>}
              <h3 className="mini-heading">Talking points</h3>
              {talking.length ? talking.map((t) => <TalkingRow key={t.id} t={t} onToggle={() => update('talking_points', t.id, { done: !t.done } as Partial<TalkingPoint>)} />) : <div className="card-meta">No talking points.</div>}
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

function TalkingRow({ t, onToggle }: { t: TalkingPoint; onToggle: () => void }) {
  return <div className="card card-compact"><label className="card-row"><input type="checkbox" checked={t.done} onChange={onToggle} /><span className="card-title" style={t.done ? { textDecoration: 'line-through', color: 'var(--text2)' } : {}}>{t.text}</span></label></div>;
}
