import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL(path, `file://${process.cwd()}/`), 'utf8');

describe('Cadence Financial product branding', () => {
  it('uses Cadence Financial across install, shell, landing, tour and app labels', () => {
    const customerFacingSurfaces = [
      read('financial.html'),
      read('public/manifest-financial.json'),
      read('index.html'),
      read('tour-wealth.html'),
      read('tour-work.html'),
      read('tour-health.html'),
      read('kobe.html'),
      read('src/App.tsx'),
    ];

    for (const surface of customerFacingSurfaces) {
      expect(surface).not.toContain('Cadence Wealth');
    }

    for (const marketingPage of customerFacingSurfaces.slice(2, 7)) {
      expect(marketingPage).not.toMatch(/>[^<]*\bWealth\b[^<]*</);
    }

    expect(customerFacingSurfaces.join('\n')).toContain('Cadence Financial');

    const productionSmoke = read('scripts/prod-smoke.mjs');
    expect(productionSmoke).toContain("['/financial', 'Cadence Financial']");
    expect(productionSmoke).toContain("['/tour/wealth', 'Financial']");
    expect(productionSmoke).not.toContain("['/financial', 'Cadence Wealth']");
  });
});
