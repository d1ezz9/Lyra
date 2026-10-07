import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { execSync } from 'node:child_process';

function buildId(): string {
  try {
    const sha = execSync('git rev-parse --short HEAD').toString().trim();
    const date = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
    return `${sha}-${date}`;
  } catch { return `nogit-${Date.now()}`; }
}
export default defineConfig({
  plugins: [react()],
  base: './',
  define: { __BUILD_ID__: JSON.stringify(buildId()) },
  resolve: { alias: { '@common': path.resolve(__dirname, 'common') } },
  build: { outDir: 'dist' },
  server: { port: 5173 },
});
