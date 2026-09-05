import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { fmtDM, fmtWeekDMY, fmtDMY } from '../lib/util';
import { useCadence } from '../lib/store';
import type { Note, Person, WorkItem } from '../lib/types';
import { RichEditor } from './RichEditor';
import { NoteSharePanel } from './NoteSharePanel';
import { TopicsPanel } from './TopicsPanel';
import { useMeetingDates } from '../lib/meetings';
import { meetingDocHtml, meetingDocumentBody, meetingPreviewText } from '../lib/meetingDoc';
import { htmlIsEmpty } from '../lib/richText';
import { Due, PriTag, TypeTag } from './bits';
import { ItemModal } from './ItemModal';
import {
  buildMeetingActionPayload,
  getMeetingCommitments,
  meetingActionClientId,
  type MeetingActionDirection,
} from '../lib/meetingContinuity';
import './MeetingDocModal.css';

interface Props {
  note: Note;
  person: Person;
  allMeetings: Note[];
  onClose: () => void;
  onNavigate: (noteId: string) => void;
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'failed';

const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

function CommitmentRow({ item, label, onEdit }: { item: WorkItem; label: string; onEdit: (item: WorkItem) => void }) {
  const { update } = useCadence();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    setErr('');
    try {
      await update('work_items', item.id, {
        done: !item.done,
        completed_at: !item.done ? new Date().toISOString() : null,
      } as Partial<WorkItem>, { strict: true });
    } catch (error) {
      setErr(`Could not update commitment — ${String((error as Error)?.message || 'try again')}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="meeting-commitment-row">
      <input aria-label={`Complete ${item.title}`} type="checkbox" checked={item.done} disabled={busy} onChange={() => void toggle()} />
      <button type="button" className="meeting-commitment-body" onClick={() => onEdit(item)}>
        <span className="meeting-commitment-title">{item.title}</span>
        <span className="meeting-commitment-tags">
          <span className="tag tag-note-link">{label}</span>
          <TypeTag type={item.type} />
          <PriTag priority={item.priority} />
          <Due date={item.due_date} />
          {item.source?.startsWith('for:') && <span className="tag tag-info">Delegated</span>}
          {err && <span className="meeting-inline-error">{err}</span>}
        </span>
      </button>
      <button className="btn btn-ghost btn-sm" onClick={() => onEdit(item)}>Edit</button>
    </div>
  );
}

export function MeetingDocModal({ note, person, allMeetings, onClose, onNavigate }: Props) {
  const { data, update, insert, remove, logActivity } = useCadence();
  const { dates, setMeetingDate } = useMeetingDates();
  const isGroupMeeting = person.type === 'meeting_group';

  const [title, setTitle] = useState(note.title);
  const [meetingDate, setLocalMeetingDate] = useState(dates[note.id] || '');
  const [dateErr, setDateErr] = useState('');
  const [titleErr, setTitleErr] = useState('');
  const [showShare, setShowShare] = useState(false);
  const [showTopics, setShowTopics] = useState(false);
  const [editorEpoch, setEditorEpoch] = useState(0);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [saveError, setSaveError] = useState('');
  const [editingItem, setEditingItem] = useState<WorkItem | null>(null);

  // ── Reliable document save ──────────────────────────────────────────────────
  // Strict writes mean this modal only says "saved" after Supabase acknowledges.
  // Saves are serialized, and if Rodney keeps typing while one is in flight the
  // loop immediately writes the newer revision before close/navigation proceeds.
  const htmlRef = useRef(meetingDocHtml(note.body));
  const sourceBodyRef = useRef(note.body);
  const noteIdRef = useRef(note.id);
  const lastSeenRef = useRef(note.updated_at);
  const dateDirtyRef = useRef(false);
  const dirtyRevisionRef = useRef(0);
  const savedRevisionRef = useRef(0);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveChainRef = useRef<Promise<boolean>>(Promise.resolve(true));
  const mountedRef = useRef(true);

  const runSaveLoop = useCallback(async (): Promise<boolean> => {
    while (savedRevisionRef.current < dirtyRevisionRef.current) {
      const revision = dirtyRevisionRef.current;
      const body = meetingDocumentBody(sourceBodyRef.current, htmlRef.current);
      setSaveStatus('saving');
      setSaveError('');
      try {
        const row = await update('notes', noteIdRef.current, { body } as Partial<Note>, { strict: true });
        const ts = (row as Note | undefined)?.updated_at;
        if (typeof ts === 'string' && ts > lastSeenRef.current) lastSeenRef.current = ts;
        savedRevisionRef.current = revision;
        if (mountedRef.current) setSaveStatus('saved');
      } catch (error) {
        if (mountedRef.current) {
          setSaveStatus('failed');
          setSaveError(String((error as Error)?.message || error || 'Save failed'));
        }
        return false;
      }
    }
    return true;
  }, [update]);

  const flushSave = useCallback((): Promise<boolean> => {
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
    if (savedRevisionRef.current >= dirtyRevisionRef.current) return Promise.resolve(true);
    saveChainRef.current = saveChainRef.current.then(runSaveLoop, runSaveLoop);
    return saveChainRef.current;
  }, [runSaveLoop]);

  const onBodyChange = (html: string) => {
    htmlRef.current = html;
    dirtyRevisionRef.current += 1;
    setSaveStatus('idle');
    setSaveError('');
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { void flushSave(); }, 600);
  };

  useEffect(() => {
    if (noteIdRef.current === note.id) return;
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
    htmlRef.current = meetingDocHtml(note.body);
    sourceBodyRef.current = note.body;
    noteIdRef.current = note.id;
    lastSeenRef.current = note.updated_at;
    dateDirtyRef.current = false;
    dirtyRevisionRef.current = 0;
    savedRevisionRef.current = 0;
    saveChainRef.current = Promise.resolve(true);
    setTitle(note.title);
    setSaveStatus('idle');
    setSaveError('');
    setTitleErr('');
    setEditorEpoch((e) => e + 1);
  }, [note.id, note.body, note.title, note.updated_at]);

  // Adopt a strictly-newer remote body while clean; never overwrite a dirty draft.
  useEffect(() => {
    if (dirtyRevisionRef.current !== savedRevisionRef.current || saveStatus === 'saving') return;
    if (!note.updated_at || note.updated_at <= lastSeenRef.current) return;
    lastSeenRef.current = note.updated_at;
    sourceBodyRef.current = note.body;
    htmlRef.current = meetingDocHtml(note.body);
    setEditorEpoch((e) => e + 1);
  }, [note.body, note.updated_at, saveStatus]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      void flushSave();
    };
  }, [flushSave]);

  useEffect(() => {
    if (!dateDirtyRef.current) setLocalMeetingDate(dates[note.id] || '');
  }, [dates, note.id]);

  const updateMeetingDate = async (date: string) => {
    setLocalMeetingDate(date);
    dateDirtyRef.current = true;
    setDateErr('');
    const prefix = isGroupMeeting ? `${person.name} · ` : `1:1 · ${person.name} · `;
    let titleToSave: string | null = null;
    if (date && title.startsWith(prefix)) {
      const suffix = title.slice(prefix.length);
      if (suffix === '' || /^\d{2}\/\d{2}\/\d{4}$/.test(suffix)) {
        titleToSave = `${prefix}${fmtDMY(date)}`;
        setTitle(titleToSave);
      }
    }
    try {
      if (titleToSave) await update('notes', note.id, { title: titleToSave } as Partial<Note>, { strict: true });
      await setMeetingDate(note.id, date || null);
      dateDirtyRef.current = false;
    } catch {
      setDateErr('Could not save date — check connection');
    }
  };

  const saveTitle = async () => {
    const nextTitle = title.trim() || note.title;
    setTitleErr('');
    if (nextTitle !== title) setTitle(nextTitle);
    try {
      await update('notes', note.id, { title: nextTitle } as Partial<Note>, { strict: true });
    } catch {
      setTitleErr('Could not save title — check connection');
    }
  };

  const deleteNote = async () => {
    if (!confirm('Delete this meeting note?')) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    dirtyRevisionRef.current = savedRevisionRef.current;
    try { await setMeetingDate(note.id, null); } catch { /* best-effort cleanup */ }
    await remove('notes', note.id);
    onClose();
  };

  // ── Meeting continuity: canonical work_items, not note-local action JSON ────
  const commitments = useMemo(() => getMeetingCommitments(data.work_items, person.id), [data.work_items, person.id]);
  const personFirst = firstName(person.name);
  const previousMeetings = useMemo(
    () => {
      const currentDate = (dates[note.id] || note.created_at).slice(0, 10);
      return allMeetings
        .filter((m) => m.id !== note.id && (dates[m.id] || m.created_at).slice(0, 10) < currentDate)
        .sort((a, b) => (dates[b.id] || b.created_at).slice(0, 10).localeCompare((dates[a.id] || a.created_at).slice(0, 10)))
        .slice(0, 5);
    },
    [allMeetings, note.id, note.created_at, dates],
  );

  // ── Inline action capture ───────────────────────────────────────────────────
  const participants = useMemo(
    () => data.people.filter((p) => (!p.type || p.type === 'person') && !p.deleted_at).sort((a, b) => a.name.localeCompare(b.name)),
    [data.people],
  );
  const [actionDraft, setActionDraft] = useState('');
  const actionDraftRef = useRef('');
  const actionIdRef = useRef<string | null>(null);
  const captureBusyRef = useRef(false);
  const [captureBusy, setCaptureBusy] = useState(false);
  const [captureError, setCaptureError] = useState('');
  const [actionDue, setActionDue] = useState('');
  const [selectedPersonId, setSelectedPersonId] = useState('');
  const [captured, setCaptured] = useState<{ title: string; dest: MeetingActionDirection }[]>([]);

  const updateDraft = (value: string) => {
    actionDraftRef.current = value;
    setActionDraft(value);
    setCaptureError('');
    if (!value.trim()) actionIdRef.current = null;
    else if (!actionIdRef.current) actionIdRef.current = meetingActionClientId();
  };

  const selectedCounterparty = isGroupMeeting
    ? participants.find((p) => p.id === selectedPersonId) || null
    : person;

  const captureAction = async (direction: MeetingActionDirection) => {
    if (captureBusyRef.current) return;
    const t = actionDraftRef.current.trim();
    if (!t) return;
    if (direction !== 'inbox' && !selectedCounterparty) {
      setCaptureError('Choose who owns this action first.');
      return;
    }
    const id = actionIdRef.current || meetingActionClientId();
    actionIdRef.current = id;
    captureBusyRef.current = true;
    setCaptureBusy(true);
    setCaptureError('');
    try {
      const payload = buildMeetingActionPayload({
        id,
        title: t,
        direction,
        dueDate: actionDue,
        counterparty: direction === 'inbox' ? selectedCounterparty : selectedCounterparty,
        meetingHost: person,
        note: { id: note.id, title: title || note.title },
      });
      await insert('work_items', payload as Partial<WorkItem>, { strict: true });
      setCaptured((c) => [...c, { title: t, dest: direction }]);
      setActionDue('');
      const current = actionDraftRef.current;
      if (current.trim() === t) {
        actionDraftRef.current = '';
        setActionDraft('');
        actionIdRef.current = null;
      } else {
        actionIdRef.current = meetingActionClientId();
      }
      void logActivity(direction === 'inbox' ? 'meeting_capture_inbox' : 'meeting_capture_action', t);
    } catch (error) {
      setCaptureError(`Capture failed — ${String((error as Error)?.message || 'try again')}`);
    } finally {
      captureBusyRef.current = false;
      setCaptureBusy(false);
    }
  };

  const handleClose = async () => {
    const ok = await flushSave();
    if (ok) onClose();
  };
  const handleNavigate = async (id: string) => {
    const ok = await flushSave();
    if (ok) onNavigate(id);
  };
  const handleShare = async () => {
    const ok = await flushSave();
    if (ok) setShowShare(true);
  };

  const idx = allMeetings.findIndex((m) => m.id === note.id);
  const prevNote = idx < allMeetings.length - 1 ? allMeetings[idx + 1] : null;
  const nextNote = idx > 0 ? allMeetings[idx - 1] : null;
  const saveLabel = saveStatus === 'saving' ? 'Saving…' : saveStatus === 'failed' ? 'Save failed' : saveStatus === 'saved' ? 'Saved' : 'Not saved yet';

  return createPortal(
    <>
      <div className="mtg-overlay" onClick={(e) => { if (e.target === e.currentTarget) void handleClose(); }}>
        <div className="mtg-modal mtg-modal-doc">

          <div className="mtg-hdr">
            <div className="mtg-hdr-left">
              <span className="avatar" style={{ background: person.color || '#3A7CA5', width: 40, height: 40, fontSize: 14 }}>
                {person.name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('')}
              </span>
              <div>
                <div className="mtg-person-chip">{person.name}</div>
                <input className="mtg-title-input" value={title}
                  onChange={(e) => { setTitle(e.target.value); setTitleErr(''); }} onBlur={() => { void saveTitle(); }} />
                <div className="mtg-date">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
                      <span style={{ color: meetingDate ? 'var(--accent)' : 'var(--text3)', fontSize: 12, fontWeight: 600, pointerEvents: 'none' }}>
                        📅 {meetingDate ? fmtWeekDMY(meetingDate) : 'Set date…'}
                      </span>
                      <input type="date" value={meetingDate}
                        onChange={(e) => updateMeetingDate(e.target.value)}
                        style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%' }} />
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--text3)' }}>· shows on Home</span>
                  </div>
                  {dateErr && <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 3, lineHeight: 1.4 }}>{dateErr}</div>}
                </div>
              </div>
            </div>
            <div className="mtg-hdr-right">
              <span className={`meeting-save-status meeting-save-status-${saveStatus}`}>{saveLabel}</span>
              {isGroupMeeting && (
                <button className={`btn btn-secondary btn-sm${showTopics ? ' btn-active' : ''}`}
                  onClick={() => setShowTopics((s) => !s)}>Topics ↓</button>
              )}
              <button className="btn btn-share btn-sm" onClick={() => { void handleShare(); }}>📤 Share</button>
              <button className="btn btn-danger btn-sm" onClick={deleteNote}>Delete</button>
              <button className="btn btn-primary btn-sm" disabled={saveStatus === 'saving'} onClick={() => { void handleClose(); }}>Save &amp; Close</button>
            </div>
          </div>
          {saveError && <div className="meeting-error">Save failed — {saveError}</div>}
          {titleErr && <div className="meeting-error">{titleErr}</div>}

          {isGroupMeeting && showTopics && (
            <div className="mtg-import-panel">
              <TopicsPanel group={person} />
            </div>
          )}

          {commitments.all.length > 0 && (
            <div className="meeting-continuity-panel">
              <h3>Open commitments</h3>
              {commitments.iOwe.length > 0 && (
                <div className="meeting-commitment-group">
                  <div className="meeting-commitment-heading">I owe {personFirst}</div>
                  {commitments.iOwe.map((w) => <CommitmentRow key={w.id} item={w} label={`I owe ${personFirst}`} onEdit={setEditingItem} />)}
                </div>
              )}
              {commitments.theyOwe.length > 0 && (
                <div className="meeting-commitment-group">
                  <div className="meeting-commitment-heading">{personFirst} owes me</div>
                  {commitments.theyOwe.map((w) => <CommitmentRow key={w.id} item={w} label={`${personFirst} owes me`} onEdit={setEditingItem} />)}
                </div>
              )}
            </div>
          )}

          {previousMeetings.length > 0 && (
            <div className="meeting-history-panel">
              <h3>Previous meeting context</h3>
              <div className="meeting-history-list">
                {previousMeetings.map((m) => (
                  <button key={m.id} className="meeting-history-card" onClick={() => { void handleNavigate(m.id); }}>
                    <span>{fmtDM(dates[m.id] || m.created_at)}</span>
                    <strong>{m.title}</strong>
                    <small>{meetingPreviewText(m.body).slice(0, 120) || 'Empty note'}</small>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mtg-doc-body">
            <RichEditor
              key={`${note.id}:${editorEpoch}`}
              content={htmlRef.current}
              onChange={onBodyChange}
              onBlur={() => { void flushSave(); }}
              placeholder="Write the meeting like a page — headings, bullets, whatever you need. Capture tasks below as they come up."
            />
          </div>

          <div className="mtg-capture-bar meeting-action-capture">
            <span className="mtg-capture-icon">◎</span>
            {isGroupMeeting && (
              <select aria-label="Action owner" className="meeting-action-owner" value={selectedPersonId} onChange={(e) => setSelectedPersonId(e.target.value)}>
                <option value="">Who?</option>
                {participants.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            )}
            <input
              className="mtg-capture-input"
              value={actionDraft}
              placeholder="Capture a task from this meeting…"
              onChange={(e) => updateDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void captureAction('inbox'); }}
            />
            <input aria-label="Action due date" className="meeting-action-due" type="date" value={actionDue} onChange={(e) => setActionDue(e.target.value)} />
            <button className="btn btn-secondary btn-sm" disabled={!actionDraft.trim() || captureBusy || (isGroupMeeting && !selectedCounterparty)}
              onClick={() => void captureAction('iOwe')}>
              📥 I owe {isGroupMeeting ? '' : personFirst}
            </button>
            <button className="btn btn-secondary btn-sm" disabled={!actionDraft.trim() || captureBusy || (isGroupMeeting && !selectedCounterparty)}
              onClick={() => void captureAction('theyOwe')}>
              📤 {isGroupMeeting ? 'They owe me' : `Give to ${personFirst}`}
            </button>
            <button className="btn btn-primary btn-sm" disabled={!actionDraft.trim() || captureBusy} onClick={() => void captureAction('inbox')}>
              + Rough → Inbox
            </button>
          </div>
          {captureError && <div className="meeting-error">{captureError}</div>}
          {captured.length > 0 && (
            <div className="mtg-captured-row">
              {captured.map((c, i) => (
                <span key={`${c.title}:${i}`} className="mtg-captured-chip">
                  {c.dest === 'theyOwe' ? '📤' : c.dest === 'iOwe' ? '📥' : '✓'} {c.title}
                </span>
              ))}
            </div>
          )}

          <div className="mtg-footer">
            <div className="mtg-footer-nav">
              {prevNote && (
                <button className="btn btn-secondary btn-sm" onClick={() => { void handleNavigate(prevNote.id); }}>
                  ← {fmtDM(dates[prevNote.id] || prevNote.created_at)}
                </button>
              )}
              {nextNote && (
                <button className="btn btn-secondary btn-sm" onClick={() => { void handleNavigate(nextNote.id); }}>
                  {fmtDM(dates[nextNote.id] || nextNote.created_at)} →
                </button>
              )}
            </div>
            <button className="btn btn-primary mtg-footer-close" disabled={saveStatus === 'saving'} onClick={() => { void handleClose(); }}>Save &amp; Close</button>
          </div>
        </div>
      </div>

      {showShare && (
        <NoteSharePanel
          note={{ ...note, title: title || note.title, body: htmlIsEmpty(htmlRef.current) ? '' : htmlRef.current }}
          onClose={() => setShowShare(false)}
        />
      )}
      {editingItem && <ItemModal existing={editingItem} onClose={() => setEditingItem(null)} />}
    </>,
    document.body
  );
}
