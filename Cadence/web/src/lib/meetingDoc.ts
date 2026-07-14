// Word-style meeting documents.
//
// A meeting note's body is now a plain rich-text (HTML) document — the same
// writing surface as Notes. Older meetings stored structured JSON
// ({agenda, actions, notes}); these convert ONE WAY into a readable HTML
// document the first time they're opened, so nothing Rodney captured under the
// old template is lost — it just becomes text he can edit freely.

import { parseMeeting } from './meetingData';
import type { MeetingData } from './meetingData';
import { escapeHtml, htmlIsEmpty, htmlToPlain, isRichHtml, toEditorHtml } from './richText';

// True when a body is an old structured-JSON meeting.
export function isLegacyMeetingJson(body: string): boolean {
  if (!body.trim().startsWith('{')) return false;
  try {
    const p = JSON.parse(body);
    return !!p && typeof p === 'object' && ('agenda' in p || 'actions' in p);
  } catch { return false; }
}

const STATUS_MARK: Record<string, string> = { covered: '✅', deferred: '⏭', discuss: '💬' };

// Render a legacy structured meeting as an HTML document. Content-preserving:
// agenda titles + their notes, action items with owner/due/filed state, and
// the free-notes tail all become ordinary editable text.
export function legacyMeetingToHtml(parsed: MeetingData): string {
  const parts: string[] = [];

  if (parsed.agenda.length) {
    parts.push('<h2>Agenda</h2>');
    for (const a of parsed.agenda) {
      const mark = STATUS_MARK[a.status] || '';
      parts.push(`<p><strong>${mark ? mark + ' ' : ''}${escapeHtml(a.title || 'Untitled item')}</strong></p>`);
      if (!htmlIsEmpty(a.notes)) {
        parts.push(isRichHtml(a.notes) ? a.notes : toEditorHtml(a.notes));
      }
    }
  }

  if (parsed.actions.length) {
    parts.push('<h2>Actions</h2><ul>');
    for (const ac of parsed.actions) {
      const bits = [
        `${ac.done ? '☑' : '☐'} ${escapeHtml(ac.title || 'Untitled action')}`,
        ac.owner === 'me' ? '(me)' : `(${escapeHtml(ac.owner_label || 'them')})`,
        ac.due ? `due ${escapeHtml(ac.due)}` : '',
        ac.pushed ? `→ filed${ac.pushed_to ? ` to ${escapeHtml(ac.pushed_to)}` : ''}` : '',
      ].filter(Boolean);
      parts.push(`<li>${bits.join(' ')}</li>`);
    }
    parts.push('</ul>');
  }

  if (!htmlIsEmpty(parsed.notes)) {
    if (parsed.agenda.length || parsed.actions.length) parts.push('<h2>Notes</h2>');
    parts.push(isRichHtml(parsed.notes) ? parsed.notes : toEditorHtml(parsed.notes));
  }

  return parts.join('');
}

// Body (any era) → HTML for the document editor.
export function meetingDocHtml(body: string): string {
  if (!body.trim()) return '';
  if (isLegacyMeetingJson(body)) return legacyMeetingToHtml(parseMeeting(body).data);
  return toEditorHtml(body);
}

// Body (any era) → short plain-text preview for meeting list cards.
export function meetingPreviewText(body: string): string {
  return htmlToPlain(meetingDocHtml(body));
}
