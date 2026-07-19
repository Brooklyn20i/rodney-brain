import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { FINANCIAL_THEME_STYLE } from '../../../lib/domainTheme';

const styles = readFileSync(new URL('src/styles.css', `file://${process.cwd()}/`), 'utf8');
const financialShell = readFileSync(new URL('financial.html', `file://${process.cwd()}/`), 'utf8');

function tokensFrom(block: string): Record<string, string> {
  return Object.fromEntries(
    [...block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((match) => [match[1], match[2].trim()])
  );
}

function financialThemeTokens(): Record<string, string> {
  const block = styles.match(/html\[data-domain="financial"\]\s*\{([^}]*)\}/)?.[1];
  if (!block) throw new Error('Financial theme block is missing');
  return tokensFrom(block);
}

// The boot <style> in financial.html is a THIRD copy of the same tokens (the
// one no test used to guard). Parse its :root block so drift here fails CI too.
function financialBootTokens(): Record<string, string> {
  const style = financialShell.match(/id="financial-boot-theme"[\s\S]*?<\/style>/)?.[0];
  if (!style) throw new Error('financial.html boot theme <style> is missing');
  const block = style.match(/:root\s*\{([^}]*)\}/)?.[1];
  if (!block) throw new Error('financial.html boot :root block is missing');
  return tokensFrom(block);
}

function luminance(hex: string): number {
  const rgb = hex
    .replace('#', '')
    .match(/.{2}/g)
    ?.map((channel) => Number.parseInt(channel, 16) / 255)
    .map((channel) =>
      channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
    );

  if (!rgb || rgb.length !== 3) throw new Error(`Expected a six-digit hex colour, got ${hex}`);
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}

function contrastRatio(foreground: string, background: string): number {
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

describe('Financial theme contrast', () => {
  it('owns its light surface and text tokens so Wealth stays readable after another domain theme', () => {
    const tokens = financialThemeTokens();

    expect(tokens['--app-bg']).toBe('#F4F4F0');
    expect(tokens['--surface']).toBe('#FFFFFF');
    expect(tokens['--surface2']).toBe('#F8F8F6');
    expect(tokens['--text']).toBe('#1A1A1A');
    expect(tokens['--text2']).toBe('#6B6B6B');
    expect(tokens['--text3']).toBe('#ABABAB');
    expect(contrastRatio(tokens['--text'], tokens['--surface'])).toBeGreaterThanOrEqual(7);
  });

  it('keeps the runtime Financial fallback in lockstep with the CSS theme', () => {
    const tokens = financialThemeTokens();

    for (const [name, value] of Object.entries(FINANCIAL_THEME_STYLE)) {
      expect(tokens[name].replace(/\s+/g, '').toLowerCase()).toBe(value.replace(/\s+/g, '').toLowerCase());
    }
  });

  // Root cause of the recurring bug: the theme is duplicated across the CSS,
  // the runtime object, AND the boot shell — and only the first two were
  // guarded. Pin the boot shell to the same source of truth so no future edit
  // can leave financial.html holding stale tokens.
  it('keeps the financial.html boot shell in lockstep with the theme', () => {
    const boot = financialBootTokens();
    const norm = (v: string) => v.replace(/\s+/g, '').toLowerCase();

    // Every token the boot floor carries must match the source of truth…
    for (const [name, value] of Object.entries(boot)) {
      expect(FINANCIAL_THEME_STYLE).toHaveProperty(name);
      expect(norm(value)).toBe(norm((FINANCIAL_THEME_STYLE as Record<string, string>)[name]));
    }
    // …and the readability-critical ones must be present, so they can't be
    // quietly dropped from the shell.
    for (const critical of ['--app-bg', '--surface', '--text', '--text2', '--text3']) {
      expect(boot).toHaveProperty(critical);
    }
  });
});
