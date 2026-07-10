import { useMemo, useState, useEffect, useRef } from 'react';
import { useCadence } from '../lib/store';
import { supabase } from '../lib/supabase';
import { ScreenHeader } from '../components/bits';
import { fmtDM } from '../lib/util';
import { sanitizeHtml } from '../lib/sanitize';

export function Ace({ onMenu }: { onMenu?: () => void }) {
  const { data } = useCadence();
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Idempotency key for the in-flight turn, bound to the exact text it was minted
  // for. Reused only when retrying that *same* instruction after a not-accepted
  // send; cleared once the function accepts the turn. If Rodney edits the restored
  // draft, the text no longer matches and a fresh id is minted — so a changed
  // instruction is never sent under the previous turn's id.
  const pendingTurn = useRef<{ id: string; text: string } | null>(null);

  const aceMessages = useMemo(
    () =>
      (data.agent_messages || [])
        .filter((m) => !m.deleted_at && m.recipient_key === 'agent:ace')
        .sort((a, b) => a.created_at.localeCompare(b.created_at)),
    [data.agent_messages],
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [aceMessages.length]);

  const sendToAce = async () => {
    const text = message.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    setMessage('');
    // Reuse the prior id only when retrying the exact same instruction; mint a
    // fresh one for a new or edited turn.
    const requestId = pendingTurn.current?.text === text ? pendingTurn.current.id : crypto.randomUUID();
    pendingTurn.current = { id: requestId, text };
    try {
      const { error } = await supabase.functions.invoke('ace-chat', {
        body: { message: text, request_id: requestId },
      });
      if (error) {
        // Not accepted (or an ambiguous failure). Keep the id+text so an
        // identical retry reuses it, and restore the draft so nothing is lost.
        console.error('Ace error:', error);
        setError("Ace couldn't respond. Make sure the ace-chat function is deployed, then try again.");
        setMessage(text);
      } else {
        // Accepted. The reply — or an explicit failure notice — arrives in the
        // thread via Realtime; never resubmit this turn.
        pendingTurn.current = null;
      }
    } catch (e) {
      // Transport error: the turn may not have been accepted. Keep the id+text
      // for an idempotent retry of the same instruction and restore the draft.
      console.error('Ace error:', e);
      setError('Could not reach Ace — check your connection and try again.');
      setMessage(text);
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  };

  return (
    <>
      <ScreenHeader title="Ace" onMenu={onMenu} />
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
                      <div className="kobe-bubble-html" dangerouslySetInnerHTML={{ __html: sanitizeHtml(m.body || '') }} />
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
        {error && (
          <div style={{ padding: '8px 16px', color: 'var(--red)', fontSize: 13, textAlign: 'center' }}>{error}</div>
        )}
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
    </>
  );
}
