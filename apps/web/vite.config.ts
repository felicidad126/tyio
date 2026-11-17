import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const THEME_COLOR = '#066fd1';

export default defineConfig({
  plugins: [
    vue(),
    // PWA (T4): aplikasi bisa dipasang di desktop dan ponsel.
    VitePWA({
      // Versi baru ditawarkan lewat UpdatePrompt, tidak dimuat paksa (operator bisa sedang mengisi form).
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Portal NOC Terpusat',
        short_name: 'Portal NOC',
        description: 'Tiket, gangguan massal, dan monitoring remote untuk tim NOC.',
        lang: 'id',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        theme_color: THEME_COLOR,
        background_color: '#ffffff',
        icons: [
          { src: '/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Hanya cangkang aplikasi yang disimpan. Jawaban API selalu dari jaringan:
        // data operasional tidak boleh tampil basi.
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api(\/|$)/],
        runtimeCaching: [],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  server: {
    // `pnpm --filter @tyio/web dev`: permintaan /api diteruskan ke API yang sedang jalan,
    // bawaan stack dev dari `pnpm dev:up`. Satu origin, sama seperti di image.
    proxy: {
      '/api': process.env.TYIO_API_URL ?? 'http://localhost:8080',
    },
  },
});
