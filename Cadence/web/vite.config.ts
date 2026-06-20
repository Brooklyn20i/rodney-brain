import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base: './' keeps asset paths relative so the build works whether it's served
// from a domain root or a subpath.
export default defineConfig({
  plugins: [react()],
  base: './',
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
