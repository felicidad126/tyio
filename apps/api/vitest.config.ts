import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    environment: 'node',
    // Uji memakai PostgreSQL asli (T11); global setup menjalankan migrasi sekali.
    globalSetup: ['test/global-setup.ts'],
  },
});
