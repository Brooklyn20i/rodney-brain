import React, { useState } from 'react';
import { useCadence } from '../lib/store';
import type { ItemType, Priority, WorkItem } from '../lib/types';
import { Modal } from './bits';

const TYPES: { v: ItemType; label: string }[] = [
  { v: 'task', label: 'Task' }, { v: 'decision', label: 'Decision' },
  { v: 'followUp', label: 'Follow Up' }, { v: 'waitingFor', label: 'Waiting For' },
  { v: 'risk', label: 'Risk' }, { v: 'action', label: 'Meeting Action' },
];
const PRIORITIES: Priority[] = ['high', 'medium', 'low'];

export function ItemModal({ existing, defaults, onClose }: {
  existing?: WorkItem; defaults?: Partial<WorkItem>; onClose: () => void;
}) {
  const { data, insert, update, logActivity } = useCadence();
  const base = existing || defaults || {};
  const [title, setTitle] = useState(base.title || '');
  const [type, setType] = useState<ItemType>((base.type as ItemType) || 'task');
  const [priority, setPriority] = useState<Priority>((base.priority as Priority) || 'medium');
  const [due, setDue] = useState(base.due_date || '');
  const [projectId, setProjectId] = useState(base.project_id || '');
  const [personId, setPersonId] = useState(base.person_id || '');
  const [notes, setNotes] = useState(base.notes || '');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!title.trim()) return;
    setBusy(true);
    try {
      const patch = {
        title: title.trim(), type, priority, due_date: due || null,
        project_id: projectId || null, person_id: personId || null, notes,
      } as Partial<WorkItem>;
      if (existing) {
        await update('work_items', existing.id, patch);
        logActivity('edit_item', title.trim());
      } else {
        await insert('work_items', { ...patch, inboxed: (base as any).inboxed ?? true, source: 'you' } as Partial<WorkItem>);
        logActivity('add_item', title.trim());
      }
      onClose();
    } finally { setBusy(false); }
  };

  return (
    <Modal title={existing ? 'Edit Item' : 'New Item'} onClose={onClose}
      footer={<>
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
      </>}>
      <div className="form-group">
        <label>Title</label>
        <input type="text" autoFocus value={title} placeholder="What needs to happen?"
          onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') save(); }} />
      </div>
      <div className="form-row">
        <div className="form-group"><label>Type</label>
          <select value={type} onChange={(e) => setType(e.target.value as ItemType)}>
            {TYPES.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
          </select>
        </div>
        <div className="form-group"><label>Priority</label>
          <select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
            {PRIORITIES.map((p) => <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>)}
          </select>
        </div>
      </div>
      <div className="form-row">
        <div className="form-group"><label>Due Date</label>
          <input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </div>
        <div className="form-group"><label>Project</label>
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">No project</option>
            {data.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      </div>
      <div className="form-group"><label>Person (waiting on / follow up with)</label>
        <select value={personId} onChange={(e) => setPersonId(e.target.value)}>
          <option value="">No person</option>
          {data.people.filter((p) => !p.type || p.type === 'person').map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      <div className="form-group"><label>Notes</label>
        <textarea value={notes} placeholder="Context, links, details…" onChange={(e) => setNotes(e.target.value)} />
      </div>
    </Modal>
  );
}
