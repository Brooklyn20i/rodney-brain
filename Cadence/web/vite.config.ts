import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// base: './' keeps asset paths relative so the build works whether it's served
// from a domain root or a subpath (GitHub Pages or Vercel).
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Use the existing manifest.json from public/ rather than generating one.
      manifest: false,
      workbox: {
        // Serve cached index.html for all navigation requests when offline.
        // Without this, opening the URL offline fails at the network level
        // before the service worker can intercept it.
        navigateFallback: '/work.html',
        cleanupOutdatedCaches: true,
        // Cache all built assets (JS chunks, CSS, fonts, icons).
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            // Supabase REST reads: network-first with a 5 s timeout.
            // On timeout / offline, serve the cached response so screens load.
            urlPattern: /^https:\/\/[a-z0-9]+\.supabase\.co\/rest\//,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-api-v1',
              networkTimeoutSeconds: 5,
              cacheableResponse: { statuses: [0, 200] },
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 },
            },
          },
          {
            // Supabase Auth endpoints: network-only (never cache tokens).
            urlPattern: /^https:\/\/[a-z0-9]+\.supabase\.co\/auth\//,
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
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
