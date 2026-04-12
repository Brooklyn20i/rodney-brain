'use client';

import { useEffect, useRef } from 'react';
import { marked } from 'marked';
import type { Note } from '@/lib/types';

interface Props {
  note: Note;
  onClose: () => void;
}

export default function NoteModal({ note, onClose }: Props) {
  const overlayRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  // Prevent body scroll while modal is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const html = marked.parse(note.content, { async: false }) as string;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 backdrop-blur-sm p-4 sm:p-8 overflow-y-auto"
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className="relative w-full max-w-3xl bg-white rounded-2xl shadow-2xl my-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 p-6 pb-4 border-b border-gray-100">
          <div className="flex-1 min-w-0">
            {note.type && (
              <span className="inline-block text-xs font-medium text-gray-500 bg-gray-100 rounded-full px-2.5 py-0.5 mb-2">
                {note.type}
              </span>
            )}
            <h2 className="text-xl font-bold text-gray-900 leading-snug">{note.title}</h2>
            <div className="flex flex-wrap items-center gap-3 mt-1.5 text-sm text-gray-500">
              {note.author && <span>{note.author}</span>}
              {note.date && <span className="tabular-nums">{note.date}</span>}
              {note.source && (
                <a
                  href={note.source}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  View source ↗
                </a>
              )}
            </div>
            {note.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {note.tags.map((tag) => (
                  <span key={tag} className="text-xs text-blue-600 bg-blue-50 rounded-full px-2 py-0.5">
                    #{tag}
                  </span>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 text-gray-400 hover:text-gray-700 transition-colors p-1"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div
          className="p-6 prose prose-sm prose-gray max-w-none overflow-auto"
          /* Content is from our own trusted markdown files */
          dangerouslySetInnerHTML={{ __html: html }}
        />

        {/* Footer */}
        <div className="px-6 pb-4 text-xs text-gray-400 border-t border-gray-100 pt-3">
          {note.filename}
        </div>
      </div>
    </div>
  );
}
