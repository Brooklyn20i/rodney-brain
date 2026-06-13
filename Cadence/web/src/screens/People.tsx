import React, { useMemo, useState } from 'react';
import { useCadence } from '../lib/store';
import type { Person, WorkItem } from '../lib/types';
import { ScreenHeader, Modal, Due } from '../components/bits';
import { ItemModal } from '../components/ItemModal';

const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() || '').join('');

function PersonModal({ existing, onClose }: { existing?: Person; onClose: () => void }) {
  const { insert, update, logActivity } = useCadence();
  const [name, setName] = useState(existing?.name || '');
  const [role, setRole] = useState(existing?.role || '');
  const [notes, setNotes] = useState(existing?.notes || '');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const patch = { name: name.trim(), role: role.trim(), notes } as Partial<Person>;
      if (existing) await update('people', existing.id, patch);
      else await insert('people', { ...patch, email: '' } as Partial<Person>);
      logActivity(existing ? 'edit_person' : 'add_person', name.trim());
      onClose();
    } finally { setBusy(false); }
  };
  return (
    <Modal title={existing ? 'Edit Person' : 'Add Person'} onClose={onClose}
      footer={<><button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button></>}>
      <div className="form-row">
        <div className="form-group"><label>Name</label>
          <input type="text" autoFocus value={name} placeholder="Full name" onChange={(e) => setName(e.target.value)} /></div>
        <div className="form-group"><label>Role</label>
          <input type="text" value={role} placeholder="e.g. CFO, Lead Dev" onChange={(e) => setRole(e.target.value)} /></div>
      </div>
      <div className="form-group"><label>Notes</label>
        <textarea value={notes} placeholder="Context about this person…" onChange={(e) => setNotes(e.target.value)} /></div>
    </Modal>
  );
}

function Row({ w, onEdit }: { w: WorkItem; onEdit: (w: WorkItem) => void }) {
  const { update } = useCadence();
  return (
    <div className="work-item-row">
      <input type="checkbox" checked={w.done} onChange={() => update('work_items', w.id, { done: !w.done, completed_at: !w.done ? new Date().toISOString() : null } as Partial<WorkItem>)} />
      <span className={`wi-title ${w.done ? 'done' : ''}`}>{w.title}</span>
      <Due date={w.due_date} />
      <button className="btn-icon" onClick={() => onEdit(w)}>✎</button>
    </div>
  );
}

function Detail({ person, onEditPerson }: { person: Person; onEditPerson: () => void }) {
  const { data } = useCadence();
  const items = data.work_items.filter((w) => w.person_id === person.id && !w.done);
  const waiting = items.filter((w) => w.type === 'waitingFor');
  const follow = items.filter((w) => w.type === 'followUp');
  const other = items.filter((w) => w.type !== 'waitingFor' && w.type !== 'followUp');
  const first = person.name.split(' ')[0];
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<WorkItem | null>(null);

  return (
    <div className="split-right">
      <div className="split-panel-header">
        <h3>{person.name}</h3>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn btn-secondary btn-sm" onClick={onEditPerson}>Edit</button>
          <button className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>+ Follow Up</button>
        </div>
      </div>
      <div className="split-panel-body">
        {person.role && <p className="card-meta" style={{ marginBottom: 10 }}>{person.role}</p>}
        {person.notes && <div className="card card-compact"><p style={{ fontSize: 14 }}>{person.notes}</p></div>}
        {items.length === 0 ? (
          <div className="empty-state"><div className="icon">✓</div><p>Nothing pending with this person</p></div>
        ) : <>
          {waiting.length > 0 && <div className="detail-section"><h3>Waiting On {first}</h3>{waiting.map((w) => <Row key={w.id} w={w} onEdit={setEditing} />)}</div>}
          {follow.length > 0 && <div className="detail-section"><h3>Follow Ups</h3>{follow.map((w) => <Row key={w.id} w={w} onEdit={setEditing} />)}</div>}
          {other.length > 0 && <div className="detail-section"><h3>Other</h3>{other.map((w) => <Row key={w.id} w={w} onEdit={setEditing} />)}</div>}
        </>}
      </div>
      {adding && <ItemModal defaults={{ person_id: person.id, type: 'followUp' }} onClose={() => setAdding(false)} />}
      {editing && <ItemModal existing={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

export function People({ onMenu }: { onMenu?: () => void }) {
  const { data } = useCadence();
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Person | null>(null);
  const sorted = useMemo(() => [...data.people].sort((a, b) => a.name.localeCompare(b.name)), [data]);
  const person = data.people.find((p) => p.id === selected) || null;

  return (
    <>
      <ScreenHeader title="People" onMenu={onMenu} />
      <div className="split-view">
        <div className="split-left">
          <div className="split-panel-header"><h3>People</h3><button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>+ Add</button></div>
          <div className="split-panel-body">
            {sorted.length ? sorted.map((p) => {
              const items = data.work_items.filter((w) => w.person_id === p.id && !w.done);
              const w = items.filter((i) => i.type === 'waitingFor').length;
              const f = items.filter((i) => i.type === 'followUp').length;
              return (
                <button className={`person-item ${selected === p.id ? 'selected' : ''}`} key={p.id} onClick={() => setSelected(p.id)}>
                  <span className="avatar">{initials(p.name)}</span>
                  <div className="project-info">
                    <div className="project-name">{p.name}</div>
                    <div className="project-meta">{p.role ? p.role + ' · ' : ''}{w} waiting · {f} follow-ups</div>
                  </div>
                </button>
              );
            }) : <div className="empty-state"><div className="icon">✦</div><p>No people yet</p><small>Track follow-ups and waiting items by person</small></div>}
          </div>
        </div>
        {person ? <Detail person={person} onEditPerson={() => setEditing(person)} /> : (
          <div className="split-right"><div className="empty-state" style={{ margin: 'auto' }}><div className="icon">✦</div><p>Select a person</p></div></div>
        )}
      </div>
      {creating && <PersonModal onClose={() => setCreating(false)} />}
      {editing && <PersonModal existing={editing} onClose={() => setEditing(null)} />}
    </>
  );
}
