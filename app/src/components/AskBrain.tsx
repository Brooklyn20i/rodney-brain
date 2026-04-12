'use client';

import { useState, useRef } from 'react';
import type { AskResponse } from '@/lib/types';

interface Props {
  onSourceClick: (noteId: string) => void;
}

export default function AskBrain({ onSourceClick }: Props) {
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AskResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (!q || loading) return;

    setLoading(true);
    setResult(null);
    setError(null);

    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? `Request failed (${res.status})`);
      } else {
        setResult(data as AskResponse);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      handleSubmit(e as unknown as React.FormEvent);
    }
  }

  const exampleQuestions = [
    'What do my notes say about LLM knowledge bases?',
    'How does Harrison Chase think about memory?',
    'What are the main themes across all my notes?',
  ];

  return (
    <div className="max-w-2xl mx-auto">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="relative">
          <textarea
            ref={textareaRef}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question about your notes…"
            rows={3}
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
          />
          <div className="absolute bottom-3 right-3 text-xs text-gray-400 pointer-events-none">
            ⌘↵ to send
          </div>
        </div>
        <button
          type="submit"
          disabled={!question.trim() || loading}
          className="w-full sm:w-auto px-6 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Thinking…
            </span>
          ) : (
            'Ask My Brain →'
          )}
        </button>
      </form>

      {/* Example questions */}
      {!result && !error && !loading && (
        <div className="mt-6">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Try asking</p>
          <div className="flex flex-col gap-2">
            {exampleQuestions.map((q) => (
              <button
                key={q}
                onClick={() => { setQuestion(q); textareaRef.current?.focus(); }}
                className="text-left text-sm text-gray-500 hover:text-blue-600 transition-colors"
              >
                → {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="mt-6 rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Answer */}
      {result && (
        <div className="mt-6 space-y-5">
          {/* Answer text */}
          <div className="rounded-xl bg-gray-50 border border-gray-200 p-5">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">Answer</p>
            <div className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">
              {result.answer}
            </div>
          </div>

          {/* Sources */}
          {result.sources.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">
                Sources ({result.sources.length})
              </p>
              <div className="flex flex-col gap-2">
                {result.sources.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => onSourceClick(s.id)}
                    className="text-left group flex items-start gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 hover:border-blue-300 hover:bg-blue-50 transition-all"
                  >
                    <span className="mt-0.5 shrink-0 text-gray-300 group-hover:text-blue-400">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 group-hover:text-blue-700 truncate">
                        {s.title}
                      </p>
                      {s.author && (
                        <p className="text-xs text-gray-400">{s.author}</p>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Ask again */}
          <button
            onClick={() => { setResult(null); setQuestion(''); textareaRef.current?.focus(); }}
            className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
          >
            ← Ask another question
          </button>
        </div>
      )}
    </div>
  );
}
