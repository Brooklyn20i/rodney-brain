import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const healthHtml = () => readFileSync(resolve(__dirname, '../../../../health.html'), 'utf8');

describe('Cadence Health boot shell', () => {
  it('paints a non-white mobile shell before React hydrates', () => {
    const html = healthHtml();

    expect(html).toContain('html, body, #root');
    expect(html).toContain('background: #0B0E0C');
    expect(html).toContain('cadence-health-boot');
  });
});
