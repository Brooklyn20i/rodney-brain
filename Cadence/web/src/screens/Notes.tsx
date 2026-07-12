import { useMemo, useState, useRef, useEffect } from 'react';
import { useCadence } from '../lib/store';
import type { Note, WorkItem, RelatedEntity } from '../lib/types';
import { ScreenHeader, Modal } from '../components/bits';
import { fmtDM } from '../lib/util';
import { RichEditor } from '../components/RichEditor';
import { ItemModal } from '../components/ItemModal';
import { NoteSharePanel } from '../components/NoteSharePanel';

const folderOf = (n: Note) => (n.folder || '').trim();
const byUpdated = (a: Note, b: Note) => b.updated_at.localeCompare(a.updated_at);
const NEW_FOLDER = '__new__';

function stripHtml(html: string) {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
}

// Full-text haystack for search — title plus the whole body, tags stripped.
const searchBlob = (n: Note) =>
  `${n.title} ${n.body.replace(/<[^>]+>/g, ' ')}`.toLowerCase();

// ── Stable sub-components (defined outside Notes so React never remounts them) ─

function NoteRow({ n, selected, onSelect }: { n: Note; selected: string | null; onSelect: (n: Note) => void }) {
  return (
    <button className={`note-list-item ${selected === n.id ? 'selected' : ''}`} onClick={() => onSelect(n)}>
      <div className="nli-title">{n.title || 'Untitled note'}</div>
      <div className="nli-sub">{fmtDM(n.updated_at)} · {stripHtml(n.body)}</div>
    </button>
  );
}

interface FolderRowProps {
  name: string;
  notes: Note[];
  isCollapsed: boolean;
  isEditing: boolean;
  editingName: string;
  selectedId: string | null;
  onToggle: () => void;
  onStartEdit: () => void;
  onEditNameChange: (v: string) => void;
  onCommitEdit: () => void;
  onCancelEdit: () => void;
  onNewNote: () => void;
  onSelectNote: (n: Note) => void;
}

function FolderRow({
  name, notes, isCollapsed, isEditing, editingName, selectedId,
  onToggle, onStartEdit, onEditNameChange, onCommitEdit, onCancelEdit, onNewNote, onSelectNote,
}: FolderRowProps) {
  return (
    <div>
      <div className="folder-header" onClick={() => !isEditing && onToggle()}>
        <span className={`folder-caret ${isCollapsed ? 'collapsed' : ''}`} style={{ visibility: isEditing ? 'hidden' : undefined }}>▾</span>
        <span style={{ fontSize: 14 }}>📁</span>
        {isEditing ? (
          <input
            className="folder-rename-input"
            autoFocus
            value={editingName}
            onChange={(e) => onEditNameChange(e.target.value)}
            onBlur={onCommitEdit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); onCommitEdit(); }
              if (e.key === 'Escape') { e.preventDefault(); onCancelEdit(); }
            }}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="folder-name">{name}</span>
        )}
        <span className="folder-count">{notes.length}</span>
        {isEditing
          ? <button className="folder-add" title="Confirm rename" onMouseDown={(e) => { e.preventDefault(); onCommitEdit(); }}>✓</button>
          : <button className="folder-add" title="Rename folder" onClick={(e) => { e.stopPropagation(); onStartEdit(); }}>✎</button>}
        <button className="folder-add" title="New note in this folder" onClick={(e) => { e.stopPropagation(); onNewNote(); }}>＋</button>
      </div>
      {!isCollapsed && notes.map((n) => (
        <div key={n.id} className="folder-notes">
          <NoteRow n={n} selected={selectedId} onSelect={onSelectNote} />
        </div>
      ))}
    </div>
  );
}

// ── Note actions panel ─────────────────────────────────────────────────────────

interface NoteActionsProps {
  note: Note;
  workItems: WorkItem[];
  update: (table: 'work_items', id: string, patch: Partial<WorkItem>) => Promise<WorkItem>;
}

