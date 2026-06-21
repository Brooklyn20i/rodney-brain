import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useCadence } from '../lib/store';
import { ScreenHeader } from '../components/bits';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const SUGGESTIONS = [
  'What should I focus on today?',
  "What's overdue?",
  'What decisions need my attention?',
  'Give me a status on my projects.',
];

export function Chat({ onMenu }: { onMenu?: () => void }) {
  const { session } = useCadence();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const resizeTextarea = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  };

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming || !session?.access_token) return;

    const history: Message[] = [...messages, { role: 'user', content: text }];
    setMessages([...history, { role: 'assistant', content: '' }]);
    setInput('');
    setStreaming(true);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history, token: session.access_token }),
      });

      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        setMessages(prev => {
          const copy = [...prev];
          copy[copy.length - 1] = { role: 'assistant', content: copy[copy.length - 1].content + chunk };
          return copy;
        });
      }
    } catch {
      setMessages(prev => {
        const copy = [...prev];
        copy[copy.length - 1] = { role: 'assistant', content: 'Something went wrong. Please try again.' };
        return copy;
      });
    } finally {
      setStreaming(false);
      textareaRef.current?.focus();
    }
  }, [input, messages, session, streaming]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="chat-screen">
      <ScreenHeader title="Chat" subtitle="Ask about your tasks, projects & decisions" onMenu={onMenu} />

      <div className="chat-body">
        {messages.length === 0 ? (
          <div className="chat-empty">
            <div className="chat-empty-icon">✦</div>
            <p className="chat-empty-title">Your Cadence assistant</p>
            <p className="chat-empty-sub">I have live context on your open tasks, projects, and decisions.</p>
            <div className="chat-suggestions">
              {SUGGESTIONS.map(s => (
                <button
                  key={s}
                  className="chat-suggestion"
                  onClick={() => { setInput(s); textareaRef.current?.focus(); }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="chat-messages">
            {messages.map((msg, i) => (
              <div key={i} className={`chat-msg chat-msg--${msg.role}`}>
                {msg.role === 'assistant' && <span className="chat-avatar">✦</span>}
                <div className="chat-bubble">
                  {msg.content || (streaming && i === messages.length - 1
                    ? <span className="chat-typing">●●●</span>
                    : null
                  )}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <div className="chat-input-area">
        <div className="chat-input-wrap">
          <textarea
            ref={textareaRef}
            className="chat-input"
            value={input}
            onChange={e => { setInput(e.target.value); resizeTextarea(); }}
            onKeyDown={onKeyDown}
            placeholder="Ask anything about your work…"
            rows={1}
            disabled={streaming}
          />
          <button
            className="chat-send"
            onClick={send}
            disabled={!input.trim() || streaming}
            aria-label="Send"
          >
            ↑
          </button>
        </div>
        <p className="chat-hint">Enter to send · Shift+Enter for new line</p>
      </div>
    </div>
  );
}
