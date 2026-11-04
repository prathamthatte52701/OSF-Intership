import { defineConfig } from 'vite';

const apiTarget = process.env.OSF_API_ORIGIN || 'http://127.0.0.1:4000';

export default defineConfig({
  envDir: '..',
  build: { outDir: '../dist', emptyOutDir: true },
  server: {
    port: 3000,
    strictPort: true,
    proxy: {
      '/api': { target: apiTarget, changeOrigin: false },
    },
  },
});
