import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // The app canonically lives under /financial/ -- both on its own Vercel
  // domain and when proxied from cadence-agent.com/financial (the main
  // Cadence project rewrites that prefix here). Assets and the /api quotes
  // path all hang off this base.
  base: '/financial/',
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test-setup.ts',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/lib/**/*.ts'],
    },
  },
});
