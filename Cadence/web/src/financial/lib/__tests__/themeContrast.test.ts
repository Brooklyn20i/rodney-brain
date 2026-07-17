import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const styles = readFileSync(new URL('src/styles.css', `file://${process.cwd()}/`), 'utf8');

function financialThemeTokens(): Record<string, string> {
  const block = styles.match(/html\[data-domain="financial"\]\s*\{([^}]*)\}/)?.[1];
  if (!block) throw new Error('Financial theme block is missing');

  return Object.fromEntries(
    [...block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((match) => [match[1], match[2].trim()])
  );
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
});
