import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        // Keep the browser-facing Host so the API can compare it with Origin.
        // Vite's string shorthand enables changeOrigin and breaks this check.
        changeOrigin: false,
      },
    },
  },
});
