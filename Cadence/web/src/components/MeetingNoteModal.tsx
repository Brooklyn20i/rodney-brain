import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCadence } from '../lib/store';
import type { Note, Person, WorkItem } from '../lib/types';
import { RichEditor } from './RichEditor';

// ── Data model stored as JSON in note.body ────────────────────────────────────
export interface AgendaItem {
  id: string; title: string; notes: string;
  status: 'discuss' | 'covered' | 'deferred';
}
export interface ActionItem {
  id: string; title: string;
  owner: 'me' | 'them';
  due: string; done: boolean; pushed: boolean;
}
export interface MeetingData {
  agenda: AgendaItem[];
  actions: ActionItem[];
  notes: string; // rich HTML
}

const emptyMeeting = (): MeetingData => ({ agenda: [], actions: [], notes: '' });
const uid = () => Math.random().toString(36).slice(2, 10);

export function parseMeeting(body: string): { data: MeetingData; isLegacy: boolean } {
  if (!body.trim()) return { data: emptyMeeting(), isLegacy: false };
  try {
    const p = JSON.parse(body);
    if (p && typeof p === 'object' && ('agenda' in p || 'actions' in p)) {
      return {
        data: { agenda: p.agenda || [], actions: p.actions || [], notes: p.notes || '' },
        isLegacy: false,
      };
    }
  } catch {}
  // Legacy: plain text or HTML → preserve in notes field
  return { data: { agenda: [], actions: [], notes: body }, isLegacy: true };
}

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const fmtShort = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

// ── Individual subcomponents ──────────────────────────────────────────────────

