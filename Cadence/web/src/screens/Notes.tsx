import React, { useMemo, useState } from 'react';
import { useCadence } from '../lib/store';
import type { Note } from '../lib/types';
import { ScreenHeader } from '../components/bits';
import { fmtDM } from '../lib/util';
import { RichEditor } from '../components/RichEditor';

const folderOf = (n: Note) => (n.folder || '').trim();
const byUpdated = (a: Note, b: Note) => b.updated_at.localeCompare(a.updated_at);
const NEW_FOLDER = '__new__';

// Strip HTML tags for list preview
function stripHtml(html: string) {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
}

export function Notes({ onMenu }: { onMenu?: () => void }) {
  const { data: rawData, insert, update, remove } = useCadence();
  // Hide system notes (title or folder starting with __) — includes WIN state and meeting notes
  const data = useMemo(() => ({ ...rawData, notes: rawData.notes.filter((n) => !n.title.startsWith('__') && !(n.folder || '').startsWith('__')) }), [rawData]);
  const [selected, setSelected] = useState<string | null>(null);
  const [showList, setShowList] = useState(true);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [extraFolders, setExtraFolders] = useState<string[]>([]);
  const [title, setTitle] = useState('');

  const note = data.notes.find((n) => n.id === selected) || null;

  const folders = useMemo(() => {
    const fromNotes = data.notes.map(folderOf).filter(Boolean);
    return Array.from(new Set([...fromNotes, ...extraFolders])).sort((a, b) => a.localeCompare(b));
  }, [data.notes, extraFolders]);

  const notesIn = (f: string) => data.notes.filter((n) => folderOf(n) === f).sort(byUpdated);
  const uncategorized = notesIn('');

  const save = (patch: Partial<Note>) => { if (note) update('notes', note.id, patch); };

  const newNote = async (folder = '') => {
    let n: Note;
    try { n = await insert('notes', { title: 'Untitled note', body: '', folder } as Partial<Note>); }
    catch (e: any) {
      if (/folder/i.test(String(e?.message || e))) n = await insert('notes', { title: 'Untitled note', body: '' } as Partial<Note>);
      else throw e;
    }
    if (folder) setCollapsed((c) => ({ ...c, [folder]: false }));
    setSelected(n.id);
    setTitle('Untitled note');
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

  const renameFolder = async (oldName: string) => {
    const newName = window.prompt('Rename folder', oldName)?.trim();
    if (!newName || newName === oldName) return;
    const toUpdate = data.notes.filter((n) => folderOf(n) === oldName);
    await Promise.all(toUpdate.map((n) => update('notes', n.id, { folder: newName } as Partial<Note>)));
    setExtraFolders((f) => f.map((x) => (x === oldName ? newName : x)));
    setCollapsed((c) => {
      const next = { ...c };
      if (oldName in next) { next[newName] = next[oldName]; delete next[oldName]; }
      return next;
    });
  };

  const onFolderSelect = async (v: string) => {
    if (v === NEW_FOLDER) { const name = addFolder(); if (name) await moveNote(name); }
    else await moveNote(v);
  };

  const selectNote = (n: Note) => { setSelected(n.id); setTitle(n.title || ''); setShowList(false); };

  const NoteRow = (n: Note) => (
    <button className={`note-list-item ${selected === n.id ? 'selected' : ''}`} key={n.id} onClick={() => selectNote(n)}>
      <div className="nli-title">{n.title || 'Untitled note'}</div>
      <div className="nli-sub">{fmtDM(n.updated_at)} · {stripHtml(n.body)}</div>
    </button>
  );

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
          <button className="folder-add" title="Rename folder" onClick={(e) => { e.stopPropagation(); renameFolder(name); }}>✎</button>
          <button className="folder-add" title="New note in this folder" onClick={(e) => { e.stopPropagation(); newNote(name); }}>＋</button>
        </div>
        {!isCollapsed && <div className="folder-notes">{items.map(NoteRow)}</div>}
      </div>
    );
  };

  return (
    <>
      <ScreenHeader title="Notes" onMenu={onMenu} />
      <div className={`split-view${note && !showList ? ' notes-focus' : ''}`}>
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
                      <span className="folder-name" style={{ color: 'var(--text2)' }}>Uncategorised</span>
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
              <button className="notes-list-toggle" onClick={() => setShowList((v) => !v)} title="Toggle note list">
                {showList ? '◂' : '▸'}
              </button>
              <input
                id="note-title-input"
                value={title}
                placeholder="Untitled note"
                onChange={(e) => setTitle(e.target.value)}
                onBlur={() => save({ title: title.trim() || 'Untitled note' })}
              />
              <select className="note-folder-select" value={folderOf(note)} onChange={(e) => onFolderSelect(e.target.value)}>
                <option value="">📁 No folder</option>
                {folders.map((f) => <option key={f} value={f}>📁 {f}</option>)}
                <option value={NEW_FOLDER}>＋ New folder…</option>
              </select>
              <button className="btn btn-danger btn-sm" onClick={() => { remove('notes', note.id); setSelected(null); setShowList(true); }}>Delete</button>
            </div>
            <div className="split-panel-body" style={{ padding: 0, overflow: 'hidden' }}>
              <RichEditor
                key={note.id}
                content={note.body || ''}
                onBlur={(html) => save({ body: html })}
              />
            </div>
          </div>
        ) : (
          <div className="split-right">
            <div className="empty-state" style={{ margin: 'auto' }}>
              <div className="icon">✎</div>
              <p>Select or create a note</p>
              <small>Organise into folders on the left</small>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
