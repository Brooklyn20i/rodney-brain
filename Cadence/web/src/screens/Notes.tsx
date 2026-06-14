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

const folderOf = (n: Note) => (n.folder || '').trim();
const byUpdated = (a: Note, b: Note) => b.updated_at.localeCompare(a.updated_at);
const NEW_FOLDER = '__new__';

export function Notes({ onMenu }: { onMenu?: () => void }) {
  const { data, insert, update, remove } = useCadence();
  const [selected, setSelected] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [extraFolders, setExtraFolders] = useState<string[]>([]); // created this session, still empty
  const taRef = useRef<HTMLTextAreaElement>(null);

  const note = data.notes.find((n) => n.id === selected) || null;

  // Folder list = folders that have notes ∪ freshly-created empty ones
  const folders = useMemo(() => {
    const fromNotes = data.notes.map(folderOf).filter(Boolean);
    return Array.from(new Set([...fromNotes, ...extraFolders])).sort((a, b) => a.localeCompare(b));
  }, [data.notes, extraFolders]);

  const notesIn = (f: string) => data.notes.filter((n) => folderOf(n) === f).sort(byUpdated);
  const uncategorized = notesIn('');

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  useEffect(() => { setTitle(note?.title || ''); setBody(note?.body || ''); setPreview(false); }, [selected]);

  const save = (patch: Partial<Note>) => { if (note) update('notes', note.id, patch); };

  // Resilient create — if the folder column isn't there yet, fall back to a plain note.
  const newNote = async (folder = '') => {
    let n: Note;
    try { n = await insert('notes', { title: 'Untitled note', body: '', folder } as Partial<Note>); }
    catch (e: any) {
      if (/folder/i.test(String(e?.message || e))) n = await insert('notes', { title: 'Untitled note', body: '' } as Partial<Note>);
      else throw e;
    }
    if (folder) setCollapsed((c) => ({ ...c, [folder]: false }));
    setSelected(n.id);
  };

  const moveNote = async (folder: string) => {
    if (!note) return;
    try { await update('notes', note.id, { folder } as Partial<Note>); }
    catch (e: any) { if (!/folder/i.test(String(e?.message || e))) throw e; }
  };

  const addFolder = () => {
    const name = window.prompt('New folder name')?.trim();
    if (!name) return name;
    setExtraFolders((f) => Array.from(new Set([...f, name])));
    setCollapsed((c) => ({ ...c, [name]: false }));
    return name;
  };

  const onFolderSelect = async (v: string) => {
    if (v === NEW_FOLDER) { const name = addFolder(); if (name) await moveNote(name); }
    else await moveNote(v);
  };

  const insertPrefix = (prefix: string) => {
    const ta = taRef.current; if (!ta) return;
    const start = ta.selectionStart;
    const lineStart = body.lastIndexOf('\n', start - 1) + 1;
    const next = body.slice(0, lineStart) + prefix + body.slice(lineStart);
    setBody(next); save({ body: next });
  };

  const NoteRow = (n: Note) => {
    const sub = (n.body.split('\n').find((l) => l.trim()) || '').slice(0, 50);
    return (
      <button className={`note-list-item ${selected === n.id ? 'selected' : ''}`} key={n.id} onClick={() => setSelected(n.id)}>
        <div className="nli-title">{n.title || 'Untitled note'}</div>
        <div className="nli-sub">{new Date(n.updated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} · {sub}</div>
      </button>
    );
  };

  const Folder = ({ name }: { name: string }) => {
    const items = notesIn(name);
    const isCollapsed = collapsed[name];
    return (
      <div key={name}>
        <div className="folder-header" onClick={() => setCollapsed((c) => ({ ...c, [name]: !c[name] }))}>
          <span className={`folder-caret ${isCollapsed ? 'collapsed' : ''}`}>▾</span>
          <span style={{ fontSize: 14 }}>📁</span>
          <span className="folder-name">{name}</span>
          <span className="folder-count">{items.length}</span>
          <button className="folder-add" title="New note in this folder"
            onClick={(e) => { e.stopPropagation(); newNote(name); }}>＋</button>
        </div>
        {!isCollapsed && <div className="folder-notes">{items.map(NoteRow)}</div>}
      </div>
    );
  };

  return (
    <>
      <ScreenHeader title="Notes" onMenu={onMenu} />
      <div className="split-view">
        <div className="split-left">
          <div className="split-panel-header"><h3>Notebooks</h3>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn btn-secondary btn-sm" onClick={addFolder}>+ Folder</button>
              <button className="btn btn-primary btn-sm" onClick={() => newNote(note ? folderOf(note) : '')}>+ Note</button>
            </div>
          </div>
          <div className="split-panel-body">
            {data.notes.length === 0 && folders.length === 0
              ? <small style={{ color: 'var(--text3)' }}>No notes yet. Tap "+ Note".</small>
              : <>
                <div className="folder-header" style={{ cursor: 'default' }}>
                  <span className="folder-caret" style={{ visibility: 'hidden' }}>▾</span>
                  <span style={{ fontSize: 14 }}>🗂</span>
                  <span className="folder-name">All Notes</span>
                  <span className="folder-count">{data.notes.length}</span>
                </div>
                <div className="tree-sep" />
                {folders.map((f) => <Folder key={f} name={f} />)}
                {uncategorized.length > 0 && (
                  <>
                    {folders.length > 0 && <div className="tree-sep" />}
                    <div className="folder-header" onClick={() => setCollapsed((c) => ({ ...c, '': !c[''] }))}>
                      <span className={`folder-caret ${collapsed[''] ? 'collapsed' : ''}`}>▾</span>
                      <span style={{ fontSize: 14 }}>📄</span>
                      <span className="folder-name" style={{ color: 'var(--text2)' }}>Uncategorized</span>
                      <span className="folder-count">{uncategorized.length}</span>
                    </div>
                    {!collapsed[''] && <div className="folder-notes">{uncategorized.map(NoteRow)}</div>}
                  </>
                )}
              </>}
          </div>
        </div>

        {note ? (
          <div className="split-right">
            <div className="split-panel-header">
              <input id="note-title-input" value={title} placeholder="Untitled note"
                onChange={(e) => setTitle(e.target.value)} onBlur={() => save({ title: title.trim() || 'Untitled note' })} />
              <button className="btn btn-danger btn-sm" onClick={() => { remove('notes', note.id); setSelected(null); }}>Delete</button>
            </div>
            <div className="note-toolbar" style={{ display: 'flex', gap: 4, padding: '8px 16px', borderBottom: '1px solid var(--border)', background: 'var(--surface2)', alignItems: 'center' }}>
              <select className="note-folder-select" value={folderOf(note)} onChange={(e) => onFolderSelect(e.target.value)}>
                <option value="">📁 No folder</option>
                {folders.map((f) => <option key={f} value={f}>📁 {f}</option>)}
                <option value={NEW_FOLDER}>＋ New folder…</option>
              </select>
              <div style={{ width: 8 }} />
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
          <div className="split-right"><div className="empty-state" style={{ margin: 'auto' }}><div className="icon">✎</div><p>Select or create a note</p><small>Organise into folders on the left</small></div></div>
        )}
      </div>
    </>
  );
}
