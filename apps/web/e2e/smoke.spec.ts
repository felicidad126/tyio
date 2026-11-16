import { expect, test } from '@playwright/test';

// Uji asap: satu origin melayani aplikasi web dan API, dan API terhubung ke database.
// Halaman login menyusul di langkah 0.3; sampai saat itu yang diperiksa halaman utama.
test.describe('uji asap', () => {
  test('halaman utama terbuka tanpa galat di browser', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.goto('/');

    await expect(page).toHaveTitle('Portal NOC Terpusat');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Portal NOC Terpusat');
    expect(pageErrors).toEqual([]);
  });

  test('tautan langsung ke rute aplikasi tetap membuka aplikasi', async ({ page }) => {
    await page.goto('/tiket/NPR-CONTOH');

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Portal NOC Terpusat');
  });

  test('API sehat dan terhubung ke database', async ({ request }) => {
    const res = await request.get('/api/health');

    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok', database: 'ok' });
  });
});
