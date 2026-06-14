import React, { useMemo } from 'react';
import { useCadence } from '../lib/store';
import { Due, EmptyState, PriTag, TypeTag } from '../components/bits';
import type { WorkItem } from '../lib/types';

export function Inbox() {
  const { data, update, remove } = useCadence();
  const items = useMemo(() => data.work_items
    .filter((w) => w.inboxed && !w.done)
    .sort((a, b) => a.created_at.localeCompare(b.created_at)), [data.work_items]);

  const triage = (w: WorkItem) => update('work_items', w.id, { inboxed: false } as Partial<WorkItem>);

  return (
    <>
      <div className="screen-header"><div><h1>Inbox</h1><div className="subtitle">Raw capture to triage</div></div></div>
      <div className="screen-content">
        {items.length === 0 ? <EmptyState icon="✓" title="Inbox clear" sub="Capture new work, then triage it into today/projects/people." /> : (
          <div className="row-list">
            {items.map((w) => (
              <div className="card" key={w.id}>
                <div className="card-row">
                  <div style={{ flex: 1 }}>
                    <div className="card-title">{w.title}</div>
                    <div className="inline-meta"><TypeTag type={w.type} /><PriTag priority={w.priority} /><Due date={w.due_date} /></div>
                    {w.notes && <div className="card-meta">{w.notes}</div>}
                  </div>
                  <button className="btn btn-primary btn-sm" onClick={() => triage(w)}>Triaged</button>
                  <button className="btn btn-secondary btn-sm" onClick={() => remove('work_items', w.id)}>Archive</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
