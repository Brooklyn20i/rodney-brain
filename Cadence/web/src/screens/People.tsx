import React, { useMemo, useState } from 'react';
import { useCadence } from '../lib/store';
import type { Person, TalkingPoint } from '../lib/types';
import { EmptyState, ScreenHeader, Modal } from '../components/bits';

function NewPerson({ onClose }: { onClose: () => void }) {
  const { insert, logActivity } = useCadence();
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await insert('people', { name: name.trim(), role: role.trim(), email: email.trim(), notes: '' } as Partial<Person>);
      logActivity('add_person', name.trim());
      onClose();
    } finally { setBusy(false); }
  };

  return (
    <Modal title="New Person" onClose={onClose}
      footer={<>
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Add person'}</button>
      </>}>
      <div className="form-group"><label className="field">Name</label>
        <input type="text" autoFocus value={name} onChange={(e) => setName(e.target.value)} /></div>
      <div className="form-group"><label className="field">Role</label>
        <input type="text" value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. CFO, Investor" /></div>
      <div className="form-group"><label className="field">Email</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
    </Modal>
  );
}

function PersonDetail({ person, onBack }: { person: Person; onBack: () => void }) {
  const { data, insert, update, remove } = useCadence();
  const points = data.talking_points.filter((t) => t.person_id === person.id);
  const open = points.filter((p) => !p.done);
  const done = points.filter((p) => p.done);
  const [txt, setTxt] = useState('');

  const add = async () => {
    if (!txt.trim()) return;
    await insert('talking_points', { person_id: person.id, text: txt.trim(), done: false, author: 'you' } as Partial<TalkingPoint>);
    setTxt('');
  };

  return (
    <div className="screen-content">
      <button className="btn btn-ghost btn-sm" onClick={onBack} style={{ marginBottom: 12 }}>← All people</button>
      <div className="card">
        <div className="card-title" style={{ fontSize: 18 }}>{person.name}</div>
        {person.role && <p className="card-meta" style={{ marginTop: 2 }}>{person.role}</p>}
        {person.email && <a href={`mailto:${person.email}`} className="card-meta" style={{ color: 'var(--accent)' }}>{person.email}</a>}
      </div>

      <div className="section-header"><h2>Talking Points</h2><span className="section-count" style={{ background: 'var(--accent)' }}>{open.length}</span></div>
      <div className="form-row" style={{ marginBottom: 10 }}>
        <input type="text" placeholder="Add a talking point…" value={txt}
          onChange={(e) => setTxt(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} />
        <button className="btn btn-secondary" onClick={add}>Add</button>
      </div>
      <div className="row-list">
        {open.map((p) => (
          <div className="card card-compact" key={p.id}>
            <div className="card-row">
              <input type="checkbox" checked={false} onChange={() => update('talking_points', p.id, { done: true } as Partial<TalkingPoint>)}
                style={{ width: 16, height: 16, accentColor: 'var(--accent)' }} />
              <span className="card-title" style={{ flex: 1 }}>{p.text}</span>
              <button className="btn btn-sm btn-ghost" onClick={() => remove('talking_points', p.id)}>✕</button>
            </div>
          </div>
        ))}
        {open.length === 0 && <div className="card-meta">No open talking points.</div>}
      </div>
      {done.length > 0 && <>
        <div className="section-header"><h2>Discussed</h2><span className="section-count" style={{ background: 'var(--text3)' }}>{done.length}</span></div>
        <div className="row-list">
          {done.map((p) => (
            <div className="card card-compact" key={p.id}>
              <div className="card-row">
                <span className="card-title" style={{ flex: 1, textDecoration: 'line-through', color: 'var(--text2)' }}>{p.text}</span>
                <button className="btn btn-sm btn-ghost" onClick={() => update('talking_points', p.id, { done: false } as Partial<TalkingPoint>)}>Undo</button>
              </div>
            </div>
          ))}
        </div>
      </>}
    </div>
  );
}

export function People({ onMenu }: { onMenu?: () => void }) {
  const { data } = useCadence();
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const sorted = useMemo(() => [...data.people].sort((a, b) => a.name.localeCompare(b.name)), [data]);
  const person = data.people.find((p) => p.id === selected) || null;

  return (
    <>
      <ScreenHeader title={person ? person.name : 'People'} subtitle={person ? undefined : `${sorted.length} contacts`} onMenu={onMenu}>
        {!person && <button className="btn btn-primary" onClick={() => setCreating(true)}>+ New Person</button>}
      </ScreenHeader>
      {person ? <PersonDetail person={person} onBack={() => setSelected(null)} /> : (
        <div className="screen-content">
          <div className="row-list">
            {sorted.length ? sorted.map((p) => {
              const open = data.talking_points.filter((t) => t.person_id === p.id && !t.done).length;
              return (
                <button className="card card-clickable" key={p.id} onClick={() => setSelected(p.id)}>
                  <div className="card-row">
                    <div style={{ flex: 1, textAlign: 'left' }}>
                      <div className="card-title">{p.name}</div>
                      {p.role && <p className="card-meta" style={{ marginTop: 2 }}>{p.role}</p>}
                    </div>
                    {open > 0 && <span className="nav-badge">{open}</span>}
                    <span style={{ color: 'var(--text3)' }}>›</span>
                  </div>
                </button>
              );
            }) : <EmptyState icon="👥" title="No people yet" sub="Add the people you work with." />}
          </div>
        </div>
      )}
      {creating && <NewPerson onClose={() => setCreating(false)} />}
    </>
  );
}
