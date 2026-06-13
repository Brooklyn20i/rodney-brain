import React, { useMemo, useState } from 'react';
import { useCadence } from '../lib/store';
import type { WorkItem } from '../lib/types';
import { TypeTag, PriTag, EmptyState, ScreenHeader } from '../components/bits';
import { ItemModal } from '../components/ItemModal';

export function Inbox({ onMenu }: { onMenu?: () => void }) {
  const { data, update, remove, logActivity } = useCadence();
  const [editing, setEditing] = useState<WorkItem | null>(null);
  const items = useMemo(() => data.work_items.filter((w) => w.inboxed && !w.done), [data]);

  const file = (w: WorkItem) => { update('work_items', w.id, { inboxed: false } as Partial<WorkItem>); logActivity('file_item', w.title); };
  const processAll = () => items.forEach((w) => update('work_items', w.id, { inboxed: false } as Partial<WorkItem>));

  return (
    <>
      <ScreenHeader title="Inbox" onMenu={onMenu}>
        {items.length > 0 && <button className="btn btn-secondary btn-sm" onClick={processAll}>Process All</button>}
      </ScreenHeader>
      <div className="screen-content">
        {items.length ? items.map((w) => (
          <div className="inbox-item" key={w.id}>
            <div className="inbox-item-header">
              <span className="inbox-item-title">{w.title}</span>
              <span className="inbox-item-meta"><TypeTag type={w.type} /><PriTag priority={w.priority} /></span>
            </div>
            {w.notes && <p className="card-meta">{w.notes.slice(0, 120)}{w.notes.length > 120 ? '…' : ''}</p>}
            <div className="card-actions">
              <button className="btn btn-secondary btn-sm" onClick={() => setEditing(w)}>Edit &amp; File</button>
              <button className="btn btn-sm" style={{ background: 'var(--green-bg)', color: 'var(--green)' }} onClick={() => file(w)}>✓ File</button>
              <button className="btn btn-danger btn-sm" onClick={() => remove('work_items', w.id)}>Delete</button>
            </div>
          </div>
        )) : <EmptyState icon="✓" title="Inbox zero!" sub="Captured items appear here for processing" />}
      </div>
      {editing && <ItemModal existing={editing} onClose={() => { file(editing); setEditing(null); }} />}
    </>
  );
}
