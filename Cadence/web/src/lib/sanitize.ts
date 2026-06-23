// Centralised HTML safety helpers.
//
// Cadence is multi-tenant and several rows (note bodies, meeting agendas) are
// written by other workspace members AND by the Kobe/Ace agents. Any of that
// content can reach a `dangerouslySetInnerHTML` sink (the Share preview, the
// meeting-note renderer, exported documents). Treat every such string as
// untrusted: sanitise rich HTML before it renders, and escape plain-text
// fields before they're interpolated into an HTML template.

import DOMPurify from 'dompurify';

// Escape a plain-text value for safe interpolation inside an HTML string.
// Use for titles, names, and any field the user types into a plain <input>.
export function escapeHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Sanitise rich HTML (e.g. a TipTap note body) so it can be rendered or
// exported without executing scripts or inline event handlers.
export function sanitizeHtml(s: string): string {
  return DOMPurify.sanitize(String(s ?? ''), {
    USE_PROFILES: { html: true },
    // Strip anything that could execute or exfiltrate.
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick'],
  });
}
