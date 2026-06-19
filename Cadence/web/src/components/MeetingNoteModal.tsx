import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { todayStr, fmtDM, fmtWeekDMY, fmtDMY } from '../lib/util';
import { useCadence } from '../lib/store';
import type { Note, Person, WorkItem } from '../lib/types';
import type { Project } from '../lib/types';
import { RichEditor } from './RichEditor';
import { SharePanel } from './SharePanel';
import { useMeetingDates } from '../lib/meetings';
import { parseMeeting, uid } from '../lib/meetingData';
import type { AgendaItem, ActionItem, MeetingData } from '../lib/meetingData';
import { buildTaskFromAction } from '../lib/tasks';
import type { PushTarget } from '../lib/tasks';

// Data model + parser now live in lib/meetingData (React-free). Re-export here
// so existing import sites (Meetings.tsx, SharePanel.tsx) keep working.
export { parseMeeting } from '../lib/meetingData';
export type { AgendaItem, ActionItem, MeetingData } from '../lib/meetingData';


// ── Agenda item row ───────────────────────────────────────────────────────────
function AgendaItemRow({ item, onChange, onDelete }: {
  item: AgendaItem;
  onChange: (updated: AgendaItem) => void;
  onDelete: () => void;
}) {
  const [editingNotes, setEditingNotes] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const set = (patch: Partial<AgendaItem>) => onChange({ ...item, ...patch });

  const autoGrow = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };
  useEffect(() => autoGrow(taRef.current), [item.notes]);

  const statusClass = item.status === 'covered' ? ' covered' : item.status === 'deferred' ? ' deferred' : '';

  return (
    <div className={`agenda-item${statusClass}`}>
      <span className="agenda-handle" title="Drag to reorder">⠿</span>
      <div className="agenda-main">
        <div className="agenda-topic">
          <input
            className="agenda-topic-input"
            value={item.title}
            placeholder="Agenda item…"
            onChange={(e) => set({ title: e.target.value })}
          />
          <button className="agenda-delete" onClick={onDelete} title="Remove">✕</button>
        </div>
        {(editingNotes || item.notes) ? (
          <textarea
            ref={taRef}
            className="agenda-notes-input"
            value={item.notes}
            placeholder="Notes on this topic…"
            onChange={(e) => { set({ notes: e.target.value }); autoGrow(e.target); }}
            onInput={(e) => autoGrow(e.currentTarget)}
            onBlur={() => { if (!item.notes) setEditingNotes(false); }}
          />
        ) : (
          <button className="agenda-notes-add" onClick={() => setEditingNotes(true)}>+ Add notes</button>
        )}
        <div className="agenda-status-btns">
          {(['discuss', 'covered', 'deferred'] as const).map((s) => (
            <button key={s} className={`stn-btn${item.status === s ? ` active-${s}` : ''}`}
              onClick={() => set({ status: item.status === s ? 'discuss' : s })}>
              {s === 'discuss' ? '💬 Discuss' : s === 'covered' ? '✅ Covered' : '⏭ Defer'}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Action item row ───────────────────────────────────────────────────────────
function ActionItemRow({ item, personName, onChange, onDelete, isGroupMeeting, people, projects, onSend }: {
  item: ActionItem; personName: string;
  onChange: (updated: ActionItem) => void;
  onDelete: () => void;
  isGroupMeeting?: boolean;
  people?: Person[];
  projects?: Project[];
  onSend?: (targetId: string, targetType: 'person' | 'project', targetName: string) => void;
}) {
  const set = (patch: Partial<ActionItem>) => onChange({ ...item, ...patch });
  const isLate = !!item.due && !item.done && item.due < todayStr();
  const [showSend, setShowSend] = useState(false);
  const [showOwnerPicker, setShowOwnerPicker] = useState(false);

  const ownerPerson = (isGroupMeeting && item.owner_person_id && people)
    ? people.find((p) => p.id === item.owner_person_id) ?? null
    : null;

  const selectOwner = (p: Person) => {
    set({ owner_label: p.name, owner_person_id: p.id });
    setShowOwnerPicker(false);
  };

  return (
    <div className={`action-item${item.done ? ' done' : ''}${isLate ? ' late' : ''}`}>
      <input type="checkbox" className="action-check" checked={item.done}
        onChange={(e) => set({ done: e.target.checked })} />
      <div className="action-main">
        <input className="action-title-input" value={item.title} placeholder="Action item…"
          onChange={(e) => set({ title: e.target.value })} />
        <div className="action-meta" style={{ position: 'relative' }}>
          {/* Owner chip — person picker for group meetings */}
          {isGroupMeeting && item.owner === 'them' ? (
            <>
              <button
                className={`owner-chip ${ownerPerson ? 'owner-them' : 'owner-neutral'}`}
                onClick={() => setShowOwnerPicker((s) => !s)}
                title="Select who owns this action">
                {ownerPerson ? ownerPerson.name.split(' ')[0] : 'Select person…'}
              </button>
              {showOwnerPicker && (
                <>
                  <div style={{ position: 'fixed', inset: 0, zIndex: 49 }} onClick={() => setShowOwnerPicker(false)} />
                  <div className="action-send-picker action-send-picker--left">
                    <div className="send-picker-section">Assign to</div>
                    {(people || []).filter((p) => !p.type || p.type === 'person').map((p) => (
                      <button key={p.id} className="send-picker-option" onClick={() => selectOwner(p)}>
                        <span className="avatar" style={{ background: p.color || '#3A7CA5', width: 22, height: 22, fontSize: 9, flexShrink: 0 }}>
                          {p.name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('')}
                        </span>
                        {p.name}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </>
          ) : (
            <button className={`owner-chip ${item.owner === 'me' ? 'owner-me' : 'owner-them'}`}
              onClick={() => set({ owner: item.owner === 'me' ? 'them' : 'me' })}
              title="Click to toggle owner">
              {item.owner === 'me' ? 'Me' : personName.split(' ')[0]}
            </button>
          )}

          <input className="due-input" type="date" value={item.due}
            onChange={(e) => set({ due: e.target.value })} title="Due date" />
          {isLate && <span className="due-late-label">Overdue</span>}

          {/* Send / pushed state */}
          {item.pushed_to ? (
            <span className="pushed-label">→ {item.pushed_to}</span>
          ) : item.pushed ? (
            <span className="pushed-label">→ In Tasks</span>
          ) : ownerPerson && onSend ? (
            // Direct send to the assigned person
            <button className="action-send-btn" title={`Send to ${ownerPerson.name}'s task list`}
              onClick={() => onSend(ownerPerson.id, 'person', ownerPerson.name)}>
              → {ownerPerson.name.split(' ')[0]}
            </button>
          ) : onSend ? (
            // Generic picker (for 1:1 meetings or unassigned group actions)
            <div style={{ position: 'relative' }}>
              <button className="action-send-btn" onClick={() => setShowSend((s) => !s)}>→ Send</button>
              {showSend && (
                <>
                  <div style={{ position: 'fixed', inset: 0, zIndex: 49 }} onClick={() => setShowSend(false)} />
                  <div className="action-send-picker">
                    {people && people.length > 0 && (
                      <>
                        <div className="send-picker-section">People</div>
                        {people.filter((p) => !p.type || p.type === 'person').map((p) => (
                          <button key={p.id} className="send-picker-option"
                            onClick={() => { onSend(p.id, 'person', p.name); setShowSend(false); }}>
                            <span className="avatar" style={{ background: p.color || '#3A7CA5', width: 22, height: 22, fontSize: 9, flexShrink: 0 }}>
                              {p.name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('')}
                            </span>
                            {p.name}
                          </button>
                        ))}
                      </>
                    )}
                    {projects && projects.length > 0 && (
                      <>
                        <div className="send-picker-section">Projects</div>
                        {projects.map((p) => (
                          <button key={p.id} className="send-picker-option"
                            onClick={() => { onSend(p.id, 'project', p.name); setShowSend(false); }}>
                            <span style={{ color: p.color || 'var(--accent)', fontSize: 12 }}>▤</span>
                            {p.name}
                          </button>
                        ))}
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          ) : null}

          <button className="action-delete" onClick={onDelete} title="Remove">✕</button>
        </div>
      </div>
    </div>
  );
}

// ── Deferred agenda carry-forward row ─────────────────────────────────────────
function DeferredAgendaRow({ item, onAdd }: { item: AgendaItem; onAdd: () => void }) {
  return (
    <div className="deferred-agenda-row">
      <div className="deferred-agenda-title">⏭ {item.title}</div>
      {item.notes && <div className="deferred-agenda-notes">{item.notes}</div>}
      <button className="btn btn-secondary btn-sm deferred-agenda-btn" onClick={onAdd}>
        + Add to this agenda
      </button>
    </div>
  );
}

// ── Carry-forward row ─────────────────────────────────────────────────────────
function CarryForwardRow({ item, personName, onMarkDone }: {
  item: ActionItem; personName: string; onMarkDone: (done: boolean) => void;
}) {
  const [checked, setChecked] = useState(false);
  const isLate = !!item.due && !checked && item.due < todayStr();

  const handleCheck = () => {
    const next = !checked;
    setChecked(next);
    onMarkDone(next);
  };

  return (
    <div className={`action-item carry-fwd${isLate ? ' late' : ''}${checked ? ' done' : ''}`}>
      <input type="checkbox" className="action-check" checked={checked} onChange={handleCheck} />
      <div className="action-main">
        <div className="action-title-static" style={{ textDecoration: checked ? 'line-through' : 'none' }}>
          {item.title}
        </div>
        <div className="action-meta">
          <span className={`owner-chip ${item.owner === 'me' ? 'owner-me' : 'owner-them'}`}>
            {item.owner === 'me' ? 'Me' : personName.split(' ')[0]}
          </span>
          {item.due && (
            <span className={isLate ? 'due-late-label' : 'due-normal-label'}>
              {isLate ? 'Overdue · ' : ''}{fmtDM(item.due)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────
interface Props {
  note: Note;
  person: Person;
  allMeetings: Note[];
  onClose: () => void;
  onNavigate: (noteId: string) => void;
}

export function MeetingNoteModal({ note, person, allMeetings, onClose, onNavigate }: Props) {
  const { data, update, insert, remove, logActivity } = useCadence();
  const { dates, setMeetingDate } = useMeetingDates();

  const isGroupMeeting = person.type === 'meeting_group';

  const { data: parsed, isLegacy } = useMemo(() => parseMeeting(note.body), [note.id, note.body]);
  const [agenda, setAgenda] = useState<AgendaItem[]>(parsed.agenda);
  const [actions, setActions] = useState<ActionItem[]>(parsed.actions);
  const [notes, setNotes] = useState<string>(parsed.notes);
  const [title, setTitle] = useState(note.title);
  const [showImport, setShowImport] = useState(false);
  const [importSel, setImportSel] = useState<Set<string>>(new Set());
  const [showShare, setShowShare] = useState(false);
  const [mobileTab, setMobileTab] = useState<'agenda' | 'actions' | 'notes'>('agenda');
  const [notesExpanded, setNotesExpanded] = useState(false);
  const [meetingDate, setLocalMeetingDate] = useState(
    dates[note.id] || ''
  );
  const [dateErr, setDateErr] = useState('');

  // Keep the input in sync if the stored date changes elsewhere.
  useEffect(() => { setLocalMeetingDate(dates[note.id] || ''); }, [dates, note.id]);

  const updateMeetingDate = async (date: string) => {
    setLocalMeetingDate(date);
    setDateErr('');

    // Auto-update the note title when it follows the expected pattern
    const prefix = isGroupMeeting ? `${person.name} · ` : `1:1 · ${person.name} · `;
    if (date && title.startsWith(prefix)) {
      const newTitle = `${prefix}${fmtDMY(date)}`;
      setTitle(newTitle);
      update('notes', note.id, { title: newTitle } as Partial<Note>);
    }

    try { await setMeetingDate(note.id, date || null); }
    catch { setDateErr('Could not save date — check connection'); }
  };

  // Refs always hold the latest state — used by the debounced save to avoid
  // stale-closure overwrites when two updates land within the debounce window.
  const agendaRef = useRef(agenda);
  const actionsRef = useRef(actions);
  const notesRef = useRef(notes);
  const noteIdRef = useRef(note.id);
  agendaRef.current = agenda;
  actionsRef.current = actions;
  notesRef.current = notes;
  noteIdRef.current = note.id;

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushSave = useCallback(() => {
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
    const body = JSON.stringify({
      agenda: agendaRef.current,
      actions: actionsRef.current,
      notes: notesRef.current,
    });
    update('notes', noteIdRef.current, { body } as Partial<Note>);
  }, [update]);

  const scheduleSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(flushSave, 600);
  }, [flushSave]);

  // Flush on unmount so "Save & Close" never loses pending changes
  useEffect(() => () => { flushSave(); }, []);

  // Reset state when navigating between meetings (note.id change only — body changes
  // from real-time sync are intentionally NOT reset to avoid clobbering in-progress edits).
  useEffect(() => {
    const { data: p } = parseMeeting(note.body);
    setAgenda(p.agenda);
    setActions(p.actions);
    setNotes(p.notes);
    setTitle(note.title);
    setShowImport(false);
    setImportSel(new Set());
  }, [note.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const setA = (a: AgendaItem[]) => { setAgenda(a); scheduleSave(); };
  const setAc = (ac: ActionItem[]) => { setActions(ac); scheduleSave(); };
  const setN = (n: string) => { setNotes(n); scheduleSave(); };

  // Carry-forward: uncompleted actions from the meeting immediately before this one
  const prevMeeting = useMemo(() => {
    const idx = allMeetings.findIndex((m) => m.id === note.id);
    return idx < allMeetings.length - 1 ? allMeetings[idx + 1] : null;
  }, [allMeetings, note.id]);

  const carryForward = useMemo(() => {
    if (!prevMeeting) return [];
    const { data: prev } = parseMeeting(prevMeeting.body);
    return prev.actions.filter((a) => !a.done);
  }, [prevMeeting?.id, prevMeeting?.body]);

  // Deferred agenda items from the previous meeting — shown as carry-forward prompts
  const deferredAgenda = useMemo(() => {
    if (!prevMeeting) return [];
    const { data: prev } = parseMeeting(prevMeeting.body);
    return prev.agenda.filter((a) => a.status === 'deferred');
  }, [prevMeeting?.id, prevMeeting?.body]);

  // Add a deferred item from the previous meeting into this meeting's agenda
  const addDeferredToAgenda = (item: AgendaItem) => {
    if (agenda.some((a) => a.title.toLowerCase() === item.title.toLowerCase())) return;
    setA([...agenda, { ...item, id: uid(), status: 'discuss' }]);
  };

  // Navigation
  const idx = allMeetings.findIndex((m) => m.id === note.id);
  const prevNote = idx < allMeetings.length - 1 ? allMeetings[idx + 1] : null;
  const nextNote = idx > 0 ? allMeetings[idx - 1] : null;

  // Import from Topics
  const openTopics = data.work_items.filter((w) => w.person_id === person.id && !w.done);
  const alreadyInAgenda = new Set(agenda.map((a) => a.title.toLowerCase()));

  const doImport = () => {
    const toAdd = openTopics
      .filter((w) => importSel.has(w.id))
      .map((w) => ({ id: uid(), title: w.title, notes: w.notes || '', status: 'discuss' as const }));
    setA([...agenda, ...toAdd]);
    setShowImport(false);
    setImportSel(new Set());
  };

  const addAgendaItem = () => setA([...agenda, { id: uid(), title: '', notes: '', status: 'discuss' }]);
  const addAction = (owner: 'me' | 'them' = 'me') =>
    setAc([...actions, { id: uid(), title: '', owner, due: '', done: false, pushed: false }]);

  const pushAllToTasks = async () => {
    const toPush = actions.filter((a) => !a.pushed && a.title.trim());
    // For a 1:1, the meeting person owns the action unless it names someone
    // else; for a group meeting there's no default owner. Either way the
    // action's due date and explicit owner are preserved by buildTaskFromAction.
    const defaultTarget: PushTarget | null = isGroupMeeting
      ? null
      : { id: person.id, type: 'person', name: person.name };
    for (const a of toPush) {
      await insert('work_items', buildTaskFromAction(a, title, defaultTarget) as Partial<WorkItem>);
    }
    const updated = actions.map((a) => ({ ...a, pushed: a.pushed || !!a.title.trim() }));
    setAc(updated);
    logActivity('push_meeting_tasks', `${toPush.length} actions from ${title}`);
  };

  const onSendAction = async (action: ActionItem, targetId: string, targetType: 'person' | 'project', targetName: string) => {
    await insert('work_items', buildTaskFromAction(action, title, { id: targetId, type: targetType, name: targetName }) as Partial<WorkItem>);
    const updated = actions.map((a) => a.id === action.id ? { ...a, pushed: true, pushed_to: targetName } : a);
    setAc(updated);
  };

  const markCarryForwardDone = (cfAction: ActionItem, done: boolean) => {
    if (!prevMeeting) return;
    const { data: prev } = parseMeeting(prevMeeting.body);
    const updated = prev.actions.map((a) => a.id === cfAction.id ? { ...a, done } : a);
    update('notes', prevMeeting.id, {
      body: JSON.stringify({ ...prev, actions: updated }),
    } as Partial<Note>);
  };

  const saveTitle = () => update('notes', note.id, { title: title.trim() || note.title } as Partial<Note>);

  const deleteNote = async () => {
    if (!confirm('Delete this meeting note?')) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    try { await setMeetingDate(note.id, null); } catch { /* best-effort cleanup */ }
    await remove('notes', note.id);
    onClose();
  };

  const handleClose = () => { flushSave(); onClose(); };
  const handleNavigate = (id: string) => { flushSave(); onNavigate(id); };

  // Stats
  const toCover = agenda.filter((a) => a.status === 'discuss').length;
  const covered = agenda.filter((a) => a.status === 'covered').length;
  const newActions = actions.filter((a) => !a.done).length;

  // Filtered people and projects for the send picker
  const pickerPeople = data.people.filter((p) => !p.type || p.type === 'person');
  const pickerProjects = data.projects.filter((p) => !p.deleted_at);

  return createPortal(
    <>
    <div className="mtg-overlay" onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}>
      <div className={`mtg-modal mtg-modal-structured${notesExpanded ? ' mtg-notes-focus' : ''}`}>

        {/* Header */}
        <div className="mtg-hdr">
          <div className="mtg-hdr-left">
            <span className="avatar" style={{ background: person.color || '#3A7CA5', width: 40, height: 40, fontSize: 14 }}>
              {person.name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('')}
            </span>
            <div>
              <div className="mtg-person-chip">{person.name}</div>
              <input className="mtg-title-input" value={title}
                onChange={(e) => setTitle(e.target.value)} onBlur={saveTitle} />
              <div className="mtg-date">
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
                    <span style={{ color: meetingDate ? 'var(--accent)' : 'var(--text3)', fontSize: 12, fontWeight: 600, pointerEvents: 'none' }}>
                      📅 {meetingDate ? fmtWeekDMY(meetingDate) : 'Set date…'}
                    </span>
                    <input
                      type="date"
                      value={meetingDate}
                      onChange={(e) => updateMeetingDate(e.target.value)}
                      style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%' }}
                    />
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--text3)' }}>· shows in Today</span>
                </div>
                {dateErr && <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 3, lineHeight: 1.4 }}>{dateErr}</div>}
              </div>
            </div>
          </div>
          <div className="mtg-hdr-right">
            <button className="btn btn-secondary btn-sm" onClick={pushAllToTasks}
              title="Create tasks in your system for all action items">→ Push to Tasks</button>
            <button className="btn btn-share btn-sm" onClick={() => setShowShare(true)}>📤 Share</button>
            <button className="btn btn-danger btn-sm" onClick={deleteNote}>Delete</button>
            <button className="btn btn-primary btn-sm" onClick={handleClose}>Save &amp; Close</button>
          </div>
        </div>

        {/* Mobile tab bar — hidden on desktop via CSS */}
        <div className="mtg-mobile-tabs">
          <button className={`mtg-mobile-tab${mobileTab === 'agenda' ? ' active' : ''}`}
            onClick={() => setMobileTab('agenda')}>
            📋 Agenda{toCover > 0 ? ` (${toCover})` : ''}
          </button>
          <button className={`mtg-mobile-tab${mobileTab === 'actions' ? ' active' : ''}`}
            onClick={() => setMobileTab('actions')}>
            ✅ Actions{newActions > 0 ? ` (${newActions})` : ''}
          </button>
          <button className={`mtg-mobile-tab${mobileTab === 'notes' ? ' active' : ''}`}
            onClick={() => setMobileTab('notes')}>
            📝 Notes
          </button>
        </div>

        {/* Two-column body */}
        <div className={`mtg-cols${mobileTab === 'notes' ? ' mtg-hidden-mobile' : ''}`}>

          {/* LEFT: Agenda */}
          <div className={`mtg-col mtg-col-agenda${mobileTab === 'actions' ? ' mtg-hidden-mobile' : ''}`}>
            <div className="mtg-col-hdr">
              <span className="mtg-col-title">📋 Agenda</span>
              {!isGroupMeeting && (
                <button className="btn btn-secondary btn-sm" onClick={() => setShowImport((s) => !s)}>
                  Import Action Items ↓
                </button>
              )}
            </div>

            {!isGroupMeeting && showImport && (
              <div className="mtg-import-panel">
                {openTopics.length === 0
                  ? <p style={{ fontSize: 13, color: 'var(--text3)', padding: 8 }}>No open action items for {person.name.split(' ')[0]}.</p>
                  : <>
                    <div className="mtg-import-list">
                      {openTopics.map((w) => (
                        <label key={w.id} className="mtg-import-row">
                          <input type="checkbox" checked={importSel.has(w.id)}
                            disabled={alreadyInAgenda.has(w.title.toLowerCase())}
                            onChange={() => setImportSel((s) => {
                              const n = new Set(s);
                              n.has(w.id) ? n.delete(w.id) : n.add(w.id);
                              return n;
                            })} />
                          <span style={{ fontSize: 13, opacity: alreadyInAgenda.has(w.title.toLowerCase()) ? 0.4 : 1 }}>
                            {w.title}
                            {alreadyInAgenda.has(w.title.toLowerCase()) && <em style={{ fontSize: 11, color: 'var(--text3)' }}> (already added)</em>}
                          </span>
                        </label>
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: 6, padding: '8px 12px', justifyContent: 'flex-end' }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => setShowImport(false)}>Cancel</button>
                      <button className="btn btn-primary btn-sm" onClick={doImport}
                        disabled={importSel.size === 0}>Add {importSel.size} item{importSel.size !== 1 ? 's' : ''}</button>
                    </div>
                  </>}
              </div>
            )}

            <div className="mtg-col-body">
              {agenda.length === 0 && deferredAgenda.length === 0 && !showImport && (
                <p className="mtg-empty-hint">Add agenda items below, or import from Action Items ↑</p>
              )}
              {agenda.map((item, i) => (
                <AgendaItemRow key={item.id} item={item}
                  onChange={(updated) => setA(agenda.map((a, j) => j === i ? updated : a))}
                  onDelete={() => setA(agenda.filter((_, j) => j !== i))} />
              ))}

              {deferredAgenda.length > 0 && (
                <>
                  <div className="mtg-section-sep">
                    ⏭ Deferred from {prevMeeting ? fmtDM(dates[prevMeeting.id] || prevMeeting.created_at) : 'last meeting'}
                  </div>
                  {deferredAgenda.map((item) => (
                    <DeferredAgendaRow
                      key={item.id}
                      item={item}
                      onAdd={() => addDeferredToAgenda(item)}
                    />
                  ))}
                </>
              )}

              <button className="mtg-add-row" onClick={addAgendaItem}>+ Add agenda item</button>
            </div>
          </div>

          {/* RIGHT: Actions */}
          <div className={`mtg-col mtg-col-actions${mobileTab === 'agenda' ? ' mtg-hidden-mobile' : ''}`}>
            <div className="mtg-col-hdr">
              <span className="mtg-col-title">✅ Action Items</span>
            </div>
            <div className="mtg-col-body">
              {actions.length === 0 && carryForward.length === 0 && (
                <p className="mtg-empty-hint">Actions agreed in this meeting appear here.</p>
              )}
              {actions.map((item, i) => (
                <ActionItemRow key={item.id} item={item} personName={person.name}
                  isGroupMeeting={isGroupMeeting}
                  people={pickerPeople}
                  projects={pickerProjects}
                  onSend={(tId, tType, tName) => onSendAction(item, tId, tType, tName)}
                  onChange={(updated) => setAc(actions.map((a, j) => j === i ? updated : a))}
                  onDelete={() => setAc(actions.filter((_, j) => j !== i))} />
              ))}
              <div className="mtg-action-add-row">
                <button className="mtg-add-row" onClick={() => addAction('me')}>+ For me</button>
                <button className="mtg-add-row" onClick={() => addAction('them')}>
                  {isGroupMeeting ? '+ For others' : `+ For ${person.name.split(' ')[0]}`}
                </button>
              </div>

              {carryForward.length > 0 && (
                <>
                  <div className="mtg-section-sep">
                    Carry-forward · {prevMeeting ? fmtDM(prevMeeting.created_at) : 'last meeting'}
                  </div>
                  {carryForward.map((cf) => (
                    <CarryForwardRow key={cf.id} item={cf} personName={person.name}
                      onMarkDone={(done) => markCarryForwardDone(cf, done)} />
                  ))}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Free notes */}
        <div className={`mtg-notes-section${mobileTab !== 'notes' ? ' mtg-hidden-mobile' : ' mtg-notes-tab-active'}`}>
          <div className="mtg-notes-label">
            <span>📝 Meeting Notes</span>
            <button className="mtg-notes-expand" onClick={() => setNotesExpanded((v) => !v)}>
              {notesExpanded ? '⤡ Collapse' : '⤢ Expand'}
            </button>
          </div>
          <RichEditor key={note.id} content={notes} onBlur={setN}
            placeholder="Key context, decisions, things to remember…" />
        </div>

        {/* Footer */}
        <div className="mtg-footer">
          <div className="mtg-footer-stats">
            {toCover > 0 && <span>{toCover} to cover</span>}
            {covered > 0 && <span style={{ color: 'var(--green)' }}>{covered} covered</span>}
            {newActions > 0 && <span>{newActions} open action{newActions !== 1 ? 's' : ''}</span>}
            {carryForward.length > 0 && <span style={{ color: 'var(--orange)' }}>{carryForward.length} incomplete from last meeting</span>}
          </div>
          <div className="mtg-footer-nav">
            {prevNote && (
              <button className="btn btn-secondary btn-sm" onClick={() => handleNavigate(prevNote.id)}>
                ← {fmtDM(prevNote.created_at)}
              </button>
            )}
            {nextNote && (
              <button className="btn btn-secondary btn-sm" onClick={() => handleNavigate(nextNote.id)}>
                {fmtDM(nextNote.created_at)} →
              </button>
            )}
          </div>
          <button className="btn btn-primary mtg-footer-close" onClick={handleClose}>
            Save &amp; Close
          </button>
        </div>

      </div>
    </div>

    {showShare && (
      <SharePanel
        note={note}
        person={person}
        meetingData={{ agenda, actions, notes }}
        onClose={() => setShowShare(false)}
      />
    )}
    </>,
    document.body
  );
}
