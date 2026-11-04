import { defineConfig } from 'vite';

export default defineConfig({
  envDir: '..',
  build: { outDir: '../dist', emptyOutDir: true },
  server: {
    port: 3000,
    strictPort: true,
    proxy: {
      '/api': { target: 'http://127.0.0.1:4000', changeOrigin: false },
    },
  },
});
