import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';

const projectFile = (path: string): string => new URL(path, `file://${process.cwd()}/`).pathname;
const readProjectFile = (path: string): string => {
  const file = projectFile(path);
  return existsSync(file) ? readFileSync(file, 'utf8') : '';
};

describe('PWA deployment coherence', () => {
  it('uses an app-owned service worker that refreshes open app clients when replacing an older worker', () => {
    const viteConfig = readProjectFile('vite.config.ts');
    const serviceWorker = readProjectFile('src/sw.ts');

    expect(viteConfig).toContain("strategies: 'injectManifest'");
    expect(viteConfig).toContain("filename: 'sw.ts'");
    expect(serviceWorker).toContain('Boolean(self.registration.active)');
    expect(serviceWorker).toContain("self.addEventListener('activate'");
    expect(serviceWorker).toContain("includeUncontrolled: true");
    expect(serviceWorker).toContain('client.navigate(client.url)');
  });

  it('serves the matching cached app shell for each domain route', () => {
    const serviceWorker = readProjectFile('src/sw.ts');

    expect(serviceWorker).toContain("createHandlerBoundToURL('/work.html')");
    expect(serviceWorker).toContain("createHandlerBoundToURL('/financial.html')");
    expect(serviceWorker).toContain("createHandlerBoundToURL('/health.html')");
    expect(serviceWorker).toContain("allowlist: [/^\\/work\\/?(?:\\?.*)?$/]");
    expect(serviceWorker).toContain("allowlist: [/^\\/financial\\/?(?:\\?.*)?$/]");
    expect(serviceWorker).toContain("allowlist: [/^\\/(?:health|fitness)\\/?(?:\\?.*)?$/]");
  });

  it('protects Financial contrast in the static shell before React or cached CSS runs', () => {
    const financialShell = readProjectFile('financial.html');

    expect(financialShell).toContain('id="financial-boot-theme"');
    expect(financialShell).toContain('--surface: #FFFFFF');
    expect(financialShell).toContain('--text: #1A1A1A');
    // A hard readability floor that does not depend on the runtime data-domain
    // attribute, so a mid-update handover can never paint pale-on-white.
    expect(financialShell).toMatch(/html,\s*body,\s*#root\s*\{[^}]*color:\s*#1A1A1A/);
  });

  it('keeps the Financial boot theme a FLOOR, not an override of the loaded CSS', () => {
    const financialShell = readProjectFile('financial.html');
    // Scoped to :root (0,1,0), never html[data-domain="financial"]:root (0,2,1)
    // — otherwise a stale cached shell served during a PWA update would win over
    // the fresh app stylesheet's html[data-domain="financial"] rules (0,1,1).
    // That inverted specificity was a root cause of the recurring contrast bug.
    expect(financialShell).not.toContain('html[data-domain="financial"]:root');
    expect(financialShell).toMatch(/id="financial-boot-theme"[\s\S]*?:root\s*\{/);
  });
});
