import { useEffect, useMemo, useRef, useState } from 'react';
import { useCadence } from '../lib/store';
import type { Note, Person, WorkItem } from '../lib/types';
import { ScreenHeader, Modal } from '../components/bits';
import { MeetingNoteModal, parseMeeting } from '../components/MeetingNoteModal';
import { serializeMeeting } from '../lib/meetingData';
import type { ActionItem } from '../components/MeetingNoteModal';
import { autoColor, AVATAR_COLORS, initials, fmtDM, fmtDMY, todayStr } from '../lib/util';
import { useMeetingDates, getNextMeeting } from '../lib/meetings';
import { buildTaskFromAction } from '../lib/tasks';
import type { PushTarget } from '../lib/tasks';

const colorOf = (p: Person) => p.color || autoColor(p.id || p.name);
const mtgFolder = (personId: string) => `__mtg__${personId}`;

// ── Meeting Group create/edit modal ───────────────────────────────────────────
function MeetingGroupModal({ existing, onClose, onDelete }: { existing?: Person; onClose: () => void; onDelete?: () => void }) {
  const { data, insert, update, remove, logActivity } = useCadence();
  const { setMeetingDate } = useMeetingDates();
  const [name, setName] = useState(existing?.name || '');
  const [description, setDescription] = useState(existing?.notes || '');
  const [color, setColor] = useState(existing?.color || '');
  const [busy, setBusy] = useState(false);

  const effective = color || autoColor(name || existing?.name || 'meeting');

  const save = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const patch = { name: name.trim(), role: '', email: '', notes: description, color: effective, type: 'meeting_group' as const };
      if (existing) await update('people', existing.id, patch as Partial<Person>);
      else await insert('people', patch as Partial<Person>);
      logActivity(existing ? 'edit_meeting_group' : 'add_meeting_group', name.trim());
      onClose();
    } finally { setBusy(false); }
  };

  const del = async () => {
    if (!existing) return;
    if (!confirm(`Delete "${existing.name}"? This cannot be undone.`)) return;
    // Remove this group's meeting notes and their date entries so nothing lingers.
    const folder = mtgFolder(existing.id);
    const mtgNotes = data.notes.filter((n) => n.folder === folder);
    for (const n of mtgNotes) {
      try { await setMeetingDate(n.id, null); } catch { /* best-effort */ }
      await remove('notes', n.id);
    }
    await remove('people', existing.id);
    logActivity('delete_meeting_group', existing.name);
    onDelete?.();
  };

  return (
    <Modal title={existing ? 'Edit Meeting Group' : 'Add Meeting Group'} onClose={onClose}
      footer={<>
        {existing && <button className="btn btn-danger btn-sm" style={{ marginRight: 'auto' }} onClick={del}>Delete</button>}
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
      </>}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
        <span className="avatar" style={{ background: effective, width: 48, height: 48, fontSize: 17 }}>{initials(name || '?')}</span>
        <div className="color-swatches">
          {AVATAR_COLORS.map((c) => (
            <button key={c} type="button" className={`color-swatch ${effective === c ? 'active' : ''}`}
              style={{ background: c }} onClick={() => setColor(c)} aria-label={`Colour ${c}`} />
          ))}
        </div>
      </div>
      <div className="form-group"><label>Name</label>
        <input type="text" autoFocus value={name} placeholder="e.g. Engineering Standup" onChange={(e) => setName(e.target.value)} /></div>
      <div className="form-group"><label>Description <span style={{ color: 'var(--text3)', fontWeight: 400 }}>(optional)</span></label>
        <textarea value={description} placeholder="What this meeting covers…" onChange={(e) => setDescription(e.target.value)} /></div>
    </Modal>
  );
}

