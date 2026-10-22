import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const api = process.env.KB_API ?? 'http://localhost:8080';

export default defineConfig({
  plugins: [react()],
  resolve: { conditions: ['development'] },
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
