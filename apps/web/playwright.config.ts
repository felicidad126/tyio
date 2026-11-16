import { defineConfig, devices } from '@playwright/test';

// Uji layar berjalan terhadap aplikasi yang sudah menyala (bawaan: stack dev dari
// `pnpm dev:up`). Ganti sasaran dengan E2E_BASE_URL, mis. untuk staging.
export default defineConfig({
  testDir: './e2e',
  forbidOnly: Boolean(process.env.CI),
  reporter: 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:8080',
    trace: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Opsional: pakai Chromium yang sudah terpasang alih-alih unduhan Playwright.
        launchOptions: { executablePath: process.env.E2E_CHROMIUM_PATH || undefined },
      },
    },
  ],
});
