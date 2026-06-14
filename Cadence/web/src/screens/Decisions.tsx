import React, { useMemo } from 'react';
import { useCadence } from '../lib/store';
import { Due, EmptyState } from '../components/bits';
import type { Decision } from '../lib/types';

export function Decisions() {
  const { data, update } = useCadence();
  const pending = useMemo(() => data.decisions.filter((d) => d.status === 'pending' && !d.deleted_at), [data.decisions]);
  const closed = useMemo(() => data.decisions.filter((d) => d.status !== 'pending' && !d.deleted_at).slice(-10).reverse(), [data.decisions]);

  return (
    <>
      <div className="screen-header"><div><h1>Decisions</h1><div className="subtitle">Open decisions that need an owner or outcome</div></div></div>
      <div className="screen-content two-col">
        <section>
          <h3 className="mini-heading">Pending</h3>
          {pending.length ? pending.map((d) => <DecisionCard key={d.id} d={d} onDecide={() => update('decisions', d.id, { status: 'decided' } as Partial<Decision>)} onDefer={() => update('decisions', d.id, { status: 'deferred' } as Partial<Decision>)} />) : <EmptyState icon="✓" title="No decisions pending" />}
        </section>
        <section>
          <h3 className="mini-heading">Recently closed</h3>
          {closed.length ? closed.map((d) => <div className="card" key={d.id}><div className="card-title">{d.title}</div><div className="inline-meta"><span className="tag tag-decision">{d.status}</span><Due date={d.due_date} /></div>{d.outcome && <p className="card-meta">{d.outcome}</p>}</div>) : <div className="card-meta">No closed decisions yet.</div>}
        </section>
      </div>
    </>
  );
}

function DecisionCard({ d, onDecide, onDefer }: { d: Decision; onDecide: () => void; onDefer: () => void }) {
  return <div className="card"><div className="card-title">{d.title}</div><div className="inline-meta"><span className="tag tag-decision">Decision</span><Due date={d.due_date} /></div>{d.context && <p className="card-meta">{d.context}</p>}<div className="button-row"><button className="btn btn-primary btn-sm" onClick={onDecide}>Mark decided</button><button className="btn btn-secondary btn-sm" onClick={onDefer}>Defer</button></div></div>;
}
