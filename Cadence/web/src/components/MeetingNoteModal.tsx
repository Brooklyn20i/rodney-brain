import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { todayStr, fmtDM, fmtWeekDMY, fmtDMY } from '../lib/util';
import { useCadence } from '../lib/store';
import type { Note, Person, WorkItem } from '../lib/types';
import type { Project } from '../lib/types';
import { RichEditor } from './RichEditor';
import { SharePanel } from './SharePanel';
import { useMeetingDates } from '../lib/meetings';
import { parseMeeting, serializeMeeting, uid } from '../lib/meetingData';
import type { AgendaItem, ActionItem } from '../lib/meetingData';
import { buildTaskFromAction, isLinkedToPerson } from '../lib/tasks';
import type { PushTarget } from '../lib/tasks';
import { sanitizeHtml } from '../lib/sanitize';
import { PrepBriefPanel } from './PrepBriefPanel';

// Data model + parser now live in lib/meetingData (React-free). Re-export here
// so existing import sites (Meetings.tsx, SharePanel.tsx) keep working.
export { parseMeeting } from '../lib/meetingData';
export type { AgendaItem, ActionItem, MeetingData } from '../lib/meetingData';

// Agenda notes can hold either quick plain text (typed inline) or rich HTML
// (typed in the expanded editor). These helpers let both coexist on one field.
const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// True if a notes string is HTML produced by the rich editor (vs. plain text).
const isRichHtml = (s: string) => /<(p|ul|ol|li|h[1-3]|strong|em|u|blockquote|table|br|mark|s)[\s>]/i.test(s);

// True if the notes have no visible content (covers empty rich `<p></p>` too).
const notesAreEmpty = (s: string) =>
  !s || s.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim() === '';

// Convert plain text (with line breaks) to HTML so the rich editor can open it
// without losing the user's existing quick notes. Already-HTML is passed through.
const toEditorHtml = (s: string) => {
  if (!s) return '';
  if (isRichHtml(s)) return s;
  return s.split(/\n{2,}/).map((para) =>
    `<p>${para.split('\n').map(escapeHtml).join('<br>')}</p>`
  ).join('');
};

// ── Expanded agenda-note editor (focused sheet) ───────────────────────────────
// Reuses the full RichEditor (bold, bullets, headings, …) in a roomy overlay so
// notes that outgrow the inline box have proper space and formatting.
function AgendaNoteSheet({ title, initialHtml, onChange, onClose }: {
  title: string; initialHtml: string;
  onChange: (html: string) => void; onClose: () => void;
}) {
  return createPortal(
    <div className="agenda-note-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="agenda-note-sheet">
        <div className="agenda-note-sheet-hdr">
          <span className="agenda-note-sheet-title">📝 {title.trim() || 'Agenda note'}</span>
          <button className="btn btn-primary btn-sm" onClick={onClose}>Done</button>
        </div>
        <div className="agenda-note-sheet-body">
          <RichEditor
            content={initialHtml}
            onChange={(html) => onChange(notesAreEmpty(html) ? '' : html)}
            placeholder="Type freely — use the toolbar for bold, bullets and headings."
          />
        </div>
      </div>
    </div>,
    document.body
  );
}


