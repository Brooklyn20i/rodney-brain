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
        // Cache all built assets (JS chunks, CSS, fonts, icons).
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // With base './', workbox needs to know the relative path prefix.
        // By default it caches from the root of the output dir — correct for gh-pages.
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
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/@tiptap/') || id.includes('/node_modules/@tiptap')) return 'tiptap';
          if (id.includes('/node_modules/@sentry/')) return 'sentry';
          if (id.includes('/node_modules/')) return 'vendor';
          if (id.includes('/src/screens/')) {
            const name = id.split('/src/screens/')[1].replace(/\.tsx?$/, '').toLowerCase();
            return `screen-${name}`;
          }
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test-setup.ts',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/lib/**/*.ts'],
    },
  },
});