function NoteActions({ note, workItems, update }: NoteActionsProps) {
  const linked = workItems.filter((w) =>
    (w.related_entities || []).some((re) => re.type === 'note' && re.id === note.id)
  );
  const tasks = linked.filter((w) => !w.done);
  const doneTasks = linked.filter((w) => w.done);

  const [open, setOpen] = useState(true);
  const [showDone, setShowDone] = useState(false);
  const [modal, setModal] = useState<'new' | WorkItem | null>(null);

  const noteLink: RelatedEntity = { type: 'note', id: note.id, name: note.title };

  const toggleDone = (e: React.MouseEvent, w: WorkItem) => {
    e.stopPropagation();
    update('work_items', w.id, {
      done: !w.done,
      completed_at: !w.done ? new Date().toISOString() : null,
    } as Partial<WorkItem>);
  };

  const entityTags = (w: WorkItem) => {
    const ents = w.related_entities || [];
    const visible = ents.filter((re) => re.type !== 'note');
    return visible.map((re) => (
      <span key={re.id} className={`tag tag-${re.type === 'person' ? 'person' : 'project'}`}
        style={{ fontSize: 11, padding: '1px 6px' }}>{re.name}</span>
    ));
  };

  return (
    <>
      <div className="note-actions-panel">
        <div className="note-actions-header" onClick={() => setOpen((v) => !v)}>
          <span className={`folder-caret ${open ? '' : 'collapsed'}`}>▾</span>
          <span style={{ fontWeight: 600, fontSize: 13 }}>Actions</span>
          {tasks.length > 0 && <span className="folder-count">{tasks.length}</span>}
          <button
            className="btn btn-primary btn-sm"
            style={{ marginLeft: 'auto', fontSize: 12 }}
            onClick={(e) => { e.stopPropagation(); setOpen(true); setModal('new'); }}
          >+ Task</button>
        </div>

        {open && (
          <div className="note-actions-body">
            {tasks.length === 0 && doneTasks.length === 0 && (
              <p className="note-actions-empty">No tasks yet — tap + Task to add one.</p>
            )}
            {tasks.map((w) => (
              <div key={w.id} className="note-action-item" onClick={() => setModal(w)}>
                <input type="checkbox" checked={false}
                  onChange={() => {}}
                  onClick={(e) => toggleDone(e, w)}
                  className="note-action-check" />
                <span className="note-action-title">{w.title}</span>
                <div className="note-action-tags">{entityTags(w)}</div>
              </div>
            ))}

            {doneTasks.length > 0 && (
              <button className="note-action-show-done"
                onClick={() => setShowDone((v) => !v)}>
                {showDone ? '▾' : '▸'} {doneTasks.length} completed
              </button>
            )}
            {showDone && doneTasks.map((w) => (
              <div key={w.id} className="note-action-item note-action-done" onClick={() => setModal(w)}>
                <input type="checkbox" checked
                  onChange={() => {}}
                  onClick={(e) => toggleDone(e, w)}
                  className="note-action-check" />
                <span className="note-action-title">{w.title}</span>
                <div className="note-action-tags">{entityTags(w)}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {modal === 'new' && (
        <ItemModal
          defaults={{ related_entities: [noteLink], inboxed: true } as Partial<WorkItem>}
          onClose={() => setModal(null)}
        />
      )}
      {modal && modal !== 'new' && (
        <ItemModal existing={modal as WorkItem} onClose={() => setModal(null)} />
      )}
    </>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────────

export function Notes({ onMenu }: { onMenu?: () => void }) {
  const { data: rawData, insert, update, remove } = useCadence();
  const updateWorkItem = (table: 'work_items', id: string, patch: Partial<WorkItem>) =>
    update(table, id, patch) as Promise<WorkItem>;
  // Hide system notes (title or folder starting with __) — meeting notes and WIN state
  const data = useMemo(() => ({
    ...rawData,
    notes: rawData.notes.filter((n) => !n.title.startsWith('__') && !(n.folder || '').startsWith('__')),
  }), [rawData]);

  const [selected, setSelected] = useState<string | null>(null);
  const [showList, setShowList] = useState(true);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [extraFolders, setExtraFolders] = useState<string[]>([]);
  const [editingFolder, setEditingFolder] = useState<string | null>(null);
  const [editingFolderName, setEditingFolderName] = useState('');
  const [title, setTitle] = useState('');
  const [sharing, setSharing] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [query, setQuery] = useState('');
  const [folderModal, setFolderModal] = useState<null | { moveCurrent: boolean }>(null);
  const [folderName, setFolderName] = useState('');
  // Multi-device stale-guard: never save unless the user actually edited, adopt
  // remote versions silently while clean, and ask when both sides have changes.
  const [editorEpoch, setEditorEpoch] = useState(0);
  const [conflict, setConflict] = useState(false);
  const dirtyRef = useRef(false);
  const savingRef = useRef(false);
  const lastSeenRef = useRef('');
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const note = data.notes.find((n) => n.id === selected) || null;

  useEffect(() => {
    setSaveStatus('idle');
    setConflict(false);
    dirtyRef.current = false;
    lastSeenRef.current = note?.updated_at || '';
    if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note?.id]);

  // Watch for the open note changing under us (another device / realtime).
  useEffect(() => {
    if (!note || savingRef.current) return;
    if (!note.updated_at || note.updated_at <= lastSeenRef.current) return;
    if (dirtyRef.current) { setConflict(true); return; }
    lastSeenRef.current = note.updated_at;
    setTitle(note.title || '');
    setEditorEpoch((e) => e + 1); // remount the editor onto the fresh body
  }, [note]);

  const folders = useMemo(() => {
    const fromNotes = data.notes.map(folderOf).filter(Boolean);
    return Array.from(new Set([...fromNotes, ...extraFolders])).sort((a, b) => a.localeCompare(b));
  }, [data.notes, extraFolders]);

  const notesIn = (f: string) => data.notes.filter((n) => folderOf(n) === f).sort(byUpdated);
  const uncategorized = notesIn('');

  // All note writes go through here so our own saves are never mistaken for a
  // remote change by the stale-guard watcher above.
  const writeNote = async (patch: Partial<Note>) => {
    if (!note) return;
    savingRef.current = true;
    try {
      const saved = (await update('notes', note.id, patch)) as Note | undefined;
      if (saved?.updated_at) lastSeenRef.current = saved.updated_at;
    } finally { savingRef.current = false; }
  };

  const doSave = async (patch: Partial<Note>) => {
    if (!note || !dirtyRef.current) return; // clean instances must never clobber
    setSaveStatus('saving');
    try {
      await writeNote(patch);
      dirtyRef.current = false;
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus((s) => s === 'saved' ? 'idle' : s), 2000);
    } catch { setSaveStatus('error'); }
  };

  const scheduleBodySave = (html: string) => {
    dirtyRef.current = true;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => doSave({ body: html }), 800);
  };

  const loadTheirs = () => {
    if (!note) return;
    if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null; }
    dirtyRef.current = false;
    lastSeenRef.current = note.updated_at;
    setTitle(note.title || '');
    setEditorEpoch((e) => e + 1);
    setConflict(false);
  };

  const keepMine = () => {
    if (note) lastSeenRef.current = note.updated_at;
    setConflict(false); // local edits stay dirty; the next save wins
  };

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
    try { await writeNote({ folder } as Partial<Note>); }
    catch (e: any) { if (!/folder/i.test(String(e?.message || e))) throw e; }
  };

  const closeFolderModal = () => { setFolderModal(null); setFolderName(''); };

  const createFolder = async () => {
    const name = folderName.trim();
    const move = folderModal?.moveCurrent;
    closeFolderModal();
    if (!name) return;
    setExtraFolders((f) => Array.from(new Set([...f, name])));
    setCollapsed((c) => ({ ...c, [name]: false }));
    if (move) await moveNote(name);
  };

  const commitRename = async () => {
    const oldName = editingFolder;
    const newName = editingFolderName.trim();
    setEditingFolder(null);
    if (!oldName || !newName || newName === oldName) return;
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
    if (v === NEW_FOLDER) setFolderModal({ moveCurrent: true });
    else await moveNote(v);
  };

  const selectNote = (n: Note) => { setSelected(n.id); setTitle(n.title || ''); setShowList(false); };

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return data.notes.filter((n) => searchBlob(n).includes(q)).sort(byUpdated);
  }, [data.notes, query]);

  return (
    <>
      <ScreenHeader title="Notes" onMenu={onMenu} />
      <div className={`split-view${note && !showList ? ' notes-focus' : ''}`}>
        <div className="split-left">
          <div className="split-panel-header"><h3>Notebooks</h3>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setFolderModal({ moveCurrent: false })}>+ Folder</button>
              <button className="btn btn-primary btn-sm" onClick={() => newNote(note ? folderOf(note) : '')}>+ Note</button>
            </div>
          </div>
          <div className="notes-search">
            <input
              type="search"
              placeholder="Search notes…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="split-panel-body">
            {searchResults ? (
              searchResults.length === 0
                ? <small style={{ color: 'var(--text3)' }}>No notes match “{query.trim()}”.</small>
                : searchResults.map((n) => (
                  <NoteRow key={n.id} n={n} selected={selected} onSelect={selectNote} />
                ))
            ) : data.notes.length === 0 && folders.length === 0
              ? <small style={{ color: 'var(--text3)' }}>No notes yet. Tap "+ Note".</small>
              : <>
                <div className="folder-header" style={{ cursor: 'default' }}>
                  <span className="folder-caret" style={{ visibility: 'hidden' }}>▾</span>
                  <span style={{ fontSize: 14 }}>🗂</span>
                  <span className="folder-name">All Notes</span>
                  <span className="folder-count">{data.notes.length}</span>
                </div>
                <div className="tree-sep" />
                {folders.map((f) => (
                  <FolderRow
                    key={f}
                    name={f}
                    notes={notesIn(f)}
                    isCollapsed={!!collapsed[f]}
                    isEditing={editingFolder === f}
                    editingName={editingFolder === f ? editingFolderName : f}
                    selectedId={selected}
                    onToggle={() => setCollapsed((c) => ({ ...c, [f]: !c[f] }))}
                    onStartEdit={() => { setEditingFolderName(f); setEditingFolder(f); }}
                    onEditNameChange={setEditingFolderName}
                    onCommitEdit={commitRename}
                    onCancelEdit={() => setEditingFolder(null)}
                    onNewNote={() => newNote(f)}
                    onSelectNote={selectNote}
                  />
                ))}
                {uncategorized.length > 0 && (
                  <>
                    {folders.length > 0 && <div className="tree-sep" />}
                    <div className="folder-header" onClick={() => setCollapsed((c) => ({ ...c, '': !c[''] }))}>
                      <span className={`folder-caret ${collapsed[''] ? 'collapsed' : ''}`}>▾</span>
                      <span style={{ fontSize: 14 }}>📄</span>
                      <span className="folder-name" style={{ color: 'var(--text2)' }}>Uncategorised</span>
                      <span className="folder-count">{uncategorized.length}</span>
                    </div>
                    {!collapsed[''] && uncategorized.map((n) => (
                      <div key={n.id} className="folder-notes">
                        <NoteRow n={n} selected={selected} onSelect={selectNote} />
                      </div>
                    ))}
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
                onChange={(e) => { dirtyRef.current = true; setTitle(e.target.value); }}
                onBlur={() => doSave({ title: title.trim() || 'Untitled note' })}
              />
              {saveStatus !== 'idle' && (
                <span className="notes-save-status" data-status={saveStatus}>
                  {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'saved' ? '✓ Saved' : '⚠ Save failed'}
                </span>
              )}
              <select className="note-folder-select" value={folderOf(note)} onChange={(e) => onFolderSelect(e.target.value)}>
                <option value="">📁 No folder</option>
                {folders.map((f) => <option key={f} value={f}>📁 {f}</option>)}
                <option value={NEW_FOLDER}>＋ New folder…</option>
              </select>
              <button className="btn btn-share btn-sm" onClick={() => setSharing(true)} title="Export to OneNote">📤 OneNote</button>
              <button className="btn btn-danger btn-sm" onClick={() => { remove('notes', note.id); setSelected(null); setShowList(true); }}>Delete</button>
            </div>
            {conflict && (
              <div className="note-conflict-banner">
                <span>This note changed on another device.</span>
                <button className="btn btn-secondary btn-sm" onClick={loadTheirs}>Load theirs</button>
                <button className="btn btn-primary btn-sm" onClick={keepMine}>Keep mine</button>
              </div>
            )}
            <div className="split-panel-body" style={{ padding: 0, overflow: 'hidden', flex: '1 1 0' }}>
              <RichEditor
                key={`${note.id}:${editorEpoch}`}
                content={note.body || ''}
                onChange={scheduleBodySave}
                onBlur={(html) => {
                  if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null; }
                  doSave({ body: html });
                }}
              />
            </div>
            <NoteActions
              note={note}
              workItems={data.work_items}
              update={updateWorkItem}
            />
            {sharing && <NoteSharePanel note={note} onClose={() => setSharing(false)} />}
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

      {folderModal && (
        <Modal title="New folder" onClose={closeFolderModal}
          footer={<>
            <button className="btn btn-secondary" onClick={closeFolderModal}>Cancel</button>
            <button className="btn btn-primary" disabled={!folderName.trim()} onClick={() => void createFolder()}>Create</button>
          </>}>
          <div className="form-group">
            <label>Folder name</label>
            <input
              type="text"
              autoFocus
              value={folderName}
              placeholder="e.g. Leadership"
              onChange={(e) => setFolderName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && folderName.trim()) void createFolder(); }}
            />
          </div>
        </Modal>
      )}
    </>
  );
}
