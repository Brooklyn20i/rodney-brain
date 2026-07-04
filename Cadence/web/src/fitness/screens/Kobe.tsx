import { useState } from 'react';
import { useCadenceFitness } from '../lib/store';
import { ScreenHeader, Card } from '../components/bits';
import { fmtDMY } from '../lib/util';

// Message channel to Kobe. This screen is the human-facing half; the
// agent-facing half is a scoped Supabase grant plus the fitness MCP server
// set up in Kobe's own Hermes environment (see CadenceFitness/AGENTS.md and
// CadenceFitness/agent/) -- the same pattern as Cadence Work and Financial.
export function Kobe({ onMenu }: { onMenu: () => void }) {
  const { data, insert, update } = useCadenceFitness();
  const [draft, setDraft] = useState('');

  const sorted = [...data.agent_messages].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const unread = data.agent_messages.filter((m) => m.sender_type !== 'user' && m.status === 'unread');

  const send = async () => {
    if (!draft.trim()) return;
    await insert('agent_messages', {
      sender_type: 'user',
      sender_label: 'Rodney',
      body: draft.trim(),
      status: 'unread',
      linked_workout_id: null,
      linked_date: null,
    });
    setDraft('');
  };

  const markRead = (id: string) => update('agent_messages', id, { status: 'processed' });

  return (
    <>
      <ScreenHeader title="Kobe" subtitle="Coach channel — programming, check-ins, logging by message." onMenu={onMenu}>
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
                  onClick={() => m.sender_type !== 'user' && m.status === 'unread' && markRead(m.id)}
                >
                  <div>{m.body}</div>
                  <div className="agent-msg-meta">
                    {m.sender_label} · {fmtDMY(m.created_at)}
                    {m.sender_type !== 'user' && m.status === 'unread' ? ' · unread' : ''}
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="agent-compose">
            <textarea
              value={draft}
              placeholder="Message Kobe… e.g. 'Whoop says 45% today — swap legs for an easy spin?'"
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
            This is the app side of the channel. Kobe reads and replies here through a scoped grant
            on this Supabase project (a dedicated non-owner agent account with row access limited to
            this owner_id) plus the fitness MCP server in <code>CadenceFitness/agent/</code>, which
            also lets him read your training history and log workouts, weight, Whoop numbers and
            meals for you. That wiring lives in Kobe's own environment — see AGENTS.md.
          </p>
        </Card>
      </div>
    </>
  );
}
