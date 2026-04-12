'use client';

import type { Note } from '@/lib/types';

interface Props {
  note: Note;
  onClick: (note: Note) => void;
}

export default function NoteCard({ note, onClick }: Props) {
  const summaryPreview =
    note.summary.length > 180 ? note.summary.slice(0, 180).trimEnd() + '…' : note.summary;

  return (
    <button
      onClick={() => onClick(note)}
      className="group w-full text-left bg-white border border-gray-200 rounded-xl p-5 hover:border-gray-400 hover:shadow-sm transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
    >
      {/* Type badge + date */}
      <div className="flex items-center justify-between gap-2 mb-3">
        {note.type && (
          <span className="inline-block text-xs font-medium text-gray-500 bg-gray-100 rounded-full px-2.5 py-0.5 truncate max-w-[70%]">
            {note.type}
          </span>
        )}
        {note.date && (
          <span className="text-xs text-gray-400 tabular-nums shrink-0">{note.date}</span>
        )}
      </div>

      {/* Title */}
      <h2 className="text-base font-semibold text-gray-900 leading-snug mb-1 group-hover:text-blue-700 transition-colors">
        {note.title}
      </h2>

      {/* Author */}
      {note.author && (
        <p className="text-sm text-gray-500 mb-3">{note.author}</p>
      )}

      {/* Summary preview */}
      {summaryPreview && (
        <p className="text-sm text-gray-600 leading-relaxed mb-3 line-clamp-3">
          {summaryPreview}
        </p>
      )}

      {/* Tags */}
      {note.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {note.tags.map((tag) => (
            <span
              key={tag}
              className="text-xs text-blue-600 bg-blue-50 rounded-full px-2 py-0.5"
            >
              #{tag}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}
