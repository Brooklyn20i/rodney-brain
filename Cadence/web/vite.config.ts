import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const buildCommit =
  process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ??
  (() => {
    try {
      return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    } catch {
      return 'dev';
    }
  })();

// base: './' keeps asset paths relative so the build works whether it's served
// from a domain root or a subpath (GitHub Pages or Vercel).
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      // Use the existing manifest.json from public/ rather than generating one.
      manifest: false,
      injectManifest: {
        // Cache all built app assets. Navigation routing and update handover are
        // app-owned in src/sw.ts so each domain gets its own shell and an old
        // open PWA is refreshed by the replacement worker itself.
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        globIgnores: ['**/shots/**', '**/wallpapers/**', 'assets/react-pdf-*.js'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      },
    }),
  ],
  define: {
    __BUILD_COMMIT__: JSON.stringify(buildCommit),
  },
  base: '/',
  build: {
    // Route-based code splitting: each screen ships in its own chunk,
    // cutting the initial JS payload from ~970KB to ~200KB.
    rollupOptions: {
      // Per-domain HTML entry points. Each is the same SPA (loads main.tsx)
      // but carries its own apple-touch-icon, title and static data-domain so
      // the iPhone Home Screen shortcut gets a distinct icon and opens straight
      // into that section with no theme flash. Vercel rewrites /financial and
      // /health onto these (see vercel.json).
      input: {
        main: 'index.html', // marketing landing page (sells Cadence)
        tourWork: 'tour-work.html', // marketing: Work feature tour
        tourWealth: 'tour-wealth.html', // marketing: Wealth feature tour
        tourHealth: 'tour-health.html', // marketing: Health feature tour
        kobe: 'kobe.html', // marketing: agent page
        work: 'work.html', // the Work app shell (root used to be this)
        financial: 'financial.html',
        health: 'health.html',
      },
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/@react-pdf/') || id.includes('/node_modules/@react-pdf')) return 'react-pdf';
          if (id.includes('/node_modules/@tiptap/') || id.includes('/node_modules/@tiptap')) return 'tiptap';
          if (id.includes('/node_modules/@sentry/')) return 'sentry';
          if (id.includes('/node_modules/')) return 'vendor';
          if (id.includes('/src/screens/')) {
            const name = id.split('/src/screens/')[1].replace(/\.tsx?$/, '').toLowerCase();
            return `screen-${name}`;
          }
          if (id.includes('/src/financial/screens/')) {
            const name = id.split('/src/financial/screens/')[1].replace(/\.tsx?$/, '').toLowerCase();
            return `screen-financial-${name}`;
          }
          if (id.includes('/src/fitness/screens/')) {
            const name = id.split('/src/fitness/screens/')[1].replace(/\.tsx?$/, '').toLowerCase();
            return `screen-fitness-${name}`;
          }
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    // Give jsdom a real origin (default is opaque about:blank) so localStorage
    // works — the offline queue and stores depend on it.
    environmentOptions: { jsdom: { url: 'https://localhost/' } },
    globals: true,
    setupFiles: './src/test-setup.ts',
    // Vitest owns the src unit/component tests; Playwright owns e2e/ — keep the
    // *.spec.ts files under e2e/ out of vitest's discovery.
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/lib/**/*.ts', 'src/financial/lib/**/*.ts', 'src/fitness/lib/**/*.ts'],
    },
  },
});
