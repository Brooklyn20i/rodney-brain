import { useState } from 'react';
import { useCadenceFinancial } from '../lib/store';
import { ScreenHeader, Card } from '../components/bits';
import { fmtDMY } from '../lib/util';

// Customer-facing channel to Cadence Financial. Warren and Dan remain internal
// investment and property lenses rather than separate products. This screen is the
// human-facing half; the agent-facing half is a scoped Supabase grant set
// up separately in Kobe's own environment (see AGENTS.md) -- there's no
// live agent connected here, this just reads/writes the same table Kobe
// would use.
export function Kobe({ onMenu }: { onMenu: () => void }) {
  const { data, insert, update } = useCadenceFinancial();
  const [draft, setDraft] = useState('');

  const sorted = [...data.agent_messages].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const unread = data.agent_messages.filter((m) => m.sender_type !== 'user' && m.status === 'unread');

  const send = async () => {
    if (!draft.trim()) return;
    await insert('agent_messages', {
      sender_type: 'user',
      sender_label: 'You',
      body: draft.trim(),
      status: 'processed',
      linked_decision_id: null,
      linked_period: null,
    });
    setDraft('');
  };

  const markRead = (id: string) => update('agent_messages', id, { status: 'processed' });
  const displaySenderLabel = (senderType: string, senderLabel: string) =>
    senderType === 'user' ? senderLabel : 'Cadence Financial';

  return (
    <>
      <ScreenHeader title="Cadence Financial" subtitle="Your private wealth operating agent." onMenu={onMenu}>
        {unread.length > 0 && <span className="grade-tag grade-weak">{unread.length} unread</span>}
      </ScreenHeader>
      <div className="screen-content">
        <Card>
          {sorted.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--text2)' }}>No messages yet.</p>
          ) : (
            <div className="agent-thread">
              {sorted.map((m) => (
                <div
                  key={m.id}
                  className={`agent-msg ${m.sender_type === 'user' ? 'agent-msg-user' : 'agent-msg-agent'}`}
                  onClick={() => m.status === 'unread' && markRead(m.id)}
                >
                  <div>{m.body}</div>
                  <div className="agent-msg-meta">
                    {displaySenderLabel(m.sender_type, m.sender_label)} · {fmtDMY(m.created_at)}
                    {m.status === 'unread' ? ' · unread' : ''}
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="agent-compose">
            <textarea
              value={draft}
              placeholder="Message Cadence Financial..."
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
            />
            <button className="btn btn-primary" onClick={send}>
              Send
            </button>
          </div>
        </Card>
        <Card title="How it works">
          <p style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.6 }}>
            Messages here use the same secure Cadence Financial channel. Access is scoped to
            portfolio analysis and decision support; trading
            and capital movement remain outside the agent's authority.
          </p>
        </Card>
      </div>
    </>
  );
}
