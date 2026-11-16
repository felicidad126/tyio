import { expect, type Page } from '@playwright/test';

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
