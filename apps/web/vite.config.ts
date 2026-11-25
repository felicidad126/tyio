import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// Warna dari mockup: bilah samping gelap dan latar halaman terang.
const THEME_COLOR = '#182433';
const BACKGROUND_COLOR = '#f6f8fb';

export default defineConfig({
  plugins: [
    vue(),
    // PWA (K3, T4): bisa dipasang di desktop dan ponsel. Service worker hanya menyimpan
    // berkas aplikasi (HTML, JS, CSS, ikon); jawaban API tidak pernah disimpan, karena
    // berisi data customer dan harus selalu terbaru.
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.png', 'apple-touch-icon.png', 'logo-tm.png'],
      manifest: {
        id: '/',
        // Sama dengan APP_NAME dan APP_SHORT_NAME di @npr/shared (T163); diuji di shell.spec.ts.
        name: 'Network Problem Report',
        short_name: 'NPR',
        description: 'Network Problem Report (NPR) PT. Tangara Mitrakom: tiket NPR dan TT, remote, dan ringkasan NOC.',
        lang: 'id',
        dir: 'ltr',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        theme_color: THEME_COLOR,
        background_color: BACKGROUND_COLOR,
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        // Tautan langsung ke rute aplikasi tetap terbuka dari cache; /api tidak pernah.
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api(\/|$)/],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  server: {
    // `pnpm --filter @npr/web dev`: permintaan /api diteruskan ke API yang sedang jalan,
    // bawaan stack dev dari `pnpm dev:up`. Satu origin, sama seperti di image.
    // Header Host tidak diganti (changeOrigin: false) agar pemeriksaan origin di API
    // (SameOriginGuard) melihat host yang sama dengan header Origin dari peramban.
    proxy: {
      '/api': { target: process.env.NPR_API_URL ?? 'http://localhost:8080', changeOrigin: false },
    },
  },
});
