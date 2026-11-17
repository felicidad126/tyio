import { defineConfig } from 'vitest/config';

// Uji unit modul TypeScript murni (mis. pembaca Excel). Halaman diuji lewat Playwright.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
