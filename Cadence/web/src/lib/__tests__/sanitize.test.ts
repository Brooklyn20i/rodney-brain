import { describe, it, expect } from 'vitest';
import { escapeHtml, sanitizeHtml } from '../sanitize';

describe('escapeHtml', () => {
  it('escapes the HTML-significant characters', () => {
    expect(escapeHtml(`<img src=x onerror=alert(1)>`)).toBe(
      '&lt;img src=x onerror=alert(1)&gt;',
    );
    expect(escapeHtml(`a & b "c" 'd'`)).toBe('a &amp; b &quot;c&quot; &#39;d&#39;');
  });

  it('handles null/undefined safely', () => {
    expect(escapeHtml(undefined as unknown as string)).toBe('');
    expect(escapeHtml(null as unknown as string)).toBe('');
  });
});

describe('sanitizeHtml', () => {
  it('strips <script> tags', () => {
    const out = sanitizeHtml('<p>hi</p><script>alert(1)</script>');
    expect(out).toContain('<p>hi</p>');
    expect(out.toLowerCase()).not.toContain('<script');
  });

  it('strips inline event handlers and the onerror image vector', () => {
    const out = sanitizeHtml('<img src=x onerror="alert(1)">');
    expect(out.toLowerCase()).not.toContain('onerror');
  });

  it('strips javascript: links', () => {
    const out = sanitizeHtml('<a href="javascript:alert(1)">x</a>');
    expect(out.toLowerCase()).not.toContain('javascript:');
  });

  it('preserves safe rich formatting', () => {
    const out = sanitizeHtml('<p><strong>Bold</strong> and <em>italic</em></p><ul><li>one</li></ul>');
    expect(out).toContain('<strong>Bold</strong>');
    expect(out).toContain('<em>italic</em>');
    expect(out).toContain('<li>one</li>');
  });

  it('handles null/undefined safely', () => {
    expect(sanitizeHtml(undefined as unknown as string)).toBe('');
  });
});
