import { expect, test } from '@playwright/test';
import { expectLoginPage } from './helpers';

// Uji asap: satu origin melayani aplikasi web dan API, dan API terhubung ke database.
test.describe('uji asap', () => {
  test('halaman login terbuka tanpa galat di browser', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.goto('/');

    await expectLoginPage(page, '/');
    await expect(page).toHaveTitle('Masuk · Portal NOC Terpusat');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Masuk ke portal');
    expect(pageErrors).toEqual([]);
  });

  test('tautan langsung ke rute aplikasi tetap membuka aplikasi', async ({ page }) => {
    await page.goto('/tiket/NPR-CONTOH');

    await expectLoginPage(page, '/tiket/NPR-CONTOH');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Masuk ke portal');
  });

  test('API sehat dan terhubung ke database', async ({ request }) => {
    const res = await request.get('/api/health');

    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok', database: 'ok' });
  });
});
