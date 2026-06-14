import React, { useMemo, useState } from 'react';
import { useCadence } from '../lib/store';
import type { Person, TalkingPoint, WorkItem } from '../lib/types';
import { ScreenHeader, Modal, Due } from '../components/bits';
import { ItemModal } from '../components/ItemModal';

const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() || '').join('');

const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString();

function PersonModal({ existing, onClose }: { existing?: Person; onClose: () => void }) {
  const { insert, update, logActivity } = useCadence();
  const [name, setName] = useState(existing?.name || '');
  const [role, setRole] = useState(existing?.role || '');
  const [email, setEmail] = useState(existing?.email || '');
  const [notes, setNotes] = useState(existing?.notes || '');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const patch = { name: name.trim(), role: role.trim(), email: email.trim(), notes } as Partial<Person>;
      if (existing) await update('people', existing.id, patch);
      else await insert('people', { ...patch } as Partial<Person>);
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
      <div className="form-group"><label>Email</label>
        <input type="email" value={email} placeholder="email@company.com" onChange={(e) => setEmail(e.target.value)} /></div>
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

function TalkingPoints({ personId }: { personId: string }) {
  const { data, insert, update } = useCadence();
  const [draft, setDraft] = useState('');
  const points = data.talking_points.filter((tp) => tp.person_id === personId && !tp.deleted_at);
  const open = points.filter((tp) => !tp.done);
  const done = points.filter((tp) => tp.done);

  const add = async () => {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    await insert('talking_points', { person_id: personId, text, done: false, author: 'you' } as Partial<TalkingPoint>);
  };

  const toggle = (tp: TalkingPoint) => update('talking_points', tp.id, { done: !tp.done } as Partial<TalkingPoint>);

  return (
    <div className="detail-section">
      <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        💬 Talking Points
        {points.length > 0 && <span className="section-count" style={{ background: 'var(--accent)' }}>{open.length}</span>}
        <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 400, color: 'var(--text3)', textTransform: 'none', letterSpacing: 0 }}>Agenda for next 1:1</span>
      </h3>
      {open.map((tp) => (
        <div key={tp.id} className="work-item-row">
          <input type="checkbox" checked={false} onChange={() => toggle(tp)} />
          <span className="wi-title">{tp.text}</span>
        </div>
      ))}
      {done.map((tp) => (
        <div key={tp.id} className="work-item-row" style={{ opacity: 0.5 }}>
          <input type="checkbox" checked={true} onChange={() => toggle(tp)} />
          <span className="wi-title done">{tp.text}</span>
        </div>
      ))}
      <div className="work-item-row" style={{ gap: 10 }}>
        <span style={{ color: 'var(--text3)', fontSize: 16, paddingLeft: 1 }}>+</span>
        <input
          style={{ flex: 1, border: 'none', outline: 'none', fontSize: 14, background: 'transparent', fontFamily: 'inherit', color: 'var(--text)' }}
          placeholder="Add a talking point…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
        />
      </div>
    </div>
  );
}

function RecentlyDone({ items }: { items: WorkItem[] }) {
  const [open, setOpen] = useState(false);
  if (!items.length) return null;
  const fmt = (ts: string | null) => ts ? new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';
  return (
    <div className="detail-section">
      <h3 style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }} onClick={() => setOpen((o) => !o)}>
        ✓ Recently Done
        <span className="section-count" style={{ background: 'var(--green)' }}>{items.length}</span>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text3)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
          Last 14 days {open ? '▴' : '▾'}
        </span>
      </h3>
      {open && items.map((w) => (
        <div key={w.id} className="work-item-row" style={{ opacity: 0.6 }}>
          <span style={{ color: 'var(--green)', fontSize: 13 }}>✓</span>
          <span className="wi-title done" style={{ flex: 1 }}>{w.title}</span>
          <span style={{ fontSize: 11, color: 'var(--text3)' }}>{fmt(w.completed_at)}</span>
        </div>
      ))}
    </div>
  );
}

