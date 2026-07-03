import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // The app canonically lives under /fitness/ -- both on its own Vercel
  // domain and when proxied from cadence-agent.com/fitness (the main
  // Cadence project rewrites that prefix here), mirroring how Cadence
  // Financial hangs off /financial/.
  base: '/fitness/',
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