function AgendaItemRow({ item, onChange, onDelete }: {
  item: AgendaItem;
  onChange: (updated: AgendaItem) => void;
  onDelete: () => void;
}) {
  const [editingNotes, setEditingNotes] = useState(false);
  const set = (patch: Partial<AgendaItem>) => onChange({ ...item, ...patch });

  const statusLabel: Record<AgendaItem['status'], string> = {
    discuss: '💬 To discuss', covered: '✅ Covered', deferred: '⏭ Deferred',
  };
  const statusCls: Record<AgendaItem['status'], string> = {
    discuss: 'status-discuss', covered: 'status-covered', deferred: 'status-deferred',
  };

  return (
    <div className={`agenda-item${item.status === 'covered' ? ' covered' : ''}`}>
      <span className="agenda-handle" title="Drag to reorder">⠿</span>
      <div className="agenda-main">
        <div className="agenda-topic">
          <span className={`status-pill ${statusCls[item.status]}`}>{statusLabel[item.status]}</span>
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
            className="agenda-notes-input"
            value={item.notes}
            placeholder="Notes on this topic…"
            onChange={(e) => set({ notes: e.target.value })}
            onBlur={() => { if (!item.notes) setEditingNotes(false); }}
            rows={2}
          />
        ) : (
          <button className="agenda-notes-add" onClick={() => setEditingNotes(true)}>+ Add notes</button>
        )}
        <div className="agenda-status-btns">
          {(['discuss', 'covered', 'deferred'] as const).map((s) => (
            <button key={s} className={`stn-btn${item.status === s ? ` active-${s}` : ''}`}
              onClick={() => set({ status: s })}>
              {s === 'discuss' ? '💬 Discuss' : s === 'covered' ? '✅ Covered' : '⏭ Defer'}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ActionItemRow({ item, personName, onChange, onDelete }: {
  item: ActionItem; personName: string;
  onChange: (updated: ActionItem) => void;
  onDelete: () => void;
}) {
  const set = (patch: Partial<ActionItem>) => onChange({ ...item, ...patch });
  const isLate = item.due && !item.done && new Date(item.due) < new Date();

  return (
    <div className={`action-item${item.done ? ' done' : ''}${isLate ? ' late' : ''}`}>
      <input
        type="checkbox"
        className="action-check"
        checked={item.done}
        onChange={(e) => set({ done: e.target.checked })}
      />
      <div className="action-main">
        <input
          className="action-title-input"
          value={item.title}
          placeholder="Action item…"
          onChange={(e) => set({ title: e.target.value })}
        />
        <div className="action-meta">
          <button
            className={`owner-chip ${item.owner === 'me' ? 'owner-me' : 'owner-them'}`}
            onClick={() => set({ owner: item.owner === 'me' ? 'them' : 'me' })}
            title="Click to toggle owner"
          >
            {item.owner === 'me' ? 'Me' : personName.split(' ')[0]}
          </button>
          <input
            className="due-input"
            type="date"
            value={item.due}
            onChange={(e) => set({ due: e.target.value })}
            title="Due date"
          />
          {isLate && <span className="due-late-label">Overdue</span>}
          {item.pushed && <span className="pushed-label">→ In Tasks</span>}
          <button className="action-delete" onClick={onDelete} title="Remove">✕</button>
        </div>
      </div>
    </div>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────
interface Props {
  note: Note;
  person: Person;
  allMeetings: Note[]; // sorted newest-first, for navigation & carry-forward
  onClose: () => void;
  onNavigate: (noteId: string) => void;
}

export function MeetingNoteModal({ note, person, allMeetings, onClose, onNavigate }: Props) {
  const { data, update, insert, remove, logActivity } = useCadence();

  const { data: parsed, isLegacy } = useMemo(() => parseMeeting(note.body), [note.id]);
  const [agenda, setAgenda] = useState<AgendaItem[]>(parsed.agenda);
  const [actions, setActions] = useState<ActionItem[]>(parsed.actions);
  const [notes, setNotes] = useState<string>(parsed.notes);
  const [title, setTitle] = useState(note.title);
  const [showImport, setShowImport] = useState(false);
  const [importSel, setImportSel] = useState<Set<string>>(new Set());
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync parsed state when note.id changes (navigating between meetings)
  useEffect(() => {
    const { data: p } = parseMeeting(note.body);
    setAgenda(p.agenda); setActions(p.actions); setNotes(p.notes);
    setTitle(note.title);
  }, [note.id]);

  // Debounced save
  const scheduleSave = useCallback((a: AgendaItem[], ac: ActionItem[], n: string) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const body = JSON.stringify({ agenda: a, actions: ac, notes: n });
      update('notes', note.id, { body } as Partial<Note>);
    }, 600);
  }, [note.id, update]);

  const setA = (a: AgendaItem[]) => { setAgenda(a); scheduleSave(a, actions, notes); };
  const setAc = (ac: ActionItem[]) => { setActions(ac); scheduleSave(agenda, ac, notes); };
  const setN = (n: string) => { setNotes(n); scheduleSave(agenda, actions, n); };

  // Carry-forward: uncompleted actions from previous meeting
  const prevMeeting = useMemo(() => {
    const idx = allMeetings.findIndex((m) => m.id === note.id);
    return idx < allMeetings.length - 1 ? allMeetings[idx + 1] : null;
  }, [allMeetings, note.id]);

  const carryForward = useMemo(() => {
    if (!prevMeeting) return [];
    const { data: prev } = parseMeeting(prevMeeting.body);
    return prev.actions.filter((a) => !a.done);
  }, [prevMeeting]);

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

  // Add agenda item
  const addAgendaItem = () => setA([...agenda, { id: uid(), title: '', notes: '', status: 'discuss' }]);

  // Add action item
  const addAction = (owner: 'me' | 'them' = 'me') =>
    setAc([...actions, { id: uid(), title: '', owner, due: '', done: false, pushed: false }]);

  // Push all unpushed actions to work_items
  const pushAllToTasks = async () => {
    const toPush = actions.filter((a) => !a.pushed && a.title.trim());
    for (const a of toPush) {
      await insert('work_items', {
        title: a.title, type: 'task', priority: 'medium',
        person_id: person.id,
        notes: `Action from: ${title}`,
        inboxed: false, source: 'you',
      } as Partial<WorkItem>);
    }
    const updated = actions.map((a) => ({ ...a, pushed: a.pushed || (a.title.trim() ? true : false) }));
    setAc(updated);
    logActivity('push_meeting_tasks', `${toPush.length} actions from ${title}`);
  };

  // Mark a carry-forward item done in the previous meeting
  const markCarryForwardDone = (cfAction: ActionItem) => {
    if (!prevMeeting) return;
    const { data: prev } = parseMeeting(prevMeeting.body);
    const updated = prev.actions.map((a) => a.id === cfAction.id ? { ...a, done: true } : a);
    update('notes', prevMeeting.id, {
      body: JSON.stringify({ ...prev, actions: updated }),
    } as Partial<Note>);
  };

  const saveTitle = () => update('notes', note.id, { title: title.trim() || note.title } as Partial<Note>);

  const deleteNote = async () => {
    if (!confirm('Delete this meeting note?')) return;
    await remove('notes', note.id);
    onClose();
  };

  // Summary stats
  const toCover = agenda.filter((a) => a.status === 'discuss').length;
  const covered = agenda.filter((a) => a.status === 'covered').length;
  const newActions = actions.filter((a) => !a.done).length;

  return (
    <div className="mtg-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="mtg-modal mtg-modal-structured">

        {/* ── Header ── */}
        <div className="mtg-hdr">
          <div className="mtg-hdr-left">
            <span className="avatar" style={{ background: person.color || '#3A7CA5', width: 40, height: 40, fontSize: 14 }}>
              {person.name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('')}
            </span>
            <div>
              <div className="mtg-person-chip">{person.name}</div>
              <input className="mtg-title-input" value={title}
                onChange={(e) => setTitle(e.target.value)} onBlur={saveTitle} />
              <div className="mtg-date">{fmtDate(note.created_at)}</div>
            </div>
          </div>
          <div className="mtg-hdr-right">
            <button className="btn btn-secondary btn-sm" onClick={pushAllToTasks}
              title="Create tasks in your system for all action items">→ Push to Tasks</button>
            <button className="btn btn-danger btn-sm" onClick={deleteNote}>Delete</button>
            <button className="btn btn-primary btn-sm" onClick={onClose}>Save &amp; Close</button>
          </div>
        </div>

        {/* ── Two-column body ── */}
        <div className="mtg-cols">

          {/* LEFT: Agenda */}
          <div className="mtg-col mtg-col-agenda">
            <div className="mtg-col-hdr">
              <span className="mtg-col-title">📋 Agenda</span>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowImport((s) => !s)}>
                Import Topics ↓
              </button>
            </div>

            {/* Import panel */}
            {showImport && (
              <div className="mtg-import-panel">
                {openTopics.length === 0
                  ? <p style={{ fontSize: 13, color: 'var(--text3)', padding: 8 }}>No open topics for {person.name.split(' ')[0]}.</p>
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
              {agenda.length === 0 && !showImport && (
                <p className="mtg-empty-hint">Add agenda items below, or import from Topics →</p>
              )}
              {agenda.map((item, i) => (
                <AgendaItemRow
                  key={item.id}
                  item={item}
                  onChange={(updated) => setA(agenda.map((a, j) => j === i ? updated : a))}
                  onDelete={() => setA(agenda.filter((_, j) => j !== i))}
                />
              ))}
              <button className="mtg-add-row" onClick={addAgendaItem}>+ Add agenda item</button>
            </div>
          </div>

          {/* RIGHT: Actions */}
          <div className="mtg-col mtg-col-actions">
            <div className="mtg-col-hdr">
              <span className="mtg-col-title">✅ Action Items</span>
            </div>
            <div className="mtg-col-body">
              {/* New this meeting */}
              {actions.length === 0 && carryForward.length === 0 && (
                <p className="mtg-empty-hint">Actions agreed in this meeting appear here.</p>
              )}
              {actions.map((item, i) => (
                <ActionItemRow
                  key={item.id}
                  item={item}
                  personName={person.name}
                  onChange={(updated) => setAc(actions.map((a, j) => j === i ? updated : a))}
                  onDelete={() => setAc(actions.filter((_, j) => j !== i))}
                />
              ))}
              <div className="mtg-action-add-row">
                <button className="mtg-add-row" onClick={() => addAction('me')}>+ For me</button>
                <button className="mtg-add-row" onClick={() => addAction('them')}>+ For {person.name.split(' ')[0]}</button>
              </div>

              {/* Carry-forward from previous meeting */}
              {carryForward.length > 0 && (
                <>
                  <div className="mtg-section-sep">
                    Carry-forward · {prevMeeting ? fmtShort(prevMeeting.created_at) : 'last meeting'}
                  </div>
                  {carryForward.map((cf) => {
                    const isLate = cf.due && new Date(cf.due) < new Date();
                    return (
                      <div key={cf.id} className={`action-item carry-fwd${isLate ? ' late' : ''}`}>
                        <input type="checkbox" className="action-check"
                          onChange={() => markCarryForwardDone(cf)} />
                        <div className="action-main">
                          <div className="action-title-static">{cf.title}</div>
                          <div className="action-meta">
                            <span className={`owner-chip ${cf.owner === 'me' ? 'owner-me' : 'owner-them'}`}>
                              {cf.owner === 'me' ? 'Me' : person.name.split(' ')[0]}
                            </span>
                            {cf.due && (
                              <span className={isLate ? 'due-late-label' : 'due-normal-label'}>
                                {isLate ? 'Overdue · ' : ''}{fmtShort(cf.due)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          </div>
        </div>

        {/* ── Free notes ── */}
        <div className="mtg-notes-section">
          <div className="mtg-notes-label">📝 Meeting Notes</div>
          {isLegacy ? (
            <RichEditor key={`${note.id}-legacy`} content={notes} onBlur={setN}
              placeholder="Key context, decisions, things to remember…" />
          ) : (
            <RichEditor key={note.id} content={notes} onBlur={setN}
              placeholder="Key context, decisions, things to remember…" />
          )}
        </div>

        {/* ── Footer ── */}
        <div className="mtg-footer">
          <div className="mtg-footer-stats">
            {toCover > 0 && <span>{toCover} to cover</span>}
            {covered > 0 && <span style={{ color: 'var(--green)' }}>{covered} covered</span>}
            {newActions > 0 && <span>{newActions} open action{newActions !== 1 ? 's' : ''}</span>}
            {carryForward.length > 0 && <span style={{ color: 'var(--orange)' }}>{carryForward.length} overdue from last meeting</span>}
          </div>
          <div className="mtg-footer-nav">
            {prevNote && (
              <button className="btn btn-secondary btn-sm" onClick={() => onNavigate(prevNote.id)}>
                ← {fmtShort(prevNote.created_at)}
              </button>
            )}
            {nextNote && (
              <button className="btn btn-secondary btn-sm" onClick={() => onNavigate(nextNote.id)}>
                {fmtShort(nextNote.created_at)} →
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
