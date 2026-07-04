import { useState } from 'react';
import { useCadenceFinancial } from '../lib/store';
import { ScreenHeader, Card } from '../components/bits';
import { fmtDMY } from '../lib/util';

// Message channel to Rodney's agents (Kobe/Warren/Dan). This screen is the
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
      sender_label: 'Rodney',
      body: draft.trim(),
      status: 'processed',
      linked_decision_id: null,
      linked_period: null,
    });
    setDraft('');
  };

  const markRead = (id: string) => update('agent_messages', id, { status: 'processed' });

  return (
    <>
      <ScreenHeader title="Kobe" subtitle="Message channel to Kobe, Warren and Dan." onMenu={onMenu}>
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
                    {m.sender_label} · {fmtDMY(m.created_at)}
                    {m.status === 'unread' ? ' · unread' : ''}
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="agent-compose">
            <textarea
              value={draft}
              placeholder="Message Kobe..."
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
        <Card title="How this connects to Kobe">
          <p style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.6 }}>
            This is the app side of the channel only. For Kobe to actually read and reply here, it
            needs a scoped grant on this Supabase project (a dedicated non-owner agent account with
            row access limited to this owner_id) -- the same pattern the main Cadence app uses. That
            grant is set up in Kobe's own environment, not in this app.
          </p>
        </Card>
      </div>
    </>
  );
}
