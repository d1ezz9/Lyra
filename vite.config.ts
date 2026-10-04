import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
export default defineConfig({
  plugins: [react()],
  base: './',
  resolve: { alias: { '@common': path.resolve(__dirname, 'common') } },
  build: { outDir: 'dist' },
  server: { port: 5173 },
});
