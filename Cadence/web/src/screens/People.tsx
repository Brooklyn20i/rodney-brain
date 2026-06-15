import React, { useMemo, useState } from 'react';
import { useCadence } from '../lib/store';
import type { Note, Person, WorkItem } from '../lib/types';
import { ScreenHeader, Modal, Due, TypeTag, PriTag } from '../components/bits';
import { ItemModal } from '../components/ItemModal';
import { RichEditor } from '../components/RichEditor';
import { autoColor, AVATAR_COLORS, priorityScore } from '../lib/util';

const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() || '').join('');
const colorOf = (p: Person) => p.color || autoColor(p.id || p.name);
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString();
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const fmtShort = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const stripHtml = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

const mtgFolder = (personId: string) => `__mtg__${personId}`;

// Extract plain-text list items from HTML for task creation
function extractListItems(html: string): string[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return Array.from(doc.querySelectorAll('li'))
    .map((li) => li.textContent?.trim() || '')
    .filter(Boolean);
}

// ── Person create/edit modal ───────────────────────────────────────────────────
function PersonModal({ existing, onClose }: { existing?: Person; onClose: () => void }) {
  const { insert, update, logActivity } = useCadence();
  const [name, setName] = useState(existing?.name || '');
  const [role, setRole] = useState(existing?.role || '');
  const [email, setEmail] = useState(existing?.email || '');
  const [notes, setNotes] = useState(existing?.notes || '');
  const [color, setColor] = useState(existing?.color || '');
  const [busy, setBusy] = useState(false);

  const effective = color || autoColor(name || existing?.name || 'person');

  const save = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const full = { name: name.trim(), role: role.trim(), email: email.trim(), notes, color: effective } as Partial<Person>;
      const write = async (body: Partial<Person>) => {
        if (existing) await update('people', existing.id, body);
        else await insert('people', body);
      };
      try { await write(full); }
      catch (e: any) {
        if (/color/i.test(String(e?.message || e))) { const { color: _omit, ...noColor } = full as any; await write(noColor); }
        else throw e;
      }
      logActivity(existing ? 'edit_person' : 'add_person', name.trim());
      onClose();
    } finally { setBusy(false); }
  };

  return (
    <Modal title={existing ? 'Edit Person' : 'Add Person'} onClose={onClose}
      footer={<><button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button></>}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
        <span className="avatar" style={{ background: effective, width: 48, height: 48, fontSize: 17 }}>{initials(name || '?')}</span>
        <div className="color-swatches">
          {AVATAR_COLORS.map((c) => (
            <button key={c} type="button" className={`color-swatch ${effective === c ? 'active' : ''}`}
              style={{ background: c }} onClick={() => setColor(c)} aria-label={`Colour ${c}`} />
          ))}
        </div>
      </div>
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

// ── Meeting note editor (full-screen overlay) ──────────────────────────────────
function MeetingNoteModal({ note, personName, personId, onClose }: {
  note: Note; personName: string; personId: string; onClose: () => void;
}) {
  const { data, insert, update, remove, logActivity } = useCadence();
  const [title, setTitle] = useState(note.title);
  const [extracting, setExtracting] = useState(false);
  const [tasks, setTasks] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const saveBody = (html: string) => update('notes', note.id, { body: html } as Partial<Note>);
  const saveTitle = () => update('notes', note.id, { title: title.trim() || note.title } as Partial<Note>);

  const deleteNote = async () => {
    if (!confirm('Delete this meeting note?')) return;
    await remove('notes', note.id);
    onClose();
  };

  const startExtract = () => {
    const items = extractListItems(note.body);
    if (!items.length) { alert('No list items found. Use bullet or numbered lists to capture action items.'); return; }
    setTasks(items);
    setSelected(new Set(items.map((_, i) => i)));
    setExtracting(true);
  };

  const createTasks = async () => {
    const toCreate = tasks.filter((_, i) => selected.has(i));
    for (const t of toCreate) {
      await insert('work_items', {
        title: t, type: 'task', priority: 'medium',
        person_id: personId, notes: `From meeting: ${title}`,
        inboxed: false, source: 'you',
      } as Partial<WorkItem>);
    }
    logActivity('extract_tasks', `${toCreate.length} tasks from ${title}`);
    setExtracting(false);
  };

  return (
    <div className="mtg-overlay">
      <div className="mtg-modal">
        <div className="mtg-header">
          <div className="mtg-header-left">
            <span className="mtg-person-chip">{personName}</span>
            <input
              className="mtg-title-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={saveTitle}
            />
            <span className="mtg-date">{fmtDate(note.created_at)}</span>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className="btn btn-secondary btn-sm" onClick={startExtract}>→ Extract Tasks</button>
            <button className="btn btn-danger btn-sm" onClick={deleteNote}>Delete</button>
            <button className="btn btn-secondary btn-sm" onClick={onClose}>✕ Close</button>
          </div>
        </div>

        {extracting ? (
          <div className="mtg-extract">
            <h3>Select action items to create as tasks</h3>
            <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 12 }}>
              {tasks.length} list item{tasks.length !== 1 ? 's' : ''} found in this note
            </p>
            <div className="mtg-task-list">
              {tasks.map((t, i) => (
                <label key={i} className="mtg-task-check">
                  <input type="checkbox" checked={selected.has(i)}
                    onChange={() => setSelected((s) => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n; })} />
                  <span>{t}</span>
                </label>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setExtracting(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={createTasks} disabled={selected.size === 0}>
                Create {selected.size} Task{selected.size !== 1 ? 's' : ''}
              </button>
            </div>
          </div>
        ) : (
          <div className="mtg-body">
            <RichEditor
              key={note.id}
              content={note.body || ''}
              onBlur={saveBody}
              placeholder="Meeting notes… Use bullet lists for action items, then hit '→ Extract Tasks' to create them."
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Meeting notes list ─────────────────────────────────────────────────────────
function MeetingNotes({ person }: { person: Person }) {
  const { data, insert } = useCadence();
  const [open, setOpen] = useState<Note | null>(null);

  const folder = mtgFolder(person.id);
  const meetings = useMemo(() =>
    data.notes.filter((n) => n.folder === folder)
      .sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [data.notes, folder]
  );

  const newMeeting = async () => {
    const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    const title = `1:1 · ${person.name} · ${today}`;
    let n: Note;
    try { n = await insert('notes', { title, body: '', folder } as Partial<Note>); }
    catch (e: any) {
      if (/folder/i.test(String(e?.message || e))) n = await insert('notes', { title, body: '' } as Partial<Note>);
      else throw e;
    }
    setOpen(n);
  };

  // Keep modal in sync if note body changes (realtime)
  const liveNote = open ? data.notes.find((n) => n.id === open.id) || open : null;

  return (
    <div className="detail-section">
      <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        📝 Meeting Notes
        {meetings.length > 0 && <span className="section-count" style={{ background: 'var(--accent)' }}>{meetings.length}</span>}
        <button className="btn btn-primary btn-sm" style={{ marginLeft: 'auto' }} onClick={newMeeting}>+ New 1:1</button>
      </h3>
      {meetings.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--text3)', padding: '8px 0' }}>
          No meeting notes yet. Hit "+ New 1:1" to start capturing.
        </p>
      ) : (
        <div className="mtg-list">
          {meetings.map((n) => (
            <button key={n.id} className="mtg-card" onClick={() => setOpen(n)}>
              <div className="mtg-card-date">{fmtShort(n.created_at)}</div>
              <div className="mtg-card-title">{n.title}</div>
              <div className="mtg-card-preview">{stripHtml(n.body).slice(0, 100) || 'Empty note'}</div>
            </button>
          ))}
        </div>
      )}
      {liveNote && (
        <MeetingNoteModal
          note={liveNote}
          personName={person.name}
          personId={person.id}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}

// ── Single topic (work_item) card ──────────────────────────────────────────────
function TopicCard({ w, onEdit }: { w: WorkItem; onEdit: (w: WorkItem) => void }) {
  const { data, update } = useCadence();
  const proj = data.projects.find((p) => p.id === w.project_id);
  const toggle = () => update('work_items', w.id, { done: !w.done, completed_at: !w.done ? new Date().toISOString() : null } as Partial<WorkItem>);
  return (
    <div className="topic-card">
      <input type="checkbox" checked={w.done} onChange={toggle} />
      <div className="topic-body" onClick={() => onEdit(w)}>
        <div className={`topic-title ${w.done ? 'done' : ''}`}>{w.title}</div>
        <div className="topic-tags">
          <TypeTag type={w.type} /><PriTag priority={w.priority} />
          {proj && <span className="tag tag-info">{proj.name}</span>}
          <Due date={w.due_date} />
        </div>
        {w.notes && <div className="topic-notes">{w.notes.slice(0, 140)}{w.notes.length > 140 ? '…' : ''}</div>}
      </div>
      <button className="btn-icon" onClick={() => onEdit(w)}>✎</button>
    </div>
  );
}

// ── Inline editable background notes ──────────────────────────────────────────
function InlineNotes({ person }: { person: Person }) {
  const { update } = useCadence();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(person.notes);
  const save = () => { update('people', person.id, { notes: draft } as Partial<Person>); setEditing(false); };

  if (editing) return (
    <div className="detail-section">
      <h3>Notes</h3>
      <textarea autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={save}
        style={{ width: '100%', minHeight: 80 }}
        onKeyDown={(e) => { if (e.key === 'Escape') { setDraft(person.notes); setEditing(false); } }} />
      <div style={{ display: 'flex', gap: 6, marginTop: 6, justifyContent: 'flex-end' }}>
        <button className="btn btn-secondary btn-sm" onClick={() => { setDraft(person.notes); setEditing(false); }}>Cancel</button>
        <button className="btn btn-primary btn-sm" onClick={save}>Save</button>
      </div>
    </div>
  );

  if (!person.notes) return (
    <button className="btn btn-ghost btn-sm" style={{ color: 'var(--text3)', padding: '2px 0', marginBottom: 8 }}
      onClick={() => { setDraft(''); setEditing(true); }}>+ Add background notes</button>
  );

  return (
    <div className="detail-section" style={{ cursor: 'text' }} onClick={() => { setDraft(person.notes); setEditing(true); }}>
      <h3 style={{ display: 'flex', justifyContent: 'space-between' }}>Background Notes
        <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text3)', textTransform: 'none', letterSpacing: 0 }}>Click to edit</span>
      </h3>
      <p style={{ fontSize: 14, lineHeight: 1.6 }}>{person.notes}</p>
    </div>
  );
}

// ── Recently completed log ─────────────────────────────────────────────────────
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
          Last 14 days {open ? '▴' : '▾'}</span>
      </h3>
      {open && items.map((w) => (
        <div key={w.id} className="work-item-row" style={{ opacity: 0.65 }}>
          <span style={{ color: 'var(--green)', fontSize: 13 }}>✓</span>
          <span className="wi-title done" style={{ flex: 1 }}>{w.title}</span>
          <span style={{ fontSize: 11, color: 'var(--text3)' }}>{fmt(w.completed_at)}</span>
        </div>
      ))}
    </div>
  );
}

// ── Person detail panel ────────────────────────────────────────────────────────
function Detail({ person, onEditPerson }: { person: Person; onEditPerson: () => void }) {
  const { data, insert, logActivity } = useCadence();
  const [tab, setTab] = useState<'topics' | 'meetings'>('topics');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<WorkItem | null>(null);
  const [draft, setDraft] = useState('');

  const mine = data.work_items.filter((w) => w.person_id === person.id);
  const open = mine.filter((w) => !w.done).sort((a, b) => priorityScore(b) - priorityScore(a));
  const recentDone = mine.filter((w) => w.done && w.completed_at && w.completed_at > daysAgo(14))
    .sort((a, b) => (b.completed_at || '').localeCompare(a.completed_at || ''));

  const meetingCount = data.notes.filter((n) => n.folder === mtgFolder(person.id)).length;

  const quickAdd = async () => {
    const title = draft.trim();
    if (!title) return;
    setDraft('');
    await insert('work_items', {
      title, type: 'followUp', priority: 'medium', person_id: person.id,
      notes: '', inboxed: false, source: 'you',
    } as Partial<WorkItem>);
    logActivity('add_item', title);
  };

  return (
    <div className="split-right">
      <div className="split-panel-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <span className="avatar" style={{ background: colorOf(person) }}>{initials(person.name)}</span>
          <div style={{ minWidth: 0 }}>
            <h3 style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{person.name}</h3>
            {person.role && <div style={{ fontSize: 12, color: 'var(--text2)' }}>{person.role}</div>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <button className="btn btn-secondary btn-sm" onClick={onEditPerson}>Edit</button>
        </div>
      </div>

      {/* Tabs */}
      <div className="people-tabs">
        <button className={`people-tab ${tab === 'topics' ? 'active' : ''}`} onClick={() => setTab('topics')}>
          Topics {open.length > 0 && <span className="ptab-badge">{open.length}</span>}
        </button>
        <button className={`people-tab ${tab === 'meetings' ? 'active' : ''}`} onClick={() => setTab('meetings')}>
          Meetings {meetingCount > 0 && <span className="ptab-badge">{meetingCount}</span>}
        </button>
      </div>

      <div className="split-panel-body">
        {tab === 'topics' && (
          <>
            {person.email && <p className="card-meta" style={{ marginBottom: 10 }}>✉ {person.email}</p>}
            <InlineNotes person={person} />
            <div className="detail-section">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>📋 Topics
                {open.length > 0 && <span className="section-count" style={{ background: 'var(--accent)' }}>{open.length}</span>}
                <button className="btn btn-primary btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setAdding(true)}>+ Add</button>
              </h3>
              {open.map((w) => <TopicCard key={w.id} w={w} onEdit={setEditing} />)}
              <div className="topic-add">
                <span style={{ color: 'var(--text3)', fontSize: 16 }}>+</span>
                <input value={draft} placeholder="Quick add — press Enter"
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') quickAdd(); }} />
              </div>
            </div>
            <RecentlyDone items={recentDone} />
          </>
        )}
        {tab === 'meetings' && <MeetingNotes person={person} />}
      </div>

      {adding && <ItemModal defaults={{ person_id: person.id, type: 'followUp', inboxed: false } as Partial<WorkItem>} onClose={() => setAdding(false)} />}
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
          <div className="split-panel-header">
            <h3>{sorted.length} {sorted.length === 1 ? 'person' : 'people'}</h3>
            <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>+ Add</button>
          </div>
          <div className="split-panel-body">
            {sorted.length ? sorted.map((p) => {
              const openCount = data.work_items.filter((w) => w.person_id === p.id && !w.done).length;
              const mtgCount = data.notes.filter((n) => n.folder === mtgFolder(p.id)).length;
              return (
                <button className={`person-item ${selected === p.id ? 'selected' : ''}`} key={p.id} onClick={() => setSelected(p.id)}>
                  <span className="avatar" style={{ background: colorOf(p) }}>{initials(p.name)}</span>
                  <div className="project-info">
                    <div className="project-name">{p.name}</div>
                    <div className="project-meta">
                      {p.role ? p.role + ' · ' : ''}{openCount} {openCount === 1 ? 'topic' : 'topics'}
                      {mtgCount > 0 ? ` · ${mtgCount} meetings` : ''}
                    </div>
                  </div>
                </button>
              );
            }) : (
              <div className="empty-state">
                <div className="icon">✦</div>
                <p>No people yet</p>
                <small>Track topics, follow-ups and meeting notes by person</small>
              </div>
            )}
          </div>
        </div>
        {person
          ? <Detail key={person.id} person={person} onEditPerson={() => setEditing(person)} />
          : <div className="split-right"><div className="empty-state" style={{ margin: 'auto' }}><div className="icon">✦</div><p>Select a person</p></div></div>
        }
      </div>
      {creating && <PersonModal onClose={() => setCreating(false)} />}
      {editing && <PersonModal existing={editing} onClose={() => setEditing(null)} />}
    </>
  );
}
