import { useMemo, useState, useEffect, useRef } from 'react';
import { useCadence } from '../lib/store';
import { ScreenHeader } from '../components/bits';
import { ItemModal } from '../components/ItemModal';
import type { WorkItem } from '../lib/types';
import { fmtDM } from '../lib/util';

type Tab = 'chat' | 'brief' | 'work';

export function Kobe({ onMenu }: { onMenu?: () => void }) {
  const { data, insert } = useCadence();
  const [modal, setModal] = useState<WorkItem | null>(null);
  const [tab, setTab] = useState<Tab>('chat');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Chat messages — both sides of the conversation, sorted by time
  const chatMessages = useMemo(
    () =>
      data.notes
        .filter((n) => n.folder === '__kobe_inbox__' || n.folder === '__kobe_reply__')
        .sort((a, b) => a.created_at.localeCompare(b.created_at)),
    [data.notes],
  );

  // Kobe briefings
  const kobeNotes = useMemo(
    () =>
      data.notes
        .filter((n) => (n.folder || '').startsWith('__kobe__') && n.folder !== '__kobe_inbox__' && n.folder !== '__kobe_reply__')
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
    [data.notes],
  );

  // Tasks Kobe created
  const kobeTasks = useMemo(
    () =>
      data.work_items
        .filter((w) => w.source === 'agent:kobe' && !w.done && !w.deleted_at)
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
    [data.work_items],
  );

  // Auto-scroll chat to bottom when new messages arrive
  useEffect(() => {
    if (tab === 'chat') bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages.length, tab]);

  const sendMessage = async () => {
    const text = message.trim();
    if (!text || sending) return;
    setSending(true);
    setMessage('');
    try {
      await insert('notes', {
        title: new Date().toISOString(),
        body: text,
        folder: '__kobe_inbox__',
      } as any);
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  };

  const latestBrief = kobeNotes[0] ?? null;
  const olderNotes = kobeNotes.slice(1);

  return (
    <>
      <ScreenHeader title="Kobe" onMenu={onMenu} />
      <div className="kobe-screen">
        <div className="kobe-tabs">
          <button className={`kobe-tab${tab === 'chat' ? ' active' : ''}`} onClick={() => setTab('chat')}>
            Chat
            {chatMessages.length > 0 && <span className="kobe-tab-count">{chatMessages.length}</span>}
          </button>
          <button className={`kobe-tab${tab === 'brief' ? ' active' : ''}`} onClick={() => setTab('brief')}>
            Briefings
            {kobeNotes.length > 0 && <span className="kobe-tab-count">{kobeNotes.length}</span>}
          </button>
          <button className={`kobe-tab${tab === 'work' ? ' active' : ''}`} onClick={() => setTab('work')}>
            Open tasks
            {kobeTasks.length > 0 && <span className="kobe-tab-count">{kobeTasks.length}</span>}
          </button>
        </div>

        {/* ── Chat ── */}
        {tab === 'chat' && (
          <div className="kobe-chat-wrap">
            <div className="kobe-chat-messages">
              {chatMessages.length === 0 ? (
                <div className="kobe-chat-empty">
                  <div style={{ fontSize: 32, marginBottom: 12 }}>⚡</div>
                  <p>Ask Kobe anything</p>
                  <small>He'll reply here. He can read your tasks, meetings, projects, and notes.</small>
                </div>
              ) : (
                chatMessages.map((m) => {
                  const isKobe = m.folder === '__kobe_reply__';
                  return (
                    <div key={m.id} className={`kobe-bubble-row${isKobe ? ' kobe-bubble-row--kobe' : ''}`}>
                      {isKobe && <div className="kobe-bubble-avatar">⚡</div>}
                      <div className={`kobe-bubble${isKobe ? ' kobe-bubble--kobe' : ' kobe-bubble--user'}`}>
                        {isKobe ? (
                          <div
                            className="kobe-bubble-html"
                            dangerouslySetInnerHTML={{ __html: m.body || '' }}
                          />
                        ) : (
                          <span>{m.body}</span>
                        )}
                        <div className="kobe-bubble-time">{fmtDM(m.created_at)}</div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={bottomRef} />
            </div>
            <div className="kobe-chat-input-wrap">
              <textarea
                ref={textareaRef}
                className="kobe-chat-input"
                placeholder="Message Kobe…"
                value={message}
                rows={1}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
                }}
              />
              <button
                className="btn btn-primary kobe-send-btn"
                onClick={sendMessage}
                disabled={!message.trim() || sending}
              >{sending ? '…' : '↑'}</button>
            </div>
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
                  <div
                    className="kobe-brief-body"
                    dangerouslySetInnerHTML={{ __html: latestBrief.body || '<p>No content.</p>' }}
                  />
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

        {/* ── Open tasks ── */}
        {tab === 'work' && (
          <div className="kobe-panel">
            {kobeTasks.length === 0 ? (
              <div className="empty-state">
                <div className="icon">◎</div>
                <p>No open tasks from Kobe</p>
                <small>Tasks Kobe creates on your behalf appear here.</small>
              </div>
            ) : (
              <div className="kobe-task-list">
                {kobeTasks.map((w) => {
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
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {modal && <ItemModal existing={modal} onClose={() => setModal(null)} />}
    </>
  );
}