// ── Group action row (open action with send picker) ───────────────────────────
function GroupActionRow({ action, noteTitle, people, projects, onSend, onMarkDone }: {
  action: ActionItem;
  noteTitle: string;
  people: Person[];
  projects: import('../lib/types').Project[];
  onSend: (targets: PushTarget[]) => Promise<void> | void;
  onMarkDone: () => void;
}) {
  const [showSend, setShowSend] = useState(false);
  const [selectedTargets, setSelectedTargets] = useState<PushTarget[]>([]);
  const [sending, setSending] = useState(false);
  const [sendErr, setSendErr] = useState('');
  const [done, setDone] = useState(false);
  const isLate = !!action.due && !done && action.due < todayStr();
  const ownerPerson = action.owner_person_id ? people.find((p) => p.id === action.owner_person_id) ?? null : null;
  const ownerLabel = action.owner === 'me' ? 'Me' : (ownerPerson?.name || action.owner_label || 'Them');

  const toggleTarget = (t: PushTarget) =>
    setSelectedTargets(prev =>
      prev.some(x => x.id === t.id) ? prev.filter(x => x.id !== t.id) : [...prev, t]
    );
  const openSendPicker = (preselect?: PushTarget) => {
    setSelectedTargets(preselect ? [preselect] : []);
    setShowSend(true);
  };
  const confirmSend = async () => {
    if (selectedTargets.length === 0 || sending) return;
    setSending(true);
    setSendErr('');
    try {
      // Await so an insert failure keeps the picker open with an error, instead
      // of silently closing and clearing the selection as if the send worked.
      await onSend(selectedTargets);
      setShowSend(false);
      setSelectedTargets([]);
    } catch {
      setSendErr('Could not send — check your connection and try again.');
    } finally {
      setSending(false);
    }
  };

  const handleDone = () => {
    setDone(true);
    onMarkDone();
  };

  return (
    <div className={`group-action-row${done ? ' done' : ''}`}>
      <input type="checkbox" className="action-check" checked={done} onChange={handleDone}
        style={{ flexShrink: 0, marginTop: 2 }} />
      <div className="group-action-main" style={{ position: 'relative' }}>
        <div className="group-action-title">{action.title}</div>
        <div className="group-action-meta">
          <span className={`owner-chip ${action.owner === 'me' ? 'owner-me' : 'owner-them'}`}>{ownerLabel}</span>
          <span className="group-action-note">{noteTitle}</span>
          {action.due && (
            <span className={isLate ? 'due-late-label' : 'due-normal-label'}>
              {isLate ? 'Overdue · ' : ''}{fmtDM(action.due)}
            </span>
          )}
          {action.pushed_to ? (
            <span className="pushed-label">→ {action.pushed_to}</span>
          ) : (
            <div style={{ position: 'relative' }}>
              <button className="action-send-btn"
                onClick={() => openSendPicker(ownerPerson ? { id: ownerPerson.id, type: 'person', name: ownerPerson.name } : undefined)}>
                {ownerPerson ? `→ ${ownerPerson.name.split(' ')[0]}` : '→ Send'}
              </button>
              {showSend && (
                <>
                  <div style={{ position: 'fixed', inset: 0, zIndex: 49 }} onClick={() => { setShowSend(false); setSelectedTargets([]); setSendErr(''); }} />
                  <div className="action-send-picker">
                    {people.length > 0 && (
                      <>
                        <div className="send-picker-section">People</div>
                        {people.map((p) => {
                          const sel = selectedTargets.some(t => t.id === p.id);
                          return (
                            <button key={p.id} className={`send-picker-option${sel ? ' selected' : ''}`}
                              onClick={() => toggleTarget({ id: p.id, type: 'person', name: p.name })}>
                              <span className="avatar" style={{ background: colorOf(p), width: 22, height: 22, fontSize: 9, flexShrink: 0 }}>
                                {initials(p.name)}
                              </span>
                              {p.name}
                              {sel && <span className="send-picker-check">✓</span>}
                            </button>
                          );
                        })}
                      </>
                    )}
                    {projects.length > 0 && (
                      <>
                        <div className="send-picker-section">Projects</div>
                        {projects.map((p) => {
                          const sel = selectedTargets.some(t => t.id === p.id);
                          return (
                            <button key={p.id} className={`send-picker-option${sel ? ' selected' : ''}`}
                              onClick={() => toggleTarget({ id: p.id, type: 'project', name: p.name })}>
                              <span style={{ color: p.color || 'var(--accent)', fontSize: 12 }}>▤</span>
                              {p.name}
                              {sel && <span className="send-picker-check">✓</span>}
                            </button>
                          );
                        })}
                      </>
                    )}
                    {sendErr && (
                      <div className="send-picker-error" style={{ padding: '6px 12px', fontSize: 12, color: 'var(--red)' }}>{sendErr}</div>
                    )}
                    {selectedTargets.length > 0 && (
                      <div className="send-picker-footer">
                        <button className="send-picker-confirm" onClick={confirmSend} disabled={sending}>
                          {sending ? 'Sending…' : `Send to ${selectedTargets.map(t => t.name.split(' ')[0]).join(' + ')}`}
                        </button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Group open actions aggregator ─────────────────────────────────────────────
function GroupOpenActions({ group }: { group: Person }) {
  const { data, update, insert } = useCadence();
  const folder = mtgFolder(group.id);

  const meetings = useMemo(() =>
    data.notes.filter((n) => n.folder === folder),
    [data.notes, folder]
  );

  type OpenAction = ActionItem & { noteId: string; noteTitle: string };

  const allOpenActions = useMemo((): OpenAction[] => {
    const result: OpenAction[] = [];
    for (const note of meetings) {
      const { data: parsed } = parseMeeting(note.body);
      for (const action of parsed.actions) {
        if (!action.done && !action.pushed) {
          result.push({ ...action, noteId: note.id, noteTitle: note.title });
        }
      }
    }
    return result;
  }, [meetings]);

  const people = useMemo(() => data.people.filter((p) => !p.type || p.type === 'person'), [data.people]);
  const projects = useMemo(() => data.projects.filter((p) => !p.deleted_at), [data.projects]);

  // Guard against double-taps firing duplicate work_items / writes.
  const busy = useRef<Set<string>>(new Set());

  const handleMarkDone = async (action: OpenAction) => {
    const note = data.notes.find((n) => n.id === action.noteId);
    if (!note) return;
    const { data: parsed, raw } = parseMeeting(note.body);
    const updatedActions = parsed.actions.map((a) =>
      a.id === action.id ? { ...a, done: true } : a
    );
    await update('notes', action.noteId, {
      body: serializeMeeting({ ...parsed, actions: updatedActions }, raw),
    } as Partial<Note>);
  };

  const handleSend = async (action: OpenAction, targets: PushTarget[]) => {
    if (busy.current.has(action.id)) return;
    busy.current.add(action.id);
    try {
      for (const t of targets) {
        await insert('work_items', buildTaskFromAction(action, action.noteTitle, t) as Partial<WorkItem>);
      }
      const names = targets.map(t => t.name).join(', ');
      const note = data.notes.find((n) => n.id === action.noteId);
      if (note) {
        const { data: parsed, raw } = parseMeeting(note.body);
        const updatedActions = parsed.actions.map((a) =>
          a.id === action.id ? { ...a, pushed: true, pushed_to: names } : a
        );
        await update('notes', action.noteId, {
          body: serializeMeeting({ ...parsed, actions: updatedActions }, raw),
        } as Partial<Note>);
      }
    } finally {
      busy.current.delete(action.id);
    }
  };

  if (allOpenActions.length === 0) {
    return (
      <div className="empty-state" style={{ margin: '40px auto' }}>
        <div className="icon">✓</div>
        <p>No open actions</p>
        <small>Actions from meeting notes appear here until sent</small>
      </div>
    );
  }

  return (
    <div style={{ padding: '0 16px 16px' }}>
      {allOpenActions.map((action) => (
        <GroupActionRow
          key={`${action.noteId}-${action.id}`}
          action={action}
          noteTitle={action.noteTitle}
          people={people}
          projects={projects}
          onSend={(targets) => handleSend(action, targets)}
          onMarkDone={() => handleMarkDone(action)}
        />
      ))}
    </div>
  );
}

// ── Group meeting notes list ──────────────────────────────────────────────────
function GroupMeetingNotes({ group }: { group: Person }) {
  const { data, insert } = useCadence();
  const { dates, setMeetingDate } = useMeetingDates();
  const [openId, setOpenId] = useState<string | null>(null);

  const folder = mtgFolder(group.id);
  const today = todayStr();
  const dateKey = (n: Note) => (dates[n.id] || n.created_at).slice(0, 10);

  // Upcoming meetings (date ≥ today) sorted ascending — nearest first.
  // Past meetings sorted descending — most recent first below upcoming.
  const meetings = useMemo(() =>
    data.notes.filter((n) => n.folder === folder)
      .sort((a, b) => {
        const da = dateKey(a), db = dateKey(b);
        const af = da >= today, bf = db >= today;
        if (af && !bf) return -1;
        if (!af && bf) return 1;
        if (af && bf) return da.localeCompare(db);
        return db.localeCompare(da);
      }),
    [data.notes, folder, dates] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Auto-open the nearest upcoming meeting when a group is first selected.
  useEffect(() => {
    if (openId) return;
    const upcoming = meetings.find((n) => dateKey(n) >= today);
    if (upcoming) setOpenId(upcoming.id);
  }, [group.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const nextId = meetings.find((n) => dateKey(n) >= today)?.id;

  const newMeeting = async () => {
    const todayDate = todayStr();
    const todayLabel = fmtDMY(todayDate);
    const title = `${group.name} · ${todayLabel}`;
    let n: Note;
    try { n = await insert('notes', { title, body: '', folder } as Partial<Note>); }
    catch (e: any) {
      // Without a folder the note can't be associated with this group and would
      // become an invisible orphan — fail loudly instead of stranding data.
      if (/folder/i.test(String(e?.message || e))) {
        alert('Could not create the meeting note — the database is missing the "folder" column. Please run the latest migration.');
        return;
      }
      throw e;
    }
    try { await setMeetingDate(n.id, todayDate); } catch { /* non-critical */ }
    setOpenId(n.id);
  };

  const openNote = openId ? data.notes.find((n) => n.id === openId) || null : null;

  const stripHtml = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

  return (
    <div className="detail-section">
      <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        📝 Meeting Notes
        {meetings.length > 0 && <span className="section-count" style={{ background: 'var(--accent)' }}>{meetings.length}</span>}
        <button className="btn btn-primary btn-sm" style={{ marginLeft: 'auto' }} onClick={newMeeting}>+ New Meeting</button>
      </h3>
      {meetings.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--text3)', padding: '8px 0' }}>
          No meeting notes yet. Hit "+ New Meeting" to start capturing.
        </p>
      ) : (
        <div className="mtg-list">
          {meetings.map((n) => {
            const preview = n.body.startsWith('{')
              ? (() => { try { const p = JSON.parse(n.body); return (p.agenda?.[0]?.title || '') + (p.notes ? ' · ' + stripHtml(p.notes) : ''); } catch { return ''; } })()
              : stripHtml(n.body);
            const isNext = n.id === nextId;
            return (
              <button key={n.id} className={`mtg-card${isNext ? ' mtg-card-next' : ''}`} onClick={() => setOpenId(n.id)}>
                <div className="mtg-card-date">
                  {fmtDM(dates[n.id] || n.created_at)}
                  {isNext && <span className="mtg-next-badge">NEXT</span>}
                </div>
                <div className="mtg-card-title">{n.title}</div>
                <div className="mtg-card-preview">{preview.slice(0, 100) || 'Empty note'}</div>
              </button>
            );
          })}
        </div>
      )}
      {openNote && (
        <MeetingNoteModal
          note={openNote}
          person={group}
          allMeetings={meetings}
          onClose={() => setOpenId(null)}
          onNavigate={setOpenId}
        />
      )}
    </div>
  );
}

// ── Group detail panel ────────────────────────────────────────────────────────
function GroupDetail({ group, onEdit }: { group: Person; onEdit: () => void }) {
  const { data } = useCadence();
  const { dates } = useMeetingDates();
  const [tab, setTab] = useState<'meetings' | 'actions'>('meetings');

  const folder = mtgFolder(group.id);
  const meetings = useMemo(() =>
    data.notes.filter((n) => n.folder === folder),
    [data.notes, folder]
  );

  const openActionCount = useMemo(() => {
    let count = 0;
    for (const note of meetings) {
      const { data: parsed } = parseMeeting(note.body);
      count += parsed.actions.filter((a) => !a.done && !a.pushed).length;
    }
    return count;
  }, [meetings]);

  const nextMeeting = getNextMeeting(group.id, data.notes, dates);

  return (
    <div className="split-right">
      <div className="split-panel-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <span className="avatar" style={{ background: colorOf(group) }}>{initials(group.name)}</span>
          <div style={{ minWidth: 0 }}>
            <h3 style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{group.name}</h3>
            {nextMeeting && (
              <div style={{ fontSize: 12, marginTop: 2 }}>
                <span style={{
                  background: nextMeeting === todayStr() ? 'var(--green-bg)' : 'var(--blue-bg)',
                  color: nextMeeting === todayStr() ? 'var(--green)' : 'var(--accent)',
                  padding: '1px 7px', borderRadius: 10, fontWeight: 600, fontSize: 11
                }}>📅 {nextMeeting === todayStr() ? 'Today' : fmtDM(nextMeeting)}</span>
              </div>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <button className="btn btn-secondary btn-sm" onClick={onEdit}>Edit</button>
        </div>
      </div>

      {group.notes && (
        <div style={{ padding: '0 16px 8px', fontSize: 13, color: 'var(--text2)', lineHeight: 1.5 }}>
          {group.notes}
        </div>
      )}

      {/* Tabs */}
      <div className="people-tabs">
        <button className={`people-tab ${tab === 'meetings' ? 'active' : ''}`} onClick={() => setTab('meetings')}>
          Meetings {meetings.length > 0 && <span className="ptab-badge">{meetings.length}</span>}
        </button>
        <button className={`people-tab ${tab === 'actions' ? 'active' : ''}`} onClick={() => setTab('actions')}>
          Open Actions {openActionCount > 0 && <span className="ptab-badge">{openActionCount}</span>}
        </button>
      </div>

      <div className="split-panel-body">
        {tab === 'meetings' && <GroupMeetingNotes group={group} />}
        {tab === 'actions' && <GroupOpenActions group={group} />}
      </div>
    </div>
  );
}

// ── Main Meetings screen ──────────────────────────────────────────────────────
export function Meetings({ onMenu }: { onMenu?: () => void }) {
  const { data } = useCadence();
  const { dates } = useMeetingDates();
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Person | null>(null);

  const groups = useMemo(() =>
    data.people
      .filter((p) => p.type === 'meeting_group')
      .sort((a, b) => a.name.localeCompare(b.name)),
    [data.people]
  );

  const group = data.people.find((p) => p.id === selected) || null;

  return (
    <>
      <ScreenHeader title="Meetings" onMenu={onMenu} />
      <div className="split-view">
        <div className="split-left">
          <div className="split-panel-header">
            <h3>{groups.length} {groups.length === 1 ? 'meeting' : 'meetings'}</h3>
            <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>+ Add</button>
          </div>
          <div className="split-panel-body">
            {groups.length ? (
              groups.map((g) => {
                const folder = mtgFolder(g.id);
                const mtgCount = data.notes.filter((n) => n.folder === folder).length;
                const nextMtg = getNextMeeting(g.id, data.notes, dates);
                return (
                  <button key={g.id} className={`person-item${selected === g.id ? ' selected' : ''}`}
                    onClick={() => setSelected(g.id)}>
                    <span className="avatar" style={{ background: colorOf(g) }}>{initials(g.name)}</span>
                    <div className="project-info">
                      <div className="project-name">{g.name}</div>
                      <div className="project-meta">
                        {mtgCount} {mtgCount === 1 ? 'meeting' : 'meetings'}
                        {nextMtg ? ` · 📅 ${nextMtg === todayStr() ? 'Today' : fmtDM(nextMtg)}` : ''}
                        {g.notes ? ` · ${g.notes.slice(0, 40)}${g.notes.length > 40 ? '…' : ''}` : ''}
                      </div>
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="empty-state">
                <div className="icon">🗓</div>
                <p>No meetings yet</p>
                <small>Track recurring group meetings, standups, and team syncs</small>
              </div>
            )}
          </div>
        </div>
        {group
          ? <GroupDetail key={group.id} group={group} onEdit={() => setEditing(group)} />
          : <div className="split-right"><div className="empty-state" style={{ margin: 'auto' }}><div className="icon">🗓</div><p>Select a meeting</p></div></div>
        }
      </div>
      {creating && <MeetingGroupModal onClose={() => setCreating(false)} />}
      {editing && <MeetingGroupModal existing={editing} onClose={() => setEditing(null)} onDelete={() => { setEditing(null); setSelected(null); }} />}
    </>
  );
}
