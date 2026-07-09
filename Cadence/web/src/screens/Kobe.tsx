import { useEffect, useMemo, useRef, useState } from 'react';
import { useCadence } from '../lib/store';
import { ScreenHeader } from '../components/bits';
import { ItemModal } from '../components/ItemModal';
import type { AgentMessage, WorkItem } from '../lib/types';
import { fmtDM, fmtDMY } from '../lib/util';
import { sanitizeHtml } from '../lib/sanitize';

type Tab = 'ask_kobe' | 'for_kobe' | 'brief' | 'from_kobe' | 'activity';

const KOBE_RECIPIENT_KEY = 'agent:kobe';

const fmtAction = (s: string) =>
  s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export function Kobe({ onMenu }: { onMenu?: () => void }) {
  const { data, insert } = useCadence();
  const [modal, setModal] = useState<WorkItem | 'new' | null>(null);
  const [tab, setTab] = useState<Tab>('ask_kobe');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const kobeMessages = useMemo(
    () =>
      (data.agent_messages || [])
        .filter((m) => !m.deleted_at && m.recipient_key === KOBE_RECIPIENT_KEY)
        .sort((a, b) => (a.created_at || '').localeCompare(b.created_at || '')),
    [data.agent_messages],
  );

  useEffect(() => {
    if (tab === 'ask_kobe' && typeof bottomRef.current?.scrollIntoView === 'function') {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [kobeMessages.length, tab]);

  const contextChips = (m: AgentMessage) => {
    const chips: { key: string; label: string; className: string }[] = [];
    if (m.linked_work_item_id) {
      const item = data.work_items.find((w) => w.id === m.linked_work_item_id);
      chips.push({ key: `work-${m.linked_work_item_id}`, label: item?.title || 'Linked work', className: 'tag' });
    }
    if (m.linked_project_id) {
      const project = data.projects.find((p) => p.id === m.linked_project_id);
      chips.push({ key: `project-${m.linked_project_id}`, label: project?.name || 'Linked project', className: 'tag tag-project' });
    }
    if (m.linked_person_id) {
      const person = data.people.find((p) => p.id === m.linked_person_id);
      chips.push({ key: `person-${m.linked_person_id}`, label: person?.name || 'Linked person', className: 'tag tag-person' });
    }
    if (m.linked_note_id) {
      const note = data.notes.find((n) => n.id === m.linked_note_id);
      chips.push({ key: `note-${m.linked_note_id}`, label: note?.title || 'Linked note', className: 'tag' });
    }
    if (chips.length === 0) return null;
    return <div className="kobe-message-context">{chips.map((chip) => <span key={chip.key} className={chip.className}>{chip.label}</span>)}</div>;
  };

  const sendToKobe = async () => {
    const text = message.trim();
    if (!text || sending) return;
    setSending(true);
    setSendError(null);
    setMessage('');
    try {
      await insert('agent_messages', {
        sender_type: 'user',
        recipient_type: 'agent',
        recipient_key: KOBE_RECIPIENT_KEY,
        body: text,
        status: 'unread',
      } as Partial<AgentMessage>);
    } catch (e) {
      console.error('Ask Kobe send failed:', e);
      setSendError('Could not send to Kobe. Your draft has been restored — check your connection and try again.');
      setMessage(text);
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  };

  const kobeAssigned = useMemo(
    () =>
      data.work_items
        .filter((w) => w.source === 'for:kobe' && !w.done && !w.deleted_at)
        .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')),
    [data.work_items],
  );

  const kobeNotes = useMemo(
    () =>
      data.notes
        .filter((n) => (n.folder || '').startsWith('__kobe__') && n.folder !== '__kobe_inbox__' && n.folder !== '__kobe_reply__')
        .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || '')),
    [data.notes],
  );

  const kobeTasks = useMemo(
    () =>
      data.work_items
        .filter((w) => w.source === 'agent:kobe' && !w.done && !w.deleted_at)
        .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || '')),
    [data.work_items],
  );

  const kobeActivity = useMemo(
    () => data.activity.filter((a) => (a.actor || '').startsWith('agent:')),
    [data.activity],
  );

  const latestBrief = kobeNotes[0] ?? null;
  const olderNotes = kobeNotes.slice(1);

  const taskRow = (w: WorkItem) => {
    const person = w.person_id ? data.people.find((p) => p.id === w.person_id) : null;
    const project = w.project_id ? data.projects.find((p) => p.id === w.project_id) : null;
    return (
      <button key={w.id} className="kobe-task-row" onClick={() => setModal(w)}>
        <span className="kobe-task-title">{w.title}</span>
        <div className="kobe-task-meta">
          {person && <span className="tag tag-person">{person.name}</span>}
          {project && <span className="tag tag-project">{project.name}</span>}
          {w.due_date && <span className="kobe-task-due">{fmtDM(w.due_date)}</span>}
        </div>
      </button>
    );
  };

  return (
    <>
      <ScreenHeader title="Kobe" onMenu={onMenu} />
      <div className="kobe-screen">
        <div className="kobe-tabs">
          <button className={`kobe-tab${tab === 'ask_kobe' ? ' active' : ''}`} onClick={() => setTab('ask_kobe')}>
            Ask Kobe
          </button>
          <button className={`kobe-tab${tab === 'for_kobe' ? ' active' : ''}`} onClick={() => setTab('for_kobe')}>
            For Kobe
            {kobeAssigned.length > 0 && <span className="kobe-tab-count">{kobeAssigned.length}</span>}
          </button>
          <button className={`kobe-tab${tab === 'brief' ? ' active' : ''}`} onClick={() => setTab('brief')}>
            Briefings
            {kobeNotes.length > 0 && <span className="kobe-tab-count">{kobeNotes.length}</span>}
          </button>
          <button className={`kobe-tab${tab === 'from_kobe' ? ' active' : ''}`} onClick={() => setTab('from_kobe')}>
            From Kobe
            {kobeTasks.length > 0 && <span className="kobe-tab-count">{kobeTasks.length}</span>}
          </button>
          <button className={`kobe-tab${tab === 'activity' ? ' active' : ''}`} onClick={() => setTab('activity')}>
            Activity Log
          </button>
        </div>

        {/* ── Ask Kobe — native in-app delegation channel via agent_messages ── */}
        {tab === 'ask_kobe' && (
          <div className="kobe-chat-wrap kobe-ask-panel">
            <div className="kobe-channel-hint">Kobe reads this channel through Cadence and replies here.</div>
            <div className="kobe-chat-messages" aria-label="Ask Kobe message thread">
              {kobeMessages.length === 0 ? (
                <div className="kobe-chat-empty">
                  <div style={{ fontSize: 32, marginBottom: 12 }}>⚡</div>
                  <p>Ask Kobe to act on Cadence.</p>
                  <small>Link work, people, projects or meetings over time. Kobe replies here with what changed and what needs approval.</small>
                </div>
              ) : (
                kobeMessages.map((m) => {
                  const isKobe = m.sender_type === 'agent' || m.sender_type === 'system';
                  return (
                    <div key={m.id} className={`kobe-bubble-row${isKobe ? ' kobe-bubble-row--kobe' : ''}`}>
                      {isKobe && <div className="kobe-bubble-avatar">K</div>}
                      <div className={`kobe-bubble${isKobe ? ' kobe-bubble--kobe' : ' kobe-bubble--user'}`}>
                        {isKobe ? (
                          <div className="kobe-bubble-html" dangerouslySetInnerHTML={{ __html: sanitizeHtml(m.body || '') }} />
                        ) : (
                          <span>{m.body}</span>
                        )}
                        {contextChips(m)}
                        <div className="kobe-bubble-time">{fmtDM(m.created_at)}</div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={bottomRef} />
            </div>
            {sendError && <div className="kobe-chat-error" role="alert">{sendError}</div>}
            <div className="kobe-chat-input-wrap">
              <textarea
                ref={textareaRef}
                className="kobe-chat-input"
                placeholder="Ask Kobe to act on Cadence…"
                value={message}
                rows={1}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendToKobe(); }
                }}
              />
              <button
                className="btn btn-primary kobe-send-btn"
                onClick={sendToKobe}
                disabled={!message.trim() || sending}
                aria-label="Send to Kobe"
              >{sending ? '…' : '↑'}</button>
            </div>
          </div>
        )}

        {/* ── With Kobe — explicitly delegated via source=for:kobe ── */}
        {tab === 'for_kobe' && (
          <div className="kobe-panel">
            <div className="kobe-panel-actions">
              <button className="btn btn-primary" onClick={() => setModal('new')}>+ Delegate to Kobe</button>
            </div>
            {kobeAssigned.length === 0 ? (
              <div className="empty-state">
                <div className="icon">⚡</div>
                <p>Nothing with Kobe</p>
                <small>Only tasks explicitly delegated to Kobe appear here. Items created by Kobe stay in Rodney's lanes unless delegated.</small>
              </div>
            ) : (
              <div className="kobe-task-list">{kobeAssigned.map(taskRow)}</div>
            )}
          </div>
        )}

        {/* ── Briefings ── */}
        {tab === 'brief' && (
          <div className="kobe-panel">
            {!latestBrief ? (
              <div className="empty-state">
                <div className="icon">⚡</div>
                <p>No briefings yet</p>
                <small>Ask Kobe to write a morning brief —<br />it will appear here.</small>
              </div>
            ) : (
              <>
                <div className="kobe-brief-card">
                  <div className="kobe-brief-header">
                    <span className="kobe-brief-title">{latestBrief.title}</span>
                    <span className="kobe-brief-time">{fmtDM(latestBrief.updated_at)}</span>
                  </div>
                  <div className="kobe-brief-body" dangerouslySetInnerHTML={{ __html: latestBrief.body ? sanitizeHtml(latestBrief.body) : '<p>No content.</p>' }} />
                </div>
                {olderNotes.length > 0 && (
                  <div className="kobe-older-notes">
                    <div className="kobe-section-label">Earlier</div>
                    {olderNotes.map((n) => (
                      <div key={n.id} className="kobe-note-row">
                        <span className="kobe-note-title">{n.title}</span>
                        <span className="kobe-note-time">{fmtDM(n.updated_at)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── Activity Log ── */}
        {tab === 'activity' && (
          <div className="kobe-panel">
            {kobeActivity.length === 0 ? (
              <div className="empty-state">
                <div className="icon">📋</div>
                <p>No activity yet</p>
                <small>Actions Kobe takes in Cadence will appear here.</small>
              </div>
            ) : (
              <div className="kobe-activity-list">
                {kobeActivity.map((a) => (
                  <div key={a.id} className="kobe-activity-row">
                    <div className="kobe-activity-dot" />
                    <div className="kobe-activity-body">
                      <div className="kobe-activity-action">{fmtAction(a.action)}</div>
                      {a.detail && <div className="kobe-activity-detail">{a.detail}</div>}
                    </div>
                    <div className="kobe-activity-time" title={a.created_at}>
                      {fmtDMY((a.created_at || '').slice(0, 10))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── From Kobe ── */}
        {tab === 'from_kobe' && (
          <div className="kobe-panel">
            {kobeTasks.length === 0 ? (
              <div className="empty-state">
                <div className="icon">◎</div>
                <p>Nothing from Kobe yet</p>
                <small>Tasks Kobe creates on your behalf appear here.</small>
              </div>
            ) : (
              <div className="kobe-task-list">{kobeTasks.map(taskRow)}</div>
            )}
          </div>
        )}
      </div>

      {modal !== null && (
        <ItemModal
          existing={modal !== 'new' ? modal : undefined}
          defaults={modal === 'new' ? { source: 'for:kobe', inboxed: false } as any : undefined}
          onClose={() => setModal(null)}
        />
      )}
    </>
  );
}
