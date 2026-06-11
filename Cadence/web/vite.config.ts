import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base: './' keeps asset paths relative so the build works whether it's served
// from a domain root or a GitHub Pages subpath (e.g. /rodney-brain/).
export default defineConfig({
  plugins: [react()],
  base: './',
});
