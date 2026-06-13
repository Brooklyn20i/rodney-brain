import React, { useMemo, useState } from 'react';
import { useCadence } from '../lib/store';
import type { Note } from '../lib/types';
import { EmptyState, ScreenHeader } from '../components/bits';

function Editor({ note, onClose }: { note: Note | 'new'; onClose: () => void }) {
  const { insert, update, remove, logActivity } = useCadence();
  const existing = note === 'new' ? null : note;
  const [title, setTitle] = useState(existing?.title || '');
  const [body, setBody] = useState(existing?.body || '');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!title.trim() && !body.trim()) { onClose(); return; }
    setBusy(true);
    try {
      if (existing) {
        await update('notes', existing.id, { title: title.trim() || 'Untitled', body } as Partial<Note>);
      } else {
        await insert('notes', { title: title.trim() || 'Untitled', body } as Partial<Note>);
        logActivity('add_note', title.trim() || 'Untitled');
      }
      onClose();
    } finally { setBusy(false); }
  };

  return (
    <div className="screen-content">
      <button className="btn btn-ghost btn-sm" onClick={save} style={{ marginBottom: 12 }}>← {busy ? 'Saving…' : 'Save & back'}</button>
      <div className="form-group">
        <input type="text" autoFocus value={title} placeholder="Title" onChange={(e) => setTitle(e.target.value)}
          style={{ fontSize: 18, fontWeight: 600 }} />
      </div>
      <div className="form-group">
        <textarea value={body} placeholder="Write…" onChange={(e) => setBody(e.target.value)}
          style={{ minHeight: 320 }} />
      </div>
      {existing && (
        <button className="btn btn-danger btn-sm" onClick={() => { remove('notes', existing.id); onClose(); }}>Delete note</button>
      )}
    </div>
  );
}

export function Notes({ onMenu }: { onMenu?: () => void }) {
  const { data } = useCadence();
  const [editing, setEditing] = useState<Note | 'new' | null>(null);
  const sorted = useMemo(() => [...data.notes].sort((a, b) => b.updated_at.localeCompare(a.updated_at)), [data]);

  if (editing) return (
    <>
      <ScreenHeader title={editing === 'new' ? 'New Note' : 'Edit Note'} onMenu={onMenu} />
      <Editor note={editing} onClose={() => setEditing(null)} />
    </>
  );

  return (
    <>
      <ScreenHeader title="Notes" subtitle={`${sorted.length} notes`} onMenu={onMenu}>
        <button className="btn btn-primary" onClick={() => setEditing('new')}>+ New Note</button>
      </ScreenHeader>
      <div className="screen-content">
        <div className="row-list">
          {sorted.length ? sorted.map((n) => (
            <button className="card card-clickable" key={n.id} onClick={() => setEditing(n)}>
              <div style={{ textAlign: 'left' }}>
                <div className="card-title">{n.title}</div>
                {n.body && <p className="card-meta" style={{ marginTop: 2, whiteSpace: 'pre-wrap' }}>{n.body.slice(0, 140)}{n.body.length > 140 ? '…' : ''}</p>}
                <div className="card-meta" style={{ marginTop: 6, color: 'var(--text3)' }}>{new Date(n.updated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</div>
              </div>
            </button>
          )) : <EmptyState icon="📝" title="No notes yet" sub="Jot down anything worth keeping." />}
        </div>
      </div>
    </>
  );
}
