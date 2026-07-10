import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useCadence } from '../lib/store';
import { useAceThread, sendAceTurn, createTurnKeeper } from '../lib/aceClient';
import { sanitizeHtml } from '../lib/sanitize';
import { fmtDM } from '../lib/util';

// Slide-over Ace: the same agent:ace thread as the Ace screen, one tap away
// from any Work surface. Contextual actions pre-fill the composer — the
// prompt stays editable so the user always sees exactly what is sent (unless
// the caller explicitly asked for autoSend).
export function AcePanel({ prompt, autoSend, contextLabel, onClose }: {
  prompt?: string;
  autoSend?: boolean;
  contextLabel?: string;
  onClose: () => void;
}) {
  const { workspace } = useCadence();
  const { messages, refresh, threadError } = useAceThread();
  const [message, setMessage] = useState(prompt || '');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const keeperRef = useRef(createTurnKeeper());
  const autoSentRef = useRef(false);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, sending]);

  const send = async (textOverride?: string) => {
    const text = (textOverride ?? message).trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    setMessage('');
    const requestId = keeperRef.current.idFor(text);
    const result = await sendAceTurn({ message: text, requestId, workspaceId: workspace?.id });
    if (result.accepted) {
      keeperRef.current.accepted();
      await refresh();
    } else {
      setError(result.reason === 'transport'
        ? 'Could not reach Ace — check your connection and try again.'
        : "Ace couldn't respond. Make sure the ace-chat function is deployed, then try again.");
      setMessage(text); // restore the draft so nothing is lost
    }
    setSending(false);
    textareaRef.current?.focus();
  };

  // Fire a pre-built prompt exactly once when opened with autoSend.
  useEffect(() => {
    if (autoSend && prompt && !autoSentRef.current) {
      autoSentRef.current = true;
      void send(prompt);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return createPortal(
    <>
      <div className="ace-panel-backdrop" onClick={onClose} />
      <div className="ace-panel" role="dialog" aria-label="Ask Ace">
        <div className="ace-panel-hdr">
          <span className="ace-panel-title">◆ Ace{contextLabel ? <span className="ace-panel-context"> · {contextLabel}</span> : null}</span>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>✕ Close</button>
        </div>

        <div className="kobe-chat-messages ace-chat-messages ace-panel-messages">
          {messages.length === 0 && !sending ? (
            <div className="kobe-chat-empty">
              <div style={{ fontSize: 32, marginBottom: 12 }}>◆</div>
              <p>Ask Ace anything about your Cadence</p>
              <small>Ace can read your tasks, projects, people and decisions — and take action on your behalf.</small>
            </div>
          ) : (
            messages.map((m) => {
              const isAce = m.sender_type === 'agent' || m.sender_type === 'system';
              return (
                <div key={m.id} className={`kobe-bubble-row ace-bubble-row${isAce ? ' kobe-bubble-row--kobe ace-bubble-row--ace' : ' ace-bubble-row--user'}`}>
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
            <div className="kobe-bubble-row kobe-bubble-row--kobe ace-bubble-row ace-bubble-row--ace">
              <div className="kobe-bubble-avatar ace-avatar">◆</div>
              <div className="kobe-bubble kobe-bubble--kobe kobe-bubble--thinking">
                <span className="ace-thinking-dots"><span /><span /><span /></span>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {(error || threadError) && (
          <div style={{ padding: '8px 16px', color: 'var(--red)', fontSize: 13, textAlign: 'center' }}>{error || threadError}</div>
        )}
        <div className="kobe-chat-input-wrap">
          <textarea
            ref={textareaRef}
            className="kobe-chat-input"
            placeholder="Ask Ace…"
            value={message}
            rows={message.length > 80 ? 3 : 1}
            autoFocus={!!prompt && !autoSend}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); }
            }}
          />
          <button
            className="btn btn-primary kobe-send-btn"
            onClick={() => void send()}
            disabled={!message.trim() || sending}
          >{sending ? '…' : '↑'}</button>
        </div>
      </div>
    </>,
    document.body,
  );
}
