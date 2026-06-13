import React, { useMemo, useState } from 'react';
import { useCadence } from '../lib/store';
import type { WorkItem } from '../lib/types';
import { TypeTag, PriTag, Due, EmptyState, ScreenHeader } from '../components/bits';
import { QuickAdd } from './QuickAdd';

function InboxCard({ w }: { w: WorkItem }) {
  const { data, update, logActivity } = useCadence();
  const proj = data.projects.find((p) => p.id === w.project_id);

  const done = () => {
    update('work_items', w.id, { done: true, inboxed: false, completed_at: new Date().toISOString() } as Partial<WorkItem>);
    logActivity('complete_task', w.title);
  };
  const keep = () => {
    update('work_items', w.id, { inboxed: false } as Partial<WorkItem>);
    logActivity('triage_task', w.title);
  };

  return (
    <div className="card card-compact">
      <div className="card-row">
        <input type="checkbox" checked={false} onChange={done}
          style={{ width: 16, height: 16, accentColor: 'var(--accent)' }} />
        <div style={{ flex: 1 }}>
          <div className="card-title">{w.title}</div>
          <div style={{ display: 'flex', gap: 6, marginTop: 4, alignItems: 'center', flexWrap: 'wrap' }}>
            <TypeTag type={w.type} /><PriTag priority={w.priority} />
            {proj && <span className="tag tag-task">{proj.name}</span>}
            <Due date={w.due_date} />
          </div>
        </div>
        <button className="btn btn-sm btn-ghost" onClick={keep}>Keep</button>
      </div>
    </div>
  );
}

export function Inbox({ onMenu }: { onMenu?: () => void }) {
  const { data } = useCadence();
  const [adding, setAdding] = useState(false);
  const items = useMemo(() => data.work_items.filter((w) => w.inboxed && !w.done), [data]);

  return (
    <>
      <ScreenHeader title="Inbox" subtitle={`${items.length} to triage`} onMenu={onMenu}>
        <button className="btn btn-primary" onClick={() => setAdding(true)}>+ Quick Add</button>
      </ScreenHeader>
      <div className="screen-content">
        <div className="row-list">
          {items.length ? items.map((w) => <InboxCard key={w.id} w={w} />)
            : <EmptyState icon="📥" title="Inbox zero" sub="Nothing waiting to be triaged." />}
        </div>
      </div>
      {adding && <QuickAdd onClose={() => setAdding(false)} />}
    </>
  );
}
