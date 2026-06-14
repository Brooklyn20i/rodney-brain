import React, { useState } from 'react';
import { useCadence } from '../lib/store';
import type { Decision, DecisionStatus, WorkItem } from '../lib/types';
import { EmptyState, ScreenHeader, Modal, Due } from '../components/bits';
import { ItemModal } from '../components/ItemModal';

const STATUS_TAG: Record<DecisionStatus, string> = { pending: 'tag-decision', deferred: 'tag-followUp', decided: 'tag-action' };

function DecisionModal({ existing, onClose }: { existing?: Decision; onClose: () => void }) {
  const { insert, update, logActivity } = useCadence();
  const [title, setTitle] = useState(existing?.title || '');
  const [status, setStatus] = useState<DecisionStatus>(existing?.status || 'pending');
  const [due, setDue] = useState(existing?.due_date || '');
  const [context, setContext] = useState(existing?.context || '');
  const [outcome, setOutcome] = useState(existing?.outcome || '');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!title.trim()) return;
    setBusy(true);
    try {
      const patch = { title: title.trim(), status, due_date: due || null, context, outcome } as Partial<Decision>;
      if (existing) await update('decisions', existing.id, patch);
      else await insert('decisions', patch);
      logActivity(existing ? 'edit_decision' : 'add_decision', title.trim());
      onClose();
    } finally { setBusy(false); }
  };
  return (
    <Modal title={existing ? 'Edit Decision' : 'New Decision'} onClose={onClose}
      footer={<><button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button></>}>
      <div className="form-group"><label>Decision Title</label>
        <input type="text" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} /></div>
      <div className="form-row">
        <div className="form-group"><label>Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value as DecisionStatus)}>
            <option value="pending">Pending</option><option value="decided">Decided</option><option value="deferred">Deferred</option>
          </select></div>
        <div className="form-group"><label>Due Date</label>
          <input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></div>
      </div>
      <div className="form-group"><label>Context</label>
        <textarea value={context} placeholder="What are the options? What's at stake?" onChange={(e) => setContext(e.target.value)} /></div>
      <div className="form-group"><label>Outcome (once decided)</label>
        <textarea value={outcome} placeholder="What was decided and why?" onChange={(e) => setOutcome(e.target.value)} /></div>
    </Modal>
  );
}

const GROUPS: { status: DecisionStatus; label: string; color: string }[] = [
  { status: 'pending', label: 'Pending', color: 'var(--purple)' },
  { status: 'deferred', label: 'Deferred', color: 'var(--orange)' },
  { status: 'decided', label: 'Decided', color: 'var(--green)' },
];

export function Decisions({ onMenu }: { onMenu?: () => void }) {
  const { data } = useCadence();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Decision | null>(null);
  const [editingWorkItem, setEditingWorkItem] = useState<WorkItem | null>(null);

  // work_items typed as 'decision' always land in the Pending group
  const workItemDecisions = data.work_items.filter((w) => w.type === 'decision' && !w.done);
  const totalCount = data.decisions.length + workItemDecisions.length;

  return (
    <>
      <ScreenHeader title="Decisions" onMenu={onMenu}>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>+ New Decision</button>
      </ScreenHeader>
      <div className="screen-content">
        {totalCount === 0 && <EmptyState icon="⚖" title="No decisions yet" sub="Track decisions that need to be made" />}
        {GROUPS.map(({ status, label, color }) => {
          const items = data.decisions.filter((d) => d.status === status).sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''));
          const extras = status === 'pending' ? workItemDecisions : [];
          const groupCount = items.length + extras.length;
          if (!groupCount) return null;
          return (
            <React.Fragment key={status}>
              <div className="section-header"><h2>{label}</h2><span className="section-count" style={{ background: color }}>{groupCount}</span></div>
              {items.map((d) => (
                <button className="decision-item" key={d.id} onClick={() => setEditing(d)}>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
                    <span className={`tag ${STATUS_TAG[status]}`}>{label}</span>
                    {d.due_date && status === 'pending' && <Due date={d.due_date} />}
                  </div>
                  <div className="card-title">{d.title}</div>
                  {d.context && <p className="card-meta">{d.context.slice(0, 100)}{d.context.length > 100 ? '…' : ''}</p>}
                  {d.outcome && status === 'decided' && <p className="card-meta">→ {d.outcome}</p>}
                </button>
              ))}
              {extras.map((w) => {
                const person = data.people.find((p) => p.id === w.person_id);
                return (
                  <button className="decision-item" key={w.id} onClick={() => setEditingWorkItem(w)}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
                      <span className={`tag ${STATUS_TAG['pending']}`}>Pending</span>
                      {person && <span className="tag tag-info">{person.name}</span>}
                      {w.due_date && <Due date={w.due_date} />}
                    </div>
                    <div className="card-title">{w.title}</div>
                    {w.notes && <p className="card-meta">{w.notes.slice(0, 100)}{w.notes.length > 100 ? '…' : ''}</p>}
                  </button>
                );
              })}
            </React.Fragment>
          );
        })}
      </div>
      {creating && <DecisionModal onClose={() => setCreating(false)} />}
      {editing && <DecisionModal existing={editing} onClose={() => setEditing(null)} />}
      {editingWorkItem && <ItemModal existing={editingWorkItem} onClose={() => setEditingWorkItem(null)} />}
    </>
  );
}
