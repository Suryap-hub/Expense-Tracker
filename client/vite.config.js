import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // In development the React app calls /api/* and Vite forwards it to Express,
    // so cookies stay first-party and no CORS setup is needed.
    proxy: { '/api': { target: 'http://localhost:5000', changeOrigin: true } },
  },
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (/react-dom|react-router|scheduler|\/react\//.test(id)) return 'react';
            if (id.includes('@tanstack')) return 'query';
          }
        },
      },
    },
  },
});
