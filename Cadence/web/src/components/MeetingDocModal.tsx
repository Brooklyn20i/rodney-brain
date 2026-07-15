import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { fmtDM, fmtWeekDMY, fmtDMY } from '../lib/util';
import { useCadence } from '../lib/store';
import type { Note, Person, WorkItem } from '../lib/types';
import { RichEditor } from './RichEditor';
import { NoteSharePanel } from './NoteSharePanel';
import { TopicsPanel } from './TopicsPanel';
import { useMeetingDates } from '../lib/meetings';
import { meetingDocHtml } from '../lib/meetingDoc';
import { htmlIsEmpty } from '../lib/richText';

// A meeting is a DOCUMENT — one rich-text page (the same writing surface as
// Notes), a date, and a capture row that sends tasks straight to the Inbox for
// triage. No agenda machinery, no action splitting: the ledger is the system
// of record for who owes whom; this is where the content gets written down.
// Legacy structured meetings (the old agenda template) convert to a readable
// document on open and stay that way after the first edit.
interface Props {
  note: Note;
  person: Person;
  allMeetings: Note[];
  onClose: () => void;
  onNavigate: (noteId: string) => void;
}

export function MeetingDocModal({ note, person, allMeetings, onClose, onNavigate }: Props) {
  const { update, insert, remove, logActivity } = useCadence();
  const { dates, setMeetingDate } = useMeetingDates();
  const isGroupMeeting = person.type === 'meeting_group';

  const [title, setTitle] = useState(note.title);
  const [meetingDate, setLocalMeetingDate] = useState(dates[note.id] || '');
  const [dateErr, setDateErr] = useState('');
  const [showShare, setShowShare] = useState(false);
  const [showTopics, setShowTopics] = useState(false);
  const [editorEpoch, setEditorEpoch] = useState(0);

  // ── Document body: dirty-guarded save, adopt-remote-when-clean ─────────────
  // Same discipline as Notes: a clean instance never writes (so a stale open
  // modal can't clobber another device), and only strictly-newer remote
  // versions are adopted, via an editor remount.
  const htmlRef = useRef(meetingDocHtml(note.body));
  const dirtyRef = useRef(false);
  const savingRef = useRef(false);
  const lastSeenRef = useRef(note.updated_at);
  const noteIdRef = useRef(note.id);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushSave = useCallback(() => {
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
    if (!dirtyRef.current) return;
    dirtyRef.current = false;
    savingRef.current = true;
    void update('notes', noteIdRef.current, { body: htmlRef.current } as Partial<Note>)
      .then((row) => {
        const ts = (row as Note | undefined)?.updated_at;
        if (typeof ts === 'string' && ts > lastSeenRef.current) lastSeenRef.current = ts;
      })
      .catch(() => {})
      .finally(() => { savingRef.current = false; });
  }, [update]);

  const onBodyChange = (html: string) => {
    htmlRef.current = html;
    dirtyRef.current = true;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(flushSave, 600);
  };

  // Reset when navigating between meetings.
  useEffect(() => {
    htmlRef.current = meetingDocHtml(note.body);
    dirtyRef.current = false;
    lastSeenRef.current = note.updated_at;
    noteIdRef.current = note.id;
    setTitle(note.title);
    setEditorEpoch((e) => e + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.id]);

  // Adopt a strictly-newer remote body while clean.
  useEffect(() => {
    if (dirtyRef.current || savingRef.current) return;
    if (!note.updated_at || note.updated_at <= lastSeenRef.current) return;
    lastSeenRef.current = note.updated_at;
    htmlRef.current = meetingDocHtml(note.body);
    setEditorEpoch((e) => e + 1);
  }, [note.body, note.updated_at]);

  // Flush pending edits on unmount so Save & Close never loses typing.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => { flushSave(); }, []);

  useEffect(() => { setLocalMeetingDate(dates[note.id] || ''); }, [dates, note.id]);

  const updateMeetingDate = async (date: string) => {
    setLocalMeetingDate(date);
    setDateErr('');
    // Auto-refresh the title only while it's still the auto-generated form.
    const prefix = isGroupMeeting ? `${person.name} · ` : `1:1 · ${person.name} · `;
    if (date && title.startsWith(prefix)) {
      const suffix = title.slice(prefix.length);
      if (suffix === '' || /^\d{2}\/\d{2}\/\d{4}$/.test(suffix)) {
        const newTitle = `${prefix}${fmtDMY(date)}`;
        setTitle(newTitle);
        update('notes', note.id, { title: newTitle } as Partial<Note>);
      }
    }
    try { await setMeetingDate(note.id, date || null); }
    catch { setDateErr('Could not save date — check connection'); }
  };

  const saveTitle = () => update('notes', note.id, { title: title.trim() || note.title } as Partial<Note>);

  const deleteNote = async () => {
    if (!confirm('Delete this meeting note?')) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    dirtyRef.current = false;
    try { await setMeetingDate(note.id, null); } catch { /* best-effort cleanup */ }
    await remove('notes', note.id);
    onClose();
  };

  // ── Inline task capture ─────────────────────────────────────────────────────
  // Two destinations mid-meeting:
  //  'inbox' — capture-first: waits in the Inbox for the triage wizard.
  //  'give'  — 1:1s only: straight onto this person's ledger as something THEY
  //            OWE ME, no Inbox round-trip. Both carry the meeting provenance.
  const [taskDraft, setTaskDraft] = useState('');
  const [captured, setCaptured] = useState<{ title: string; dest: 'inbox' | 'give' }[]>([]);
  const captureTask = async (dest: 'inbox' | 'give' = 'inbox') => {
    const t = taskDraft.trim();
    if (!t) return;
    const give = dest === 'give' && !isGroupMeeting;
    try {
      await insert('work_items', {
        title: t, type: give ? 'waitingFor' : 'task', priority: 'medium', notes: '',
        inboxed: !give, source: 'you',
        person_id: person.id,
        related_entities: [
          { type: 'person', id: person.id, name: person.name },
          { type: 'note', id: note.id, name: title || note.title },
        ],
      } as Partial<WorkItem>);
      setCaptured((c) => [...c, { title: t, dest: give ? 'give' : 'inbox' }]);
      setTaskDraft(''); // clear only after the save succeeds
      logActivity(give ? 'meeting_give_task' : 'meeting_capture_task', t);
    } catch { /* error surfaces via the sync banner; draft stays for retry */ }
  };

  const handleClose = () => { flushSave(); onClose(); };
  const handleNavigate = (id: string) => { flushSave(); onNavigate(id); };

  // Prev/next between this person's meetings (allMeetings is upcoming→past).
  const idx = allMeetings.findIndex((m) => m.id === note.id);
  const prevNote = idx < allMeetings.length - 1 ? allMeetings[idx + 1] : null;
  const nextNote = idx > 0 ? allMeetings[idx - 1] : null;

  return createPortal(
    <>
      <div className="mtg-overlay" onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}>
        <div className="mtg-modal mtg-modal-doc">

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
              {isGroupMeeting && (
                <button className={`btn btn-secondary btn-sm${showTopics ? ' btn-active' : ''}`}
                  onClick={() => setShowTopics((s) => !s)}>Topics ↓</button>
              )}
              <button className="btn btn-share btn-sm" onClick={() => { flushSave(); setShowShare(true); }}>📤 Share</button>
              <button className="btn btn-danger btn-sm" onClick={deleteNote}>Delete</button>
              <button className="btn btn-primary btn-sm" onClick={handleClose}>Save &amp; Close</button>
            </div>
          </div>

          {isGroupMeeting && showTopics && (
            <div className="mtg-import-panel">
              <TopicsPanel group={person} />
            </div>
          )}

          {/* The document */}
          <div className="mtg-doc-body">
            <RichEditor
              key={`${note.id}:${editorEpoch}`}
              content={htmlRef.current}
              onChange={onBodyChange}
              onBlur={() => flushSave()}
              placeholder="Write the meeting like a page — headings, bullets, whatever you need. Capture tasks below as they come up."
            />
          </div>

          {/* Task capture → Inbox */}
          <div className="mtg-capture-bar">
            <span className="mtg-capture-icon">◎</span>
            <input
              className="mtg-capture-input"
              value={taskDraft}
              placeholder={isGroupMeeting
                ? 'Capture a task — lands in your Inbox to triage later…'
                : `Capture a task — Inbox, or straight to ${person.name.split(' ')[0]}…`}
              onChange={(e) => setTaskDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void captureTask('inbox'); }}
            />
            {!isGroupMeeting && (
              <button className="btn btn-secondary btn-sm" disabled={!taskDraft.trim()}
                title={`Straight onto ${person.name.split(' ')[0]}'s ledger — they owe you this`}
                onClick={() => void captureTask('give')}>
                📤 Give to {person.name.split(' ')[0]}
              </button>
            )}
            <button className="btn btn-primary btn-sm" disabled={!taskDraft.trim()} onClick={() => void captureTask('inbox')}>
              + Task → Inbox
            </button>
          </div>
          {captured.length > 0 && (
            <div className="mtg-captured-row">
              {captured.map((c, i) => (
                <span key={i} className="mtg-captured-chip"
                  title={c.dest === 'give' ? `On ${person.name.split(' ')[0]}'s ledger` : 'Captured to the Inbox'}>
                  {c.dest === 'give' ? '📤' : '✓'} {c.title}
                </span>
              ))}
            </div>
          )}

          {/* Footer nav */}
          <div className="mtg-footer">
            <div className="mtg-footer-nav">
              {prevNote && (
                <button className="btn btn-secondary btn-sm" onClick={() => handleNavigate(prevNote.id)}>
                  ← {fmtDM(dates[prevNote.id] || prevNote.created_at)}
                </button>
              )}
              {nextNote && (
                <button className="btn btn-secondary btn-sm" onClick={() => handleNavigate(nextNote.id)}>
                  {fmtDM(dates[nextNote.id] || nextNote.created_at)} →
                </button>
              )}
            </div>
            <button className="btn btn-primary mtg-footer-close" onClick={handleClose}>Save &amp; Close</button>
          </div>
        </div>
      </div>

      {showShare && (
        <NoteSharePanel
          note={{ ...note, title: title || note.title, body: htmlIsEmpty(htmlRef.current) ? '' : htmlRef.current }}
          onClose={() => setShowShare(false)}
        />
      )}
    </>,
    document.body
  );
}