function InlineNotes({ person }: { person: Person }) {
  const { update } = useCadence();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(person.notes);

  const save = () => {
    update('people', person.id, { notes: draft } as Partial<Person>);
    setEditing(false);
  };

  if (!editing && !person.notes) return (
    <button className="btn btn-ghost" style={{ fontSize: 12, color: 'var(--text3)', padding: '4px 0' }} onClick={() => { setDraft(''); setEditing(true); }}>
      + Add notes
    </button>
  );

  if (editing) return (
    <div className="detail-section">
      <h3>Notes</h3>
      <textarea
        autoFocus
        style={{ width: '100%', border: '1px solid var(--accent)', borderRadius: 'var(--radius-sm)', padding: '8px 10px', fontSize: 14, fontFamily: 'inherit', resize: 'vertical', outline: 'none', minHeight: 80 }}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => { if (e.key === 'Escape') { setDraft(person.notes); setEditing(false); } }}
      />
      <div style={{ display: 'flex', gap: 6, marginTop: 6, justifyContent: 'flex-end' }}>
        <button className="btn btn-secondary btn-sm" onClick={() => { setDraft(person.notes); setEditing(false); }}>Cancel</button>
        <button className="btn btn-primary btn-sm" onClick={save}>Save</button>
      </div>
    </div>
  );

  return (
    <div className="detail-section" onClick={() => { setDraft(person.notes); setEditing(true); }} style={{ cursor: 'text' }}>
      <h3 style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        Notes <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text3)', textTransform: 'none', letterSpacing: 0 }}>Click to edit</span>
      </h3>
      <p style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.6 }}>{person.notes}</p>
    </div>
  );
}

function Detail({ person, onEditPerson }: { person: Person; onEditPerson: () => void }) {
  const { data } = useCadence();
  const allItems = data.work_items.filter((w) => w.person_id === person.id);
  const active = allItems.filter((w) => !w.done);
  const recentDone = allItems.filter((w) => w.done && w.completed_at && w.completed_at > daysAgo(14))
    .sort((a, b) => (b.completed_at || '').localeCompare(a.completed_at || ''));

  const waiting = active.filter((w) => w.type === 'waitingFor');
  const follow = active.filter((w) => w.type === 'followUp');
  const other = active.filter((w) => w.type !== 'waitingFor' && w.type !== 'followUp');
  const first = person.name.split(' ')[0];
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<WorkItem | null>(null);

  return (
    <div className="split-right">
      <div className="split-panel-header">
        <div>
          <h3>{person.name}</h3>
          {person.role && <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>{person.role}</div>}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn btn-secondary btn-sm" onClick={onEditPerson}>Edit</button>
          <button className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>+ Add item</button>
        </div>
      </div>
      <div className="split-panel-body">
        <InlineNotes person={person} />
        <TalkingPoints personId={person.id} />
        {waiting.length > 0 && <div className="detail-section"><h3>Waiting on {first}</h3>{waiting.map((w) => <Row key={w.id} w={w} onEdit={setEditing} />)}</div>}
        {follow.length > 0 && <div className="detail-section"><h3>Follow Ups</h3>{follow.map((w) => <Row key={w.id} w={w} onEdit={setEditing} />)}</div>}
        {other.length > 0 && <div className="detail-section"><h3>Other</h3>{other.map((w) => <Row key={w.id} w={w} onEdit={setEditing} />)}</div>}
        {active.length === 0 && <div className="empty-state"><div className="icon">✓</div><p>Nothing pending with {first}</p></div>}
        <RecentlyDone items={recentDone} />
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
              const tps = data.talking_points.filter((tp) => tp.person_id === p.id && !tp.done && !tp.deleted_at).length;
              return (
                <button className={`person-item ${selected === p.id ? 'selected' : ''}`} key={p.id} onClick={() => setSelected(p.id)}>
                  <span className="avatar">{initials(p.name)}</span>
                  <div className="project-info">
                    <div className="project-name">{p.name}</div>
                    <div className="project-meta">{p.role ? p.role + ' · ' : ''}{w} waiting · {f} follow-ups{tps > 0 ? ` · ${tps} talking pts` : ''}</div>
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
