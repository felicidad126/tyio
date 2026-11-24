import { expect, type Page, test } from '@playwright/test';
import { type Account, ACCOUNTS, accountButton, loginAs } from './accounts';

// Kerangka aplikasi (langkah 0.5): menu sesuai peran, tata letak dari ponsel 375px sampai
// layar dinding, menu akun, tema, dan PWA yang bisa dipasang.

// Alert dan Gamas dihapus dari rencana (T124, T126).
const WORK_MENU = ['Overview', 'Tiket', 'Remote', 'Laporan', 'Dokumen'];
const PATHS: Record<string, string> = {
  Overview: '/',
  Tiket: '/tiket',
  Remote: '/remote',
  Laporan: '/laporan',
  Dokumen: '/dokumen',
  Admin: '/admin',
};

const menu = (page: Page) => page.getByRole('navigation', { name: 'Menu utama' });

test.describe('menu sesuai peran', () => {
  const cases: Array<{ account: Account; items: string[] }> = [
    { account: ACCOUNTS.l1, items: WORK_MENU },
    { account: ACCOUNTS.l2, items: WORK_MENU },
    { account: ACCOUNTS.admin, items: [...WORK_MENU, 'Admin'] },
  ];

  for (const { account, items } of cases) {
    test(`${account.role}: menu tampil dan setiap halaman terbuka`, async ({ page }) => {
      await loginAs(page, account);

      await expect(menu(page).getByRole('link')).toHaveText(items);
      for (const label of items) {
        await menu(page).getByRole('link', { name: label }).click();

        await expect(page).toHaveURL(PATHS[label] ?? '');
        await expect(page.getByRole('heading', { level: 1 })).toHaveText(label);
        await expect(page).toHaveTitle(`${label} · Portal NOC Terpusat`);
        // Tepat satu menu menyala (Overview di path kosong pernah ikut menyala di semua halaman).
        await expect(menu(page).locator('[aria-current="page"]')).toHaveText(label);
        await expect(menu(page).locator('.is-active')).toHaveText(label);
      }
    });
  }

  test('jam tiga zona memakai format 17:51 dan selisih zonanya benar', async ({ page }) => {
    await loginAs(page, ACCOUNTS.l1);

    const zones = page.getByRole('list', { name: 'Jam sekarang' }).getByRole('listitem');
    await expect(zones).toHaveText([/^\d\d:\d\d WIB$/, /^\d\d:\d\d WITA$/, /^\d\d:\d\d WIT$/]);
    const hours = (await zones.allTextContents()).map((text) => Number(text.trim().slice(0, 2)));
    expect(hours.map((hour) => (hour - (hours[0] ?? 0) + 24) % 24)).toEqual([0, 1, 2]);
  });

  test('L1 yang membuka alamat Admin langsung mendapat penjelasan, bukan halaman admin', async ({ page }) => {
    await loginAs(page, ACCOUNTS.l1);

    await page.goto('/admin');

    await expect(page).toHaveURL('/admin');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tidak punya akses');
    await expect(page.getByText('Halaman Admin hanya untuk Admin')).toBeVisible();
  });

  test('mode monitor dan alamat yang tidak ada tetap di dalam kerangka', async ({ page }) => {
    await loginAs(page, ACCOUNTS.l1);

    await page.getByRole('link', { name: 'Mode monitor 24/7' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Mode monitor 24/7');

    await page.goto('/tiket/NPR-CONTOH');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Halaman tidak ditemukan');
    await expect(menu(page)).toBeVisible();
  });
});

test.describe('menu akun', () => {
  test('menampilkan akun, menutup dengan Escape, dan keluar', async ({ page }) => {
    await loginAs(page, ACCOUNTS.l2);
    const trigger = accountButton(page, ACCOUNTS.l2);

    await trigger.click();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByText(ACCOUNTS.l2.email)).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect(trigger).toBeFocused();

    await trigger.click();
    await page.getByRole('link', { name: 'Akun' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Akun');
    await expect(page.getByText('Semua customer:')).toBeVisible();

    await trigger.click();
    await page.getByRole('button', { name: 'Keluar' }).click();
    await expect(page).toHaveURL('/masuk');
  });

  test('tema gelap dipilih, diingat setelah muat ulang, dan "ikuti sistem" mengikuti peramban', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await loginAs(page, ACCOUNTS.l1);
    const html = page.locator('html');
    await expect(html).toHaveAttribute('data-bs-theme', 'dark'); // bawaan: ikuti sistem

    await accountButton(page, ACCOUNTS.l1).click();
    await page.getByRole('radio', { name: 'Terang' }).check();
    await expect(html).toHaveAttribute('data-bs-theme', 'light');
    await page.reload();
    await expect(html).toHaveAttribute('data-bs-theme', 'light');

    await accountButton(page, ACCOUNTS.l1).click();
    await page.getByRole('radio', { name: 'Ikuti sistem' }).check();
    await expect(html).toHaveAttribute('data-bs-theme', 'dark');
    await page.emulateMedia({ colorScheme: 'light' });
    await expect(html).toHaveAttribute('data-bs-theme', 'light');
  });
});

test.describe('tata letak dari ponsel sampai layar dinding', () => {
  const viewports = [
    { name: 'ponsel', width: 375, height: 740 },
    { name: 'tablet', width: 768, height: 1024 },
    { name: 'desktop', width: 1280, height: 800 },
    { name: 'layar dinding', width: 1920, height: 1080 },
  ];

  for (const viewport of viewports) {
    test(`${viewport.name} ${viewport.width}px: tanpa geser mendatar, menu dan isi terjangkau`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await loginAs(page, ACCOUNTS.admin, '/masuk?next=/dokumen');

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
      await expect(page.getByRole('heading', { level: 1 })).toBeInViewport();
      // Menu yang aktif terlihat, juga saat menu menjadi bilah mendatar yang digulir.
      await expect(menu(page).getByRole('link', { name: 'Dokumen' })).toBeInViewport();

      const side = await menu(page).boundingBox();
      if (viewport.width <= 900) {
        // Bilah mendatar di atas isi, tidak menutupi layar.
        expect(side?.y ?? Infinity).toBeLessThan(80);
        await menu(page).getByRole('link', { name: 'Admin' }).click();
        await expect(page.getByRole('heading', { level: 1 })).toHaveText('Admin');
      } else {
        expect(side?.x ?? Infinity).toBeLessThan(40);
      }
    });
  }
});

test.describe('aplikasi bisa dipasang (PWA)', () => {
  test('manifest lengkap dan ikonnya tersedia', async ({ page, request }) => {
    await page.goto('/masuk');
    const href = await page.locator('link[rel="manifest"]').getAttribute('href');
    expect(href).toBeTruthy();

    const res = await request.get(new URL(href ?? '', page.url()).toString());
    expect(res.status()).toBe(200);
    const manifest = await res.json();
    expect(manifest).toMatchObject({
      name: 'Portal NOC Terpusat',
      short_name: 'Tyio NOC',
      start_url: '/',
      display: 'standalone',
      lang: 'id',
    });
    const sizes = (manifest.icons as Array<{ sizes: string; purpose?: string; src: string }>).map(
      (icon) => `${icon.sizes}:${icon.purpose ?? 'any'}`,
    );
    expect(sizes).toEqual(expect.arrayContaining(['192x192:any', '512x512:any', '512x512:maskable']));
    for (const icon of manifest.icons as Array<{ src: string }>) {
      const image = await request.get(new URL(icon.src, page.url()).toString());
      expect(image.status(), icon.src).toBe(200);
      expect(image.headers()['content-type']).toBe('image/png');
    }
  });

  test('Chromium menilai aplikasi bisa dipasang', async ({ page, context }) => {
    await page.goto('/masuk');
    await page.evaluate(() => navigator.serviceWorker.ready);

    const cdp = await context.newCDPSession(page);
    const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors');

    // Konteks uji Playwright selalu "incognito", tempat Chrome tidak pernah menawarkan
    // pemasangan; alasan itu milik lingkungan uji, bukan aplikasi.
    const errors = installabilityErrors.map((error) => error.errorId).filter((id) => id !== 'in-incognito');
    expect(errors).toEqual([]);
  });

  test('kerangka aplikasi tetap terbuka tanpa jaringan; jawaban API tidak disimpan', async ({ page, context }) => {
    await loginAs(page, ACCOUNTS.l1);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload(); // halaman kini dikendalikan service worker
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

    const cached = await page.evaluate(async () => {
      const urls: string[] = [];
      for (const name of await caches.keys()) {
        for (const req of await (await caches.open(name)).keys()) urls.push(new URL(req.url).pathname);
      }
      return urls;
    });
    expect(cached).toContain('/index.html');
    expect(cached.filter((path) => path.startsWith('/api'))).toEqual([]);

    await context.setOffline(true);
    await page.reload();
    // Tanpa jaringan sesi tidak bisa diperiksa, jadi yang tampil halaman login dari cache.
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Portal NOC Terpusat');
    await context.setOffline(false);
  });
});

test('alamat Alert dan Gamas lama (dihapus dari rencana, T124/T126) menjadi halaman tidak ditemukan', async ({ page }) => {
  await loginAs(page, ACCOUNTS.l1);
  for (const path of ['/alert', '/gamas']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Halaman tidak ditemukan');
  }
  await expect(menu(page).getByRole('link', { name: /^(Alert|Gamas)$/ })).toHaveCount(0);
});
