import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const api = process.env.KB_API ?? 'http://localhost:8080';

// The board editor (Excalidraw, D-46) is loaded lazily from its production build — the `development` condition used
// for @kb/shared sources must not pull its unminified dev build into the bundle.
const here = dirname(fileURLToPath(import.meta.url));
const excalidrawDir = [resolve(here, 'node_modules/@excalidraw/excalidraw/dist/prod'), resolve(here, '../../node_modules/@excalidraw/excalidraw/dist/prod')].find((d) => existsSync(d)) ?? resolve(here, '../../node_modules/@excalidraw/excalidraw/dist/prod');
/** Fonts of the board editor, served by this instance (CSP: no third-party font hosts). The CJK font is left out. */
const EXCALIDRAW_FONTS = ['Assistant', 'Excalifont', 'Virgil', 'Nunito', 'Liberation', 'Cascadia', 'ComicShanns', 'Lilita'];

function excalidrawAssets(): Plugin {
  const files = () =>
    EXCALIDRAW_FONTS.flatMap((dir) => {
      const d = join(excalidrawDir, 'fonts', dir);
      return existsSync(d) ? readdirSync(d).filter((f) => f.endsWith('.woff2')).map((f) => `fonts/${dir}/${f}`) : [];
    });
  return {
    name: 'kb-excalidraw-assets',
    configureServer(server) {
      server.middlewares.use('/excalidraw-assets/', (req, res, next) => {
        const rel = decodeURIComponent((req.url ?? '').split('?')[0]).replace(/^\/+/, '');
        const file = join(excalidrawDir, rel);
        if (!rel.startsWith('fonts/') || rel.includes('..') || !existsSync(file) || !statSync(file).isFile()) return next();
        res.setHeader('content-type', 'font/woff2');
        res.end(readFileSync(file));
      });
    },
    generateBundle() {
      for (const f of files()) this.emitFile({ type: 'asset', fileName: `excalidraw-assets/${f}`, source: readFileSync(join(excalidrawDir, f)) });
    },
  };
}

export default defineConfig({
  plugins: [react(), excalidrawAssets()],
  resolve: {
    conditions: ['development'],
    alias: [
      { find: /^@excalidraw\/excalidraw$/, replacement: join(excalidrawDir, 'index.js') },
      { find: /^@excalidraw\/excalidraw\/index\.css$/, replacement: join(excalidrawDir, 'index.css') },
    ],
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: api, ws: true, changeOrigin: false },
      '/healthz': api,
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    chunkSizeWarningLimit: 4000,
  },
});
