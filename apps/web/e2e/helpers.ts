import { expect, type Page } from '@playwright/test';

/** Kata sandi akun contoh dari seed: bawaan dev, atau E2E_PASSWORD di staging/CI. */
export const SEED_PASSWORD = process.env.E2E_PASSWORD ?? 'contoh-dev-2026';

/** Mengisi form masuk di halaman yang sedang terbuka. */
export async function fillSignIn(page: Page, username: string, password = SEED_PASSWORD): Promise<void> {
  await page.getByLabel('Nama pengguna').fill(username);
  await page.getByLabel('Kata sandi', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Masuk' }).click();
}

/** Masuk sebagai pengguna contoh dan menunggu Overview tampil. */
export async function signInAs(page: Page, username: string): Promise<void> {
  await page.goto('/login');
  await fillSignIn(page, username);
  await expect(page.getByRole('heading', { level: 1, name: /Selamat datang/ })).toBeVisible();
}

/** Berada di halaman masuk, dengan tujuan `next` tertentu (atau tanpa `next`). */
export async function expectLoginPage(page: Page, next?: string): Promise<void> {
  await expect(page).toHaveURL(
    (url) =>
      url.pathname === '/login' &&
      (next === undefined ? !url.searchParams.has('next') : url.searchParams.get('next') === next),
  );
}

/** Berada di jalur `pathname` aplikasi. */
export async function expectPath(page: Page, pathname: string): Promise<void> {
  await expect(page).toHaveURL((url) => url.pathname === pathname);
}

/** Tidak ada gulir horizontal di tingkat halaman. */
export async function expectNoPageOverflow(page: Page): Promise<void> {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth, 'halaman bergulir ke samping').toBeLessThanOrEqual(clientWidth);
}
