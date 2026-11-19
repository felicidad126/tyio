import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [vue()],
  server: {
    // `pnpm --filter @tyio/web dev`: permintaan /api diteruskan ke API yang sedang jalan,
    // bawaan stack dev dari `pnpm dev:up`. Satu origin, sama seperti di image.
    // Header Host tidak diganti (changeOrigin: false) agar pemeriksaan origin di API
    // (SameOriginGuard) melihat host yang sama dengan header Origin dari peramban.
    proxy: {
      '/api': { target: process.env.TYIO_API_URL ?? 'http://localhost:8080', changeOrigin: false },
    },
  },
});
