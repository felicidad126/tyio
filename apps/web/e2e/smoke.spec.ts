import { expect, test } from '@playwright/test';

// Uji asap: satu origin melayani aplikasi web dan API, dan API terhubung ke database.
// Tanpa sesi, setiap halaman aplikasi berakhir di halaman login (alurnya di auth.spec.ts).
test.describe('uji asap', () => {
  test('halaman login terbuka tanpa galat di browser', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.goto('/');

    await expect(page).toHaveTitle('Masuk · Network Problem Report');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Network Problem Report');
    await expect(page.getByRole('button', { name: 'Masuk' })).toBeVisible();
    expect(pageErrors).toEqual([]);
  });

  test('tautan langsung ke rute aplikasi tetap membuka aplikasi', async ({ page }) => {
    await page.goto('/tiket/NPR-CONTOH');

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Network Problem Report');
  });

  test('API sehat dan terhubung ke database', async ({ request }) => {
    const res = await request.get('/api/health');

    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok', database: 'ok' });
  });
});
