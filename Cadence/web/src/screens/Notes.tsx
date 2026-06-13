import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useCadence } from '../lib/store';
import type { Note } from '../lib/types';
import { ScreenHeader } from '../components/bits';

function renderPreview(body: string) {
  return body.split('\n').map((line, i) => {
    const indent = (line.match(/^\s*/)?.[0].length || 0);
    const t = line.trim();
    const pad = { paddingLeft: Math.floor(indent / 2) * 10 } as React.CSSProperties;
    if (t.startsWith('# ')) return <h3 key={i} style={{ fontSize: 17, fontWeight: 700, margin: '14px 0 6px' }}>{t.slice(2)}</h3>;
    if (/^- \[[ xX]\]/.test(t)) {
      const done = /\[[xX]\]/.test(t);
      return <div key={i} style={{ ...pad, display: 'flex', gap: 8, padding: '3px 0', color: done ? 'var(--text2)' : 'inherit', textDecoration: done ? 'line-through' : 'none' }}>{done ? '☑' : '☐'} {t.replace(/^- \[[ xX]\]\s*/, '')}</div>;
    }
    if (t.startsWith('- ')) return <div key={i} style={{ ...pad, display: 'flex', gap: 8, padding: '2px 0' }}><span style={{ color: 'var(--accent)' }}>•</span> {t.slice(2)}</div>;
    if (!t) return <div key={i} style={{ height: 8 }} />;
    return <div key={i} style={{ ...pad, padding: '2px 0' }}>{t}</div>;
  });
}

export function Notes({ onMenu }: { onMenu?: () => void }) {
  const { data, insert, update, remove } = useCadence();
  const [selected, setSelected] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const sorted = useMemo(() => [...data.notes].sort((a, b) => b.updated_at.localeCompare(a.updated_at)), [data]);
  const note = data.notes.find((n) => n.id === selected) || null;

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  useEffect(() => { setTitle(note?.title || ''); setBody(note?.body || ''); setPreview(false); }, [selected]);

  const save = (patch: Partial<Note>) => { if (note) update('notes', note.id, patch); };
  const newNote = async () => { const n = await insert('notes', { title: 'Untitled note', body: '' } as Partial<Note>); setSelected(n.id); };

  const insertPrefix = (prefix: string) => {
    const ta = taRef.current; if (!ta) return;
    const start = ta.selectionStart;
    const lineStart = body.lastIndexOf('\n', start - 1) + 1;
    const next = body.slice(0, lineStart) + prefix + body.slice(lineStart);
    setBody(next); save({ body: next });
  };

  return (
    <>
      <ScreenHeader title="Notes" onMenu={onMenu} />
      <div className="split-view">
        <div className="split-left">
          <div className="split-panel-header"><h3>Notes</h3><button className="btn btn-primary btn-sm" onClick={newNote}>+ New</button></div>
          <div className="split-panel-body">
            {sorted.length ? sorted.map((n) => {
              const sub = (n.body.split('\n').find((l) => l.trim()) || '').slice(0, 50);
              return (
                <button className={`note-list-item ${selected === n.id ? 'selected' : ''}`} key={n.id} onClick={() => setSelected(n.id)}>
                  <div className="nli-title">{n.title || 'Untitled note'}</div>
                  <div className="nli-sub">{new Date(n.updated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} · {sub}</div>
                </button>
              );
            }) : <small style={{ color: 'var(--text3)' }}>No notes yet. Tap "+ New".</small>}
          </div>
        </div>
        {note ? (
          <div className="split-right">
            <div className="split-panel-header">
              <input id="note-title-input" value={title} placeholder="Untitled note"
                onChange={(e) => setTitle(e.target.value)} onBlur={() => save({ title: title.trim() || 'Untitled note' })} />
              <button className="btn btn-danger btn-sm" onClick={() => { remove('notes', note.id); setSelected(null); }}>Delete</button>
            </div>
            <div className="note-toolbar" style={{ display: 'flex', gap: 4, padding: '8px 16px', borderBottom: '1px solid var(--border)', background: 'var(--surface2)' }}>
              <button className="btn-icon" onClick={() => insertPrefix('# ')}>H</button>
              <button className="btn-icon" onClick={() => insertPrefix('- ')}>•</button>
              <button className="btn-icon" onClick={() => insertPrefix('- [ ] ')}>☐</button>
              <div style={{ flex: 1 }} />
              <button className="btn btn-secondary btn-sm" onClick={() => setPreview((p) => !p)}>{preview ? '✎ Edit' : '👁 Preview'}</button>
            </div>
            <div className="split-panel-body">
              {preview ? <div className="note-preview">{renderPreview(body)}</div> : (
                <textarea ref={taRef} id="note-textarea" value={body}
                  placeholder={"Start typing…  '- ' bullet · '- [ ] ' checkbox · '# ' heading"}
                  onChange={(e) => setBody(e.target.value)} onBlur={() => save({ body })} />
              )}
            </div>
          </div>
        ) : (
          <div className="split-right"><div className="empty-state" style={{ margin: 'auto' }}><div className="icon">✎</div><p>Select or create a note</p><small>Bullet points, checklists &amp; headings</small></div></div>
        )}
      </div>
    </>
  );
}
