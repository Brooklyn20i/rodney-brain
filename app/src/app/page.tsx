'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Note } from '@/lib/types';
import NoteCard from '@/components/NoteCard';
import NoteModal from '@/components/NoteModal';
import AskBrain from '@/components/AskBrain';

type Tab = 'library' | 'ask';

export default function Home() {
  const [tab, setTab] = useState<Tab>('library');
  const [allNotes, setAllNotes] = useState<Note[]>([]);
  const [displayedNotes, setDisplayedNotes] = useState<Note[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch all notes once on mount
  useEffect(() => {
    fetch('/api/notes')
      .then((r) => r.json())
      .then((data: Note[]) => {
        setAllNotes(data);
        setDisplayedNotes(data);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  // Client-side search against already-loaded notes
  useEffect(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) {
      setDisplayedNotes(allNotes);
      return;
    }
    const words = q.split(/\s+/);
    const scored = allNotes.map((note) => {
      let score = 0;
      for (const w of words) {
        if (note.title.toLowerCase().includes(w)) score += 3;
        if (note.author.toLowerCase().includes(w)) score += 2;
        if (note.tags.join(' ').toLowerCase().includes(w)) score += 2;
        if (note.summary.toLowerCase().includes(w)) score += 2;
        if (note.content.toLowerCase().includes(w)) score += 1;
      }
      return { note, score };
    });
    setDisplayedNotes(
      scored
        .filter((s) => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .map((s) => s.note),
    );
  }, [searchQuery, allNotes]);

  // Open a note by ID — used by AskBrain source links
  const openNoteById = useCallback(
    (id: string) => {
      const note = allNotes.find((n) => n.id === id);
      if (note) {
        setSelectedNote(note);
        setTab('library');
      }
    },
    [allNotes],
  );

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-sm border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <span className="text-lg font-bold tracking-tight text-gray-900">Rodney Brain</span>
            <span className="text-xs text-gray-400 hidden sm:inline">private knowledge base</span>
          </div>

          {/* Tab navigation */}
          <nav className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
            {(['library', 'ask'] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                  tab === t
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {t === 'library' ? 'Library' : 'Ask My Brain'}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 max-w-5xl mx-auto w-full px-4 sm:px-6 py-8">
        {tab === 'library' && (
          <div>
            {/* Search */}
            <div className="relative mb-6">
              <svg
                className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search notes by title, tag, or content…"
                className="w-full rounded-xl border border-gray-200 bg-white pl-10 pr-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  aria-label="Clear search"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>

            {/* Status line */}
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-gray-400">
                {loading
                  ? 'Loading notes…'
                  : searchQuery
                  ? `${displayedNotes.length} result${displayedNotes.length !== 1 ? 's' : ''} for "${searchQuery}"`
                  : `${allNotes.length} note${allNotes.length !== 1 ? 's' : ''}`}
              </p>
              {searchQuery && displayedNotes.length === 0 && !loading && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="text-sm text-blue-600 hover:underline"
                >
                  Clear search
                </button>
              )}
            </div>

            {/* Error */}
            {error && (
              <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-700 mb-6">
                Failed to load notes: {error}
              </div>
            )}

            {/* Notes grid */}
            {!loading && displayedNotes.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {displayedNotes.map((note) => (
                  <NoteCard key={note.id} note={note} onClick={setSelectedNote} />
                ))}
              </div>
            )}

            {/* Empty state */}
            {!loading && displayedNotes.length === 0 && !error && (
              <div className="text-center py-16 text-gray-400">
                <svg
                  className="w-10 h-10 mx-auto mb-3 opacity-40"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                <p className="text-sm">No notes found</p>
              </div>
            )}
          </div>
        )}

        {tab === 'ask' && (
          <div>
            <div className="mb-8">
              <h1 className="text-2xl font-bold text-gray-900 mb-1">Ask My Brain</h1>
              <p className="text-sm text-gray-500">
                Ask anything. Relevant notes are retrieved and sent to Claude as context.
              </p>
            </div>
            <AskBrain onSourceClick={openNoteById} />
          </div>
        )}
      </main>

      {/* Note modal */}
      {selectedNote && (
        <NoteModal note={selectedNote} onClose={() => setSelectedNote(null)} />
      )}
    </div>
  );
}
