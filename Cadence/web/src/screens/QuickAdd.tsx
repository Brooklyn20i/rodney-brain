import React, { useState } from 'react';
import { useCadence } from '../lib/store';
import type { ItemType, Priority, WorkItem } from '../lib/types';

const TYPES: ItemType[] = ['task', 'decision', 'followUp', 'waitingFor', 'risk', 'action'];
const PRIORITIES: Priority[] = ['high', 'medium', 'low'];

export function QuickAdd({ onClose, defaults }: { onClose: () => void; defaults?: Partial<WorkItem> }) {
  const { data, insert, logActivity } = useCadence();
  const [title, setTitle] = useState(defaults?.title || '');
  const [type, setType] = useState<ItemType>((defaults?.type as ItemType) || 'task');
  const [priority, setPriority] = useState<Priority>((defaults?.priority as Priority) || 'medium');
  const [due, setDue] = useState(defaults?.due_date || '');
  const [projectId, setProjectId] = useState(defaults?.project_id || '');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!title.trim()) return;
    setBusy(true);
    try {
      await insert('work_items', {
        title: title.trim(), type, priority,
        due_date: due || null, project_id: projectId || null,
        notes: '', inboxed: true, source: 'you',
      } as Partial<WorkItem>);
      logActivity('add_task', title.trim());
      onClose();
    } finally { setBusy(false); }
  };

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <div className="modal-header"><h2>Quick Add</h2><button className="modal-close" onClick={onClose}>✕</button></div>
        <div className="form-group">
          <label className="field">What needs to happen?</label>
          <input type="text" value={title} autoFocus onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') save(); }} />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="field">Type</label>
            <select value={type} onChange={(e) => setType(e.target.value as ItemType)}>
              {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="field">Priority</label>
            <select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
              {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="field">Due date</label>
            <input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="field">Project</label>
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">No project</option>
              {data.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? 'Adding…' : 'Add to Inbox'}</button>
        </div>
      </div>
    </div>
  );
}
