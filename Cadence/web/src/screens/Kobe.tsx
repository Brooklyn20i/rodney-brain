import { useMemo, useState, useEffect, useRef } from 'react';
import { useCadence } from '../lib/store';
import { supabase } from '../lib/supabase';
import { ScreenHeader } from '../components/bits';
import { ItemModal } from '../components/ItemModal';
import type { WorkItem } from '../lib/types';
import { fmtDM } from '../lib/util';

type Tab = 'ace' | 'for_kobe' | 'brief' | 'from_kobe';

export function Kobe({ onMenu }: { onMenu?: () => void }) {
  const { data } = useCadence();
  const [modal, setModal] = useState<WorkItem | 'new' | null>(null);
  const [tab, setTab] = useState<Tab>('ace');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Ace chat — messages in both directions, filtered by recipient_key
  const aceMessages = useMemo(
    () =>
      (data.agent_messages || [])
        .filter((m) => !m.deleted_at && m.recipient_key === 'agent:ace')
        .sort((a, b) => a.created_at.localeCompare(b.created_at)),
    [data.agent_messages],
  );

  // Tasks Rodney assigned to Kobe
  const kobeAssigned = useMemo(
    () =>
      data.work_items
        .filter((w) => w.source === 'for:kobe' && !w.done && !w.deleted_at)
        .sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [data.work_items],
  );

  // Kobe briefings
  const kobeNotes = useMemo(
    () =>
      data.notes
        .filter((n) => (n.folder || '').startsWith('__kobe__') && n.folder !== '__kobe_inbox__' && n.folder !== '__kobe_reply__')
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
    [data.notes],
  );

  // Tasks Kobe created on Rodney's behalf
  const kobeTasks = useMemo(
    () =>
      data.work_items
        .filter((w) => w.source === 'agent:kobe' && !w.done && !w.deleted_at)
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
    [data.work_items],
  );

  useEffect(() => {
    if (tab === 'ace') bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [aceMessages.length, tab]);

  const sendToAce = async () => {
    const text = message.trim();
    if (!text || sending) return;
    setSending(true);
    setMessage('');
    try {
      const { error } = await supabase.functions.invoke('ace-chat', {
        body: { message: text },
      });
      if (error) console.error('Ace error:', error);
    } catch (e) {
      console.error('Ace error:', e);
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  };

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
          <button className={`kobe-tab${tab === 'ace' ? ' active' : ''}`} onClick={() => setTab('ace')}>
            Ace
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
        </div>

        {/* ── Ace chat ── */}
        {tab === 'ace' && (
          <div className="kobe-chat-wrap">
            <div className="kobe-chat-messages">
              {aceMessages.length === 0 ? (
                <div className="kobe-chat-empty">
                  <div style={{ fontSize: 32, marginBottom: 12 }}>◆</div>
                  <p>Ask Ace anything about your Cadence</p>
                  <small>Ace can read your tasks, projects, people and decisions — and take action on your behalf.</small>
                </div>
              ) : (
                aceMessages.map((m) => {
                  const isAce = m.sender_type === 'agent' || m.sender_type === 'system';
                  return (
                    <div key={m.id} className={`kobe-bubble-row${isAce ? ' kobe-bubble-row--kobe' : ''}`}>
                      {isAce && <div className="kobe-bubble-avatar ace-avatar">◆</div>}
                      <div className={`kobe-bubble${isAce ? ' kobe-bubble--kobe' : ' kobe-bubble--user'}`}>
                        {isAce ? (
                          <div className="kobe-bubble-html" dangerouslySetInnerHTML={{ __html: m.body || '' }} />
                        ) : (
                          <span>{m.body}</span>
                        )}
                        <div className="kobe-bubble-time">{fmtDM(m.created_at)}</div>
                      </div>
                    </div>
                  );
                })
              )}
              {sending && (
                <div className="kobe-bubble-row kobe-bubble-row--kobe">
                  <div className="kobe-bubble-avatar ace-avatar">◆</div>
                  <div className="kobe-bubble kobe-bubble--kobe kobe-bubble--thinking">
                    <span className="ace-thinking-dots"><span /><span /><span /></span>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
            <div className="kobe-chat-input-wrap">
              <textarea
                ref={textareaRef}
                className="kobe-chat-input"
                placeholder="Ask Ace…"
                value={message}
                rows={1}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendToAce(); }
                }}
              />
              <button
                className="btn btn-primary kobe-send-btn"
                onClick={sendToAce}
                disabled={!message.trim() || sending}
              >{sending ? '…' : '↑'}</button>
            </div>
          </div>
        )}

        {/* ── For Kobe ── */}
        {tab === 'for_kobe' && (
          <div className="kobe-panel">
            <div className="kobe-panel-actions">
              <button className="btn btn-primary" onClick={() => setModal('new')}>+ Task for Kobe</button>
            </div>
            {kobeAssigned.length === 0 ? (
              <div className="empty-state">
                <div className="icon">⚡</div>
                <p>No tasks for Kobe</p>
                <small>Add non-urgent tasks here. Kobe checks this regularly and actions them without interrupting you.</small>
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
                  <div className="kobe-brief-body" dangerouslySetInnerHTML={{ __html: latestBrief.body || '<p>No content.</p>' }} />
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
