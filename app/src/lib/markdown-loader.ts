import fs from 'fs';
import path from 'path';
import type { Note } from './types';

/**
 * Articles live in the parent repository's articles/ folder.
 * process.cwd() is the /app directory when running next dev/build.
 * We never write to this directory — read-only.
 */
const ARTICLES_DIR = path.join(process.cwd(), '..', 'articles');

/** Extract a `**Field:** value` inline metadata field. */
function parseMetaField(content: string, field: string): string {
  const regex = new RegExp(`\\*\\*${field}:\\*\\*\\s*(.+)`, 'i');
  const match = content.match(regex);
  return match ? match[1].trim() : '';
}

/** Split content on `## Heading` lines into a named-section map. */
function parseSections(content: string): Record<string, string> {
  const sections: Record<string, string> = {};
  const parts = content.split(/^## /m);
  for (let i = 1; i < parts.length; i++) {
    const newlineIdx = parts[i].indexOf('\n');
    if (newlineIdx === -1) continue;
    const name = parts[i].slice(0, newlineIdx).trim();
    const body = parts[i].slice(newlineIdx + 1).trim();
    sections[name] = body;
  }
  return sections;
}

function parseNote(filename: string, raw: string): Note {
  const lines = raw.split('\n');

  // Title from the first `# ` heading
  const titleLine = lines.find((l) => l.startsWith('# '));
  const titleFull = titleLine?.replace(/^#\s+/, '').trim() ?? filename;

  // Articles use "Title — @AuthorHandle" convention
  const dashIdx = titleFull.indexOf(' — ');
  const title = dashIdx > -1 ? titleFull.slice(0, dashIdx).trim() : titleFull;
  const author = dashIdx > -1 ? titleFull.slice(dashIdx + 3).trim() : '';

  const date = parseMetaField(raw, 'Date');
  const source = parseMetaField(raw, 'Source');
  const type = parseMetaField(raw, 'Type');
  const tagsRaw = parseMetaField(raw, 'Tags');
  const tags = tagsRaw
    ? tagsRaw
        .split(/\s+/)
        .filter((t) => t.startsWith('#'))
        .map((t) => t.slice(1))
    : [];

  const sections = parseSections(raw);
  const summary = sections['Summary'] ?? '';
  const id = filename.replace(/\.md$/, '');

  return { id, filename, title, author, date, source, type, tags, summary, content: raw, sections };
}

/** Load and parse all markdown files from the articles directory. */
export function loadAllNotes(): Note[] {
  if (!fs.existsSync(ARTICLES_DIR)) return [];
  return fs
    .readdirSync(ARTICLES_DIR)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((filename) => {
      const raw = fs.readFileSync(path.join(ARTICLES_DIR, filename), 'utf-8');
      return parseNote(filename, raw);
    });
}

/**
 * Score-rank notes by relevance to a query string.
 * Title matches weight 3×, tag/summary matches 2×, body matches 1×.
 */
export function scoreNotes(notes: Note[], query: string): Array<{ note: Note; score: number }> {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return notes.map((note) => {
    let score = 0;
    const titleL = note.title.toLowerCase();
    const authorL = note.author.toLowerCase();
    const tagsL = note.tags.join(' ').toLowerCase();
    const summaryL = note.summary.toLowerCase();
    const contentL = note.content.toLowerCase();
    for (const w of words) {
      if (titleL.includes(w)) score += 3;
      if (authorL.includes(w)) score += 2;
      if (tagsL.includes(w)) score += 2;
      if (summaryL.includes(w)) score += 2;
      if (contentL.includes(w)) score += 1;
    }
    return { note, score };
  });
}

/** Filter and sort notes by search query; returns all notes if query is empty. */
export function searchNotes(notes: Note[], query: string): Note[] {
  if (!query.trim()) return notes;
  return scoreNotes(notes, query)
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((s) => s.note);
}

/** Return the top-K most relevant notes for a question (for Ask My Brain context). */
export function findRelevantNotes(notes: Note[], question: string, topK = 5): Note[] {
  if (!question.trim()) return notes.slice(0, topK);
  const scored = scoreNotes(notes, question).sort((a, b) => b.score - a.score);
  // If nothing scores well, fall back to all notes so the LLM has full context
  const hasMatches = scored.some((s) => s.score > 0);
  return hasMatches ? scored.slice(0, topK).map((s) => s.note) : notes.slice(0, topK);
}