// ── Agenda item row ───────────────────────────────────────────────────────────
function AgendaItemRow({ item, onChange, onDelete, onCloseTask, taskDone }: {
  item: AgendaItem;
  onChange: (updated: AgendaItem) => void;
  onDelete: () => void;
  onCloseTask?: () => void;
  taskDone?: boolean;
}) {
  const [editingNotes, setEditingNotes] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const set = (patch: Partial<AgendaItem>) => onChange({ ...item, ...patch });

  const autoGrow = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };

  const rich = isRichHtml(item.notes) && !notesAreEmpty(item.notes);
  // Only the plain textarea needs auto-grow; rich notes render as a preview.
  useEffect(() => { if (!rich) autoGrow(taRef.current); }, [item.notes, rich]);

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
        {rich ? (
          // Rich notes: clean read-only preview that opens the full editor on tap.
          <div className="agenda-notes-preview" onClick={() => setSheetOpen(true)} title="Tap to edit">
            <div className="re-content" dangerouslySetInnerHTML={{ __html: sanitizeHtml(item.notes) }} />
            <span className="agenda-notes-edit-hint">✏️ Edit</span>
          </div>
        ) : (editingNotes || item.notes) ? (
          <div className="agenda-notes-wrap">
            <textarea
              ref={taRef}
              className="agenda-notes-input"
              value={item.notes}
              placeholder="Notes on this topic…"
              onChange={(e) => { set({ notes: e.target.value }); autoGrow(e.target); }}
              onInput={(e) => autoGrow(e.currentTarget)}
              onBlur={() => { if (!item.notes) setEditingNotes(false); }}
            />
            <button className="agenda-notes-expand" onClick={() => setSheetOpen(true)}
              title="Open the full editor for more space and formatting">⤢ Bigger</button>
          </div>
        ) : (
          <div className="agenda-notes-add-row">
            <button className="agenda-notes-add" onClick={() => setEditingNotes(true)}>+ Add notes</button>
            <button className="agenda-notes-add agenda-notes-add-rich" onClick={() => setSheetOpen(true)}
              title="Open the full editor with bullets, bold and headings">⤢ Bigger editor</button>
          </div>
        )}
        {sheetOpen && (
          <AgendaNoteSheet
            title={item.title}
            initialHtml={toEditorHtml(item.notes)}
            onChange={(html) => set({ notes: html })}
            onClose={() => setSheetOpen(false)}
          />
        )}
        <div className="agenda-status-btns">
          {(['discuss', 'covered', 'deferred'] as const).map((s) => (
            <button key={s} className={`stn-btn${item.status === s ? ` active-${s}` : ''}`}
              onClick={() => set({ status: item.status === s ? 'discuss' : s })}>
              {s === 'discuss' ? '💬 Discuss' : s === 'covered' ? '✅ Covered' : '⏭ Defer'}
            </button>
          ))}
          {item.source_item_id && (
            taskDone
              ? <span className="agenda-task-closed">✓ Task closed</span>
              : onCloseTask
                ? <button className="agenda-close-task-btn" onClick={onCloseTask} title="Mark the linked task as done">◎ Close task</button>
                : null
          )}
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
  onSend?: (targets: PushTarget[]) => void;
}) {
  const set = (patch: Partial<ActionItem>) => onChange({ ...item, ...patch });
  const isLate = !!item.due && !item.done && item.due < todayStr();
  const [showSend, setShowSend] = useState(false);
  const [showOwnerPicker, setShowOwnerPicker] = useState(false);
  const [selectedTargets, setSelectedTargets] = useState<PushTarget[]>([]);

  const ownerPerson = (isGroupMeeting && item.owner_person_id && people)
    ? people.find((p) => p.id === item.owner_person_id) ?? null
    : null;

  const selectOwner = (p: Person) => {
    set({ owner_label: p.name, owner_person_id: p.id });
    setShowOwnerPicker(false);
  };

  const toggleTarget = (t: PushTarget) =>
    setSelectedTargets(prev =>
      prev.some(x => x.id === t.id) ? prev.filter(x => x.id !== t.id) : [...prev, t]
    );
  const openSendPicker = (preselect?: PushTarget) => {
    setSelectedTargets(preselect ? [preselect] : []);
    setShowSend(true);
  };
  const confirmSend = () => {
    if (selectedTargets.length > 0 && onSend) {
      onSend(selectedTargets);
      setShowSend(false);
      setSelectedTargets([]);
    }
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
          ) : onSend ? (
            <div style={{ position: 'relative' }}>
              <button className="action-send-btn"
                onClick={() => openSendPicker(ownerPerson ? { id: ownerPerson.id, type: 'person', name: ownerPerson.name } : undefined)}>
                {ownerPerson ? `→ ${ownerPerson.name.split(' ')[0]}` : '→ Send'}
              </button>
              {showSend && (
                <>
                  <div style={{ position: 'fixed', inset: 0, zIndex: 49 }} onClick={() => { setShowSend(false); setSelectedTargets([]); }} />
                  <div className="action-send-picker">
                    {people && people.length > 0 && (
                      <>
                        <div className="send-picker-section">People</div>
                        {people.filter((p) => !p.type || p.type === 'person').map((p) => {
                          const sel = selectedTargets.some(t => t.id === p.id);
                          return (
                            <button key={p.id} className={`send-picker-option${sel ? ' selected' : ''}`}
                              onClick={() => toggleTarget({ id: p.id, type: 'person', name: p.name })}>
                              <span className="avatar" style={{ background: p.color || '#3A7CA5', width: 22, height: 22, fontSize: 9, flexShrink: 0 }}>
                                {p.name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('')}
                              </span>
                              {p.name}
                              {sel && <span className="send-picker-check">✓</span>}
                            </button>
                          );
                        })}
                      </>
                    )}
                    {projects && projects.length > 0 && (
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
                    {selectedTargets.length > 0 && (
                      <div className="send-picker-footer">
                        <button className="send-picker-confirm" onClick={confirmSend}>
                          Send to {selectedTargets.map(t => t.name.split(' ')[0]).join(' + ')}
                        </button>
                      </div>
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
function DeferredAgendaRow({ item, onAdd, alreadyAdded }: { item: AgendaItem; onAdd: () => void; alreadyAdded: boolean }) {
  return (
    <div className={`deferred-agenda-row${alreadyAdded ? ' deferred-added' : ''}`}>
      <div className="deferred-agenda-title">⏭ {item.title}</div>
      {!notesAreEmpty(item.notes) && (
        <div className="deferred-agenda-notes">
          {item.notes.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()}
        </div>
      )}
      {alreadyAdded ? (
        <span className="deferred-agenda-added-label">✓ Added to agenda</span>
      ) : (
        <button className="btn btn-secondary btn-sm deferred-agenda-btn" onClick={onAdd}>
          + Add to this agenda
        </button>
      )}
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

  // note.id intentionally included so the parse resets when navigating between
  // meetings; body-only changes (realtime sync) do NOT reset to avoid clobbering
  // in-progress edits.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const { data: parsed, raw: parsedRaw } = useMemo(() => parseMeeting(note.body), [note.id]);
  const [agenda, setAgenda] = useState<AgendaItem[]>(parsed.agenda);
  const [actions, setActions] = useState<ActionItem[]>(parsed.actions);
  const [notes, setNotes] = useState<string>(parsed.notes);
  const [title, setTitle] = useState(note.title);
  const [showImport, setShowImport] = useState(false);
  const [importSel, setImportSel] = useState<Set<string>>(new Set());
  const [showShare, setShowShare] = useState(false);
  const [showPrep, setShowPrep] = useState(false);
  const [meetingDate, setLocalMeetingDate] = useState(
    dates[note.id] || ''
  );
  const [dateErr, setDateErr] = useState('');

  // Keep the input in sync if the stored date changes elsewhere.
  useEffect(() => { setLocalMeetingDate(dates[note.id] || ''); }, [dates, note.id]);

  const updateMeetingDate = async (date: string) => {
    setLocalMeetingDate(date);
    setDateErr('');

    // Auto-update the note title only when it's still the auto-generated form
    // (prefix alone, or prefix + a DD/MM/YYYY date). If the user added a custom
    // suffix, leave their title untouched.
    const prefix = isGroupMeeting ? `${person.name} · ` : `1:1 · ${person.name} · `;
    if (date && title.startsWith(prefix)) {
      const suffix = title.slice(prefix.length);
      const looksAuto = suffix === '' || /^\d{2}\/\d{2}\/\d{4}$/.test(suffix);
      if (looksAuto) {
        const newTitle = `${prefix}${fmtDMY(date)}`;
        setTitle(newTitle);
        update('notes', note.id, { title: newTitle } as Partial<Note>);
      }
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
  // Forward-compat keys from the stored body, preserved across saves so we don't
  // drop fields written by the Swift app or the agent.
  const rawRef = useRef<Record<string, unknown>>(parsedRaw);
  agendaRef.current = agenda;
  actionsRef.current = actions;
  notesRef.current = notes;
  noteIdRef.current = note.id;

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Has the user actually edited this meeting's body since it was opened,
  // navigated, or last saved? A modal left open on another device holds a stale
  // snapshot; without this guard its close/unmount flush would write that stale
  // body back and clobber a newer save made elsewhere. So we only ever persist
  // the body when there are real local edits.
  const dirtyRef = useRef(false);
  // The exact body string we last parsed into local state (or wrote out). Used
  // to tell a genuine remote change apart from the realtime echo of our own
  // save — a string compare that's robust to JSON formatting differences
  // between the web build, the Swift app and the agent.
  const lastBodyRef = useRef(note.body);
  // The newest server updated_at we've accepted for this note. Live-sync only
  // adopts a remote body whose updated_at is strictly newer than this, so a
  // stale concurrent refetch (which can momentarily revert the row to an older
  // body while our own save is still committing) can never clobber in-progress
  // edits. updated_at is server-set on every write, so it orders versions.
  const lastSeenUpdatedAtRef = useRef(note.updated_at);

  const flushSave = useCallback(() => {
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
    // Nothing edited locally → never write. This is what stops a stale open
    // modal (e.g. left open overnight on the PC while the iPad saved the real
    // notes) from overwriting the newer content when it's finally closed.
    if (!dirtyRef.current) return;
    const body = serializeMeeting(
      { agenda: agendaRef.current, actions: actionsRef.current, notes: notesRef.current },
      rawRef.current,
    );
    dirtyRef.current = false;
    lastBodyRef.current = body; // recognise the realtime echo of this save as "no change"
    // Fire-and-forget (runs on unmount, where we can't await): catch the promise
    // so a failed final save can't raise an unhandled rejection. Real failures
    // still surface via the store's sync-error banner, and network drops are
    // queued for offline replay — so the edit isn't silently lost. On success we
    // record the server's new updated_at so a later stale refetch of an OLDER
    // version is correctly ignored by the live-sync guard below.
    void update('notes', noteIdRef.current, { body } as Partial<Note>)
      .then((row) => {
        const ts = (row as Note | undefined)?.updated_at;
        if (typeof ts === 'string' && ts > lastSeenUpdatedAtRef.current) lastSeenUpdatedAtRef.current = ts;
      })
      .catch(() => {});
  }, [update]);

  const scheduleSave = useCallback(() => {
    dirtyRef.current = true;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(flushSave, 600);
  }, [flushSave]);

  // Flush on unmount so "Save & Close" never loses pending changes.
  // flushSave is intentionally excluded: it reads from refs, so a stale
  // closure is fine and re-registering the effect on every change would cause
  // the cleanup to fire prematurely on re-renders.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => { flushSave(); }, []);

  // Reset state when navigating between meetings (note.id change only). Starting
  // on a fresh meeting is not a local edit, so clear the dirty flag and record
  // the body we just loaded as the sync baseline.
  useEffect(() => {
    const { data: p, raw } = parseMeeting(note.body);
    setAgenda(p.agenda);
    setActions(p.actions);
    setNotes(p.notes);
    setTitle(note.title);
    rawRef.current = raw;
    dirtyRef.current = false;
    lastBodyRef.current = note.body;
    lastSeenUpdatedAtRef.current = note.updated_at;
    setShowImport(false);
    setImportSel(new Set());
  }, [note.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Live sync: when another device (or the Swift app / agent) saves this same
  // meeting, realtime updates note.body on the parent and it flows in as a new
  // prop. Adopt that incoming body into the open modal — but ONLY while there
  // are no unsaved local edits, so an idle instance stays current without ever
  // clobbering work in progress. Together with the dirty-guarded flush above,
  // an instance left open on one device now tracks, and never overwrites, the
  // other.
  useEffect(() => {
    if (dirtyRef.current) return; // unsaved local edits win — don't stomp them
    if (note.body === lastBodyRef.current) return; // no change vs what we already hold
    // Only adopt a STRICTLY NEWER version. A concurrent refetch can momentarily
    // revert the row to an older body while our own save is still committing;
    // without this guard we'd wipe the user's in-progress edits (and rich-text
    // bullets, which re-sync from the body) back to that stale copy. When the
    // row carries no timestamp (older data / tests) we fall back to adopting.
    const incoming = note.updated_at || '';
    if (incoming && incoming <= lastSeenUpdatedAtRef.current) return;
    const { data: p, raw } = parseMeeting(note.body);
    setAgenda(p.agenda);
    setActions(p.actions);
    setNotes(p.notes);
    rawRef.current = raw;
    lastBodyRef.current = note.body;
    if (incoming) lastSeenUpdatedAtRef.current = incoming;
  }, [note.body, note.updated_at]);

  const setA = (a: AgendaItem[]) => { setAgenda(a); scheduleSave(); };
  const setAc = (ac: ActionItem[]) => { setActions(ac); scheduleSave(); };

  // Carry-forward: uncompleted actions from the meeting immediately before this one
  const prevMeeting = useMemo(() => {
    const idx = allMeetings.findIndex((m) => m.id === note.id);
    return idx < allMeetings.length - 1 ? allMeetings[idx + 1] : null;
  }, [allMeetings, note.id]);

  /* eslint-disable react-hooks/exhaustive-deps */
  // Optional-chaining deps: only the meeting's id/body triggers a re-parse,
  // not reference identity changes on the parent prevMeeting object.
  const carryForward = useMemo(() => {
    if (!prevMeeting) return [];
    const { data: prev } = parseMeeting(prevMeeting.body);
    return prev.actions.filter((a) => !a.done);
  }, [prevMeeting?.id, prevMeeting?.body]);

  const deferredAgenda = useMemo(() => {
    if (!prevMeeting) return [];
    const { data: prev } = parseMeeting(prevMeeting.body);
    return prev.agenda.filter((a) => a.status === 'deferred');
  }, [prevMeeting?.id, prevMeeting?.body]);
  /* eslint-enable react-hooks/exhaustive-deps */

  // Add a deferred item from the previous meeting into this meeting's agenda
  const addDeferredToAgenda = (item: AgendaItem) => {
    if (agenda.some((a) => a.title.toLowerCase() === item.title.toLowerCase())) return;
    setA([...agenda, { ...item, id: uid(), status: 'discuss' }]);
  };

  // Navigation
  const idx = allMeetings.findIndex((m) => m.id === note.id);
  const prevNote = idx < allMeetings.length - 1 ? allMeetings[idx + 1] : null;
  const nextNote = idx > 0 ? allMeetings[idx - 1] : null;

  // Import from Topics — includes tasks linked via related_entities so multi-person
  // tasks appear in both people's meeting note import lists.
  const openTopics = data.work_items.filter((w) => !w.done && isLinkedToPerson(w, person.id));
  // Track items already pulled into the agenda — by source ID (preferred) or title fallback.
  const importedSourceIds = new Set(agenda.map((a) => a.source_item_id).filter(Boolean) as string[]);
  const alreadyInAgenda = new Set(agenda.map((a) => a.title.toLowerCase()));
  const isAlreadyImported = (w: WorkItem) =>
    importedSourceIds.has(w.id) || alreadyInAgenda.has(w.title.toLowerCase());

  const doImport = () => {
    const toAdd = openTopics
      .filter((w) => importSel.has(w.id))
      .map((w) => ({ id: uid(), title: w.title, notes: w.notes || '', status: 'discuss' as const, source_item_id: w.id }));
    setA([...agenda, ...toAdd]);
    setShowImport(false);
    setImportSel(new Set());
  };

  const addAgendaItem = () => setA([...agenda, { id: uid(), title: '', notes: '', status: 'discuss' }]);
  const addAction = (owner: 'me' | 'them' = 'me') =>
    setAc([...actions, { id: uid(), title: '', owner, due: '', done: false, pushed: false }]);

  // Busy guard so a double-tap (common on iPad, before the optimistic state has
  // re-rendered) can't insert every action twice.
  const pushing = useRef(false);
  const pushAllToTasks = async () => {
    if (pushing.current) return;
    // Read from the ref, not the render closure, so we see actions filed by a
    // concurrent edit that hasn't re-rendered yet.
    const toPush = actionsRef.current.filter((a) => !a.pushed && a.title.trim());
    if (toPush.length === 0) return;
    pushing.current = true;
    // For a 1:1, the meeting person owns the action unless it names someone
    // else; for a group meeting there's no default owner. Either way the
    // action's due date and explicit owner are preserved by buildTaskFromAction.
    const defaultTarget: PushTarget | null = isGroupMeeting
      ? null
      : { id: person.id, type: 'person', name: person.name };
    try {
      for (const a of toPush) {
        await insert('work_items', buildTaskFromAction(a, title, defaultTarget) as Partial<WorkItem>);
      }
      const pushedIds = new Set(toPush.map((a) => a.id));
      // Only mark the actions we actually pushed; merge against the freshest
      // state via the functional updater to preserve concurrent edits.
      setActions((prev) => prev.map((a) => (pushedIds.has(a.id) ? { ...a, pushed: true } : a)));
      scheduleSave();
      logActivity('push_meeting_tasks', `${toPush.length} actions from ${title}`);
    } finally {
      pushing.current = false;
    }
  };

  const sending = useRef<Set<string>>(new Set());
  const onSendAction = async (action: ActionItem, targets: PushTarget[]) => {
    if (sending.current.has(action.id)) return;
    sending.current.add(action.id);
    try {
      for (const t of targets) {
        await insert('work_items', buildTaskFromAction(action, title, t) as Partial<WorkItem>);
      }
      const names = targets.map((t) => t.name).join(', ');
      setActions((prev) => prev.map((a) => (a.id === action.id ? { ...a, pushed: true, pushed_to: names } : a)));
      scheduleSave();
    } finally {
      sending.current.delete(action.id);
    }
  };

  const markCarryForwardDone = (cfAction: ActionItem, done: boolean) => {
    if (!prevMeeting) return;
    // Re-read the freshest body for the previous note and preserve its
    // forward-compat keys so this targeted write can't clobber other fields.
    const fresh = allMeetings.find((m) => m.id === prevMeeting.id) ?? prevMeeting;
    const { data: prev, raw } = parseMeeting(fresh.body);
    const updated = prev.actions.map((a) => (a.id === cfAction.id ? { ...a, done } : a));
    update('notes', prevMeeting.id, {
      body: serializeMeeting({ ...prev, actions: updated }, raw),
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

  const [actionsOpen, setActionsOpen] = useState(actions.length > 0 || carryForward.length > 0);

  // Filtered people and projects for the send picker
  const pickerPeople = data.people.filter((p) => !p.type || p.type === 'person');
  const pickerProjects = data.projects.filter((p) => !p.deleted_at);

  return createPortal(
    <>
    <div className="mtg-overlay" onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}>
      <div className="mtg-modal mtg-modal-structured">

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
            <button className={`btn btn-secondary btn-sm${showPrep ? ' btn-active' : ''}`}
              onClick={() => setShowPrep((s) => !s)} title="Meeting prep brief">✦ Prep</button>
            <button className="btn btn-secondary btn-sm" onClick={pushAllToTasks}
              title="Create tasks in your system for all action items">→ Push to Tasks</button>
            <button className="btn btn-share btn-sm" onClick={() => setShowShare(true)}>📤 Share</button>
            <button className="btn btn-danger btn-sm" onClick={deleteNote}>Delete</button>
            <button className="btn btn-primary btn-sm" onClick={handleClose}>Save &amp; Close</button>
          </div>
        </div>

        {/* Full-width agenda */}
        <div className="mtg-agenda-section">
          <div className="mtg-col-hdr">
            <span className="mtg-col-title">📋 Agenda</span>
            {!isGroupMeeting && (
              <button className="btn btn-secondary btn-sm" onClick={() => setShowImport((s) => !s)}>
                Import Topics ↓
              </button>
            )}
          </div>

          {!isGroupMeeting && showImport && (
            <div className="mtg-import-panel">
              {openTopics.length === 0
                ? <p style={{ fontSize: 13, color: 'var(--text3)', padding: 8 }}>No open action items for {person.name.split(' ')[0]}.</p>
                : <>
                  <div className="mtg-import-list">
                    {openTopics.map((w) => {
                      const already = isAlreadyImported(w);
                      return (
                        <label key={w.id} className="mtg-import-row">
                          <input type="checkbox" checked={importSel.has(w.id)}
                            disabled={already}
                            onChange={() => setImportSel((s) => {
                              const n = new Set(s);
                              if (n.has(w.id)) { n.delete(w.id); } else { n.add(w.id); }
                              return n;
                            })} />
                          <span style={{ fontSize: 13, opacity: already ? 0.4 : 1 }}>
                            {w.title}
                            {already && <em style={{ fontSize: 11, color: 'var(--text3)' }}> (already in agenda)</em>}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                  <div style={{ display: 'flex', gap: 6, padding: '8px 12px', justifyContent: 'flex-end' }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => setShowImport(false)}>Cancel</button>
                    <button className="btn btn-primary btn-sm" onClick={doImport}
                      disabled={importSel.size === 0}>Add {importSel.size} item{importSel.size !== 1 ? 's' : ''}</button>
                  </div>
                </>}
            </div>
          )}

          {agenda.length === 0 && deferredAgenda.length === 0 && !showImport && (
            <p className="mtg-empty-hint">Add agenda items below, or import from Topics ↑</p>
          )}
          {agenda.map((item, i) => {
            const srcTask = item.source_item_id
              ? data.work_items.find((w) => w.id === item.source_item_id)
              : undefined;
            return (
              <AgendaItemRow key={item.id} item={item}
                onChange={(updated) => setA(agenda.map((a, j) => j === i ? updated : a))}
                onDelete={() => setA(agenda.filter((_, j) => j !== i))}
                taskDone={srcTask?.done}
                onCloseTask={srcTask && !srcTask.done ? () => {
                  update('work_items', srcTask.id, { done: true, completed_at: new Date().toISOString() } as Partial<WorkItem>);
                } : undefined}
              />
            );
          })}

          {deferredAgenda.length > 0 && (
            <>
              <div className="mtg-section-sep">
                ⏭ Deferred from {prevMeeting ? fmtDM(dates[prevMeeting.id] || prevMeeting.created_at) : 'last meeting'}
              </div>
              {deferredAgenda.map((item) => (
                <DeferredAgendaRow
                  key={item.id}
                  item={item}
                  alreadyAdded={agenda.some((a) => a.title.toLowerCase() === item.title.toLowerCase())}
                  onAdd={() => addDeferredToAgenda(item)}
                />
              ))}
            </>
          )}

          <button className="mtg-add-row" onClick={addAgendaItem}>+ Add agenda item</button>
        </div>

        {/* Collapsible actions panel */}
        <div className="mtg-actions-panel">
          <button className="mtg-actions-panel-hdr" onClick={() => setActionsOpen((v) => !v)}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className={`mtg-actions-panel-chevron${actionsOpen ? ' open' : ''}`}>▼</span>
              <span className="mtg-actions-panel-title">
                ✅ Action Items{(actions.length + carryForward.length) > 0 ? ` (${actions.filter(a => !a.done).length + carryForward.length})` : ''}
              </span>
            </div>
            <div className="mtg-action-add-row" onClick={(e) => e.stopPropagation()}>
              <button className="mtg-add-row" onClick={() => { setActionsOpen(true); addAction('me'); }}>+ For me</button>
              <button className="mtg-add-row" onClick={() => { setActionsOpen(true); addAction('them'); }}>
                {isGroupMeeting ? '+ For others' : `+ For ${person.name.split(' ')[0]}`}
              </button>
            </div>
          </button>

          {actionsOpen && (
            <div className="mtg-actions-panel-body">
              {actions.length === 0 && carryForward.length === 0 && (
                <p className="mtg-empty-hint">Actions agreed in this meeting appear here.</p>
              )}
              {actions.map((item, i) => (
                <ActionItemRow key={item.id} item={item} personName={person.name}
                  isGroupMeeting={isGroupMeeting}
                  people={pickerPeople}
                  projects={pickerProjects}
                  onSend={(targets) => onSendAction(item, targets)}
                  onChange={(updated) => setAc(actions.map((a, j) => j === i ? updated : a))}
                  onDelete={() => setAc(actions.filter((_, j) => j !== i))} />
              ))}

              {carryForward.length > 0 && (
                <>
                  <div className="mtg-section-sep">
                    Carry-forward · {prevMeeting ? fmtDM(dates[prevMeeting.id] || prevMeeting.created_at) : 'last meeting'}
                  </div>
                  {carryForward.map((cf) => (
                    <CarryForwardRow key={cf.id} item={cf} personName={person.name}
                      onMarkDone={(done) => markCarryForwardDone(cf, done)} />
                  ))}
                </>
              )}
            </div>
          )}
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

    {showPrep && (
      <PrepBriefPanel
        person={person}
        agenda={agenda}
        carryForward={carryForward}
        deferredAgenda={deferredAgenda}
        workItems={data.work_items}
        projects={data.projects}
        projectUpdates={data.project_updates}
        onAddToAgenda={(items) => setA([...agenda, ...items])}
        onClose={() => setShowPrep(false)}
      />
    )}
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
