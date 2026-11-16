import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [vue()],
  server: {
    // `pnpm --filter @tyio/web dev`: permintaan /api diteruskan ke API yang sedang jalan,
    // bawaan stack dev dari `pnpm dev:up`. Satu origin, sama seperti di image.
    proxy: {
      '/api': process.env.TYIO_API_URL ?? 'http://localhost:8080',
    },
  },
});
