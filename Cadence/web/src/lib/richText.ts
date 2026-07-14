// Shared helpers for fields that may hold either quick plain text or rich HTML
// from the tiptap editor. Lets legacy plain content open cleanly in the editor
// and lets list rows show a readable preview of rich content.

export const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// True if a string is HTML produced by the rich editor (vs. plain text).
export const isRichHtml = (s: string) =>
  /<(p|ul|ol|li|h[1-3]|strong|em|u|blockquote|table|br|mark|s|img)[\s>/]/i.test(s);

// True if there is no visible content (covers empty rich `<p></p>` too).
export const htmlIsEmpty = (s: string) =>
  !s || s.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim() === '';

// Convert plain text (with line breaks) into HTML the editor can open without
// losing anything. Already-HTML passes through untouched.
export const toEditorHtml = (s: string): string => {
  if (!s) return '';
  if (isRichHtml(s)) return s;
  return s.split(/\n{2,}/).map((para) =>
    `<p>${para.split('\n').map(escapeHtml).join('<br>')}</p>`
  ).join('');
};

// Flatten rich HTML to readable one-line plain text for previews.
export const htmlToPlain = (s: string): string =>
  (s || '')
    .replace(/<\/(p|div|li|h[1-6]|blockquote|tr)>/gi, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
