import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

const HERMES_HOST = process.env.HERMES_HOST ?? 'http://127.0.0.1:9119';

export default defineConfig({
  root: __dirname,
  base: './',
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: HERMES_HOST,
        changeOrigin: true,
        ws: true,
      },
      '/auth': {
        target: HERMES_HOST,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: '../../dashboard/dist/mobile',
    emptyOutDir: true,
    sourcemap: false,
  },
  resolve: {
    alias: {
      '@hermes-pwa/core': resolve(__dirname, '../core/src/index.ts'),
    },
  },
});
