import React, { useMemo, useState } from 'react';
import { useCadence } from '../lib/store';
import { EmptyState } from '../components/bits';

export function Notes() {
  const { data } = useCadence();
  const notes = useMemo(() => data.notes.filter((n) => !n.deleted_at).sort((a, b) => b.updated_at.localeCompare(a.updated_at)), [data.notes]);
  const [selectedId, setSelectedId] = useState<string>('');
  const selected = notes.find((n) => n.id === (selectedId || notes[0]?.id));

  return (
    <>
      <div className="screen-header"><div><h1>Notes</h1><div className="subtitle">Reference notes and capture fragments</div></div></div>
      <div className="screen-content split-screen">
        <div className="split-list">
          {notes.length ? notes.map((n) => <button className={`list-row ${selected?.id === n.id ? 'active' : ''}`} key={n.id} onClick={() => setSelectedId(n.id)}><span><strong>{n.title || 'Untitled'}</strong><small>{new Date(n.updated_at).toLocaleDateString('en-GB')}</small></span></button>) : <EmptyState icon="✎" title="No notes yet" />}
        </div>
        <div className="split-detail">
          {!selected ? <EmptyState icon="✎" title="Select a note" /> : <article className="card"><h2>{selected.title || 'Untitled'}</h2><p className="note-body">{selected.body || 'No body.'}</p></article>}
        </div>
      </div>
    </>
  );
}
