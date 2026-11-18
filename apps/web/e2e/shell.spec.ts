import { expect, type Page, test } from '@playwright/test';
import { expectNoPageOverflow, expectPath, signInAs } from './helpers';

// Menu Dokumen (Shared) tidak dibuat (K31); Gamas dihapus (K45).
const OPERATIONAL = ['Overview', 'Alert', 'Tiket', 'Remote', 'Laporan'];
/** Modul yang sudah punya halaman sungguhan, bukan halaman penanda. */
const BUILT = ['Overview', 'Remote', 'Tiket', 'Laporan'];
const PAGES: Record<string, string> = {
  Overview: '/',
  Alert: '/alert',
  Tiket: '/tiket',
  Remote: '/remote',
  Laporan: '/laporan',
};

const mainMenu = (page: Page) => page.getByRole('navigation', { name: 'Menu utama' });
const menuLabels = async (page: Page) =>
  (await mainMenu(page).getByRole('link').allInnerTexts()).map((t) => t.trim());

test.describe('navigasi per peran', () => {
  test('Helpdesk melihat semua modul operasional tanpa Admin, dan setiap menu membuka halamannya', async ({ page }) => {
    await signInAs(page, 'helpdesk.contoh');

    expect(await menuLabels(page)).toEqual(OPERATIONAL);

    for (const label of OPERATIONAL) {
      await mainMenu(page).getByRole('link', { name: label }).click();
      await expectPath(page, PAGES[label]!);
      await expect(mainMenu(page).getByRole('link', { name: label })).toHaveAttribute('aria-current', 'page');
      if (label !== 'Overview') {
        await expect(page.getByRole('heading', { level: 1 })).toHaveText(label);
      }
      if (!BUILT.includes(label)) {
        await expect(page.getByText(`Modul ${label} sedang dibangun`)).toBeVisible();
      }
    }
  });

  test('admin melihat menu Admin dan bisa membukanya', async ({ page }) => {
    await signInAs(page, 'admin.contoh');

    expect(await menuLabels(page)).toEqual([...OPERATIONAL, 'Admin']);
    await mainMenu(page).getByRole('link', { name: 'Admin' }).click();

    await expectPath(page, '/admin/master/customer');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Master data');
    await expect(mainMenu(page).getByRole('link', { name: 'Admin' })).toHaveAttribute('aria-current', 'page');
  });

  test('Helpdesk yang membuka /admin langsung mendapat halaman tanpa akses', async ({ page }) => {
    await signInAs(page, 'helpdesk.contoh');

    await page.goto('/admin');

    await expectPath(page, '/tanpa-akses');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Halaman ini tidak tersedia untuk peran Anda',
    );
    await page.getByRole('link', { name: 'Kembali ke Overview' }).click();
    await expectPath(page, '/');
  });
});

test.describe('tata letak dari ponsel sampai layar dinding', () => {
  test('ponsel 375 px: menu lewat tombol, tanpa gulir samping, target sentuh minimal 44 px', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 740 });
    await signInAs(page, 'helpdesk.contoh');
    await expectNoPageOverflow(page);
    await expect(mainMenu(page)).toBeHidden();

    const toggle = page.getByRole('button', { name: 'Buka menu' });
    const box = await toggle.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(44);

    await toggle.click();
    await expect(mainMenu(page)).toBeVisible();
    await expectNoPageOverflow(page);
    for (const link of await mainMenu(page).getByRole('link').all()) {
      expect((await link.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    }

    await mainMenu(page).getByRole('link', { name: 'Tiket' }).click();
    await expectPath(page, '/tiket');
    await expect(mainMenu(page)).toBeHidden(); // menu tertutup sendiri setelah berpindah
  });

  for (const width of [1280, 2560]) {
    test(`lebar ${width} px: sidebar selalu tampil, tanpa gulir samping`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await signInAs(page, 'helpdesk.contoh');

      await expect(mainMenu(page)).toBeVisible();
      await expect(page.getByRole('button', { name: 'Buka menu' })).toBeHidden();
      await expectNoPageOverflow(page);
    });
  }
});

test.describe('menu pengguna', () => {
  // Teks diperbesar meniru pengaturan ukuran huruf browser dan font yang lebih lebar
  // (mis. di Linux): header ponsel harus tetap satu baris, bukan turun ke baris kedua.
  const CASES = [
    { label: '375 px', width: 375, textScale: 1 },
    { label: '375 px, teks diperbesar 125%', width: 375, textScale: 1.25 },
    { label: '1280 px', width: 1280, textScale: 1 },
  ];
  for (const { label, width, textScale } of CASES) {
    test(`panel menu pengguna utuh di dalam layar (${label})`, async ({ page }) => {
      await page.setViewportSize({ width, height: 760 });
      await signInAs(page, 'helpdesk.merapi');
      if (textScale !== 1) await page.addStyleTag({ content: `html { font-size: ${textScale * 100}% }` });
      const trigger = page.getByRole('button', { name: 'Menu pengguna Helpdesk Merapi', exact: true });

      if (width < 768) {
        const toggle = await page.getByRole('button', { name: 'Buka menu' }).boundingBox();
        const own = await trigger.boundingBox();
        expect(Math.abs(own!.y + own!.height / 2 - (toggle!.y + toggle!.height / 2)), 'satu baris dengan tombol menu').toBeLessThan(4);
        expect(own!.x + own!.width, 'di tepi kanan header').toBeGreaterThan(width - 40);
      }
      await trigger.click();

      const panel = page.getByText('Customer: Bank Merapi Sejahtera');
      await expect(panel).toBeInViewport({ ratio: 1 });
      await expect(page.getByRole('button', { name: 'Keluar' })).toBeInViewport({ ratio: 1 });
      await expectNoPageOverflow(page);
    });
  }

  test('menampilkan akun, mengganti tema, dan bisa dipakai dengan keyboard', async ({ page }) => {
    await signInAs(page, 'helpdesk.merapi');
    const trigger = page.getByRole('button', { name: 'Menu pengguna Helpdesk Merapi', exact: true });

    await trigger.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByText('Customer: Bank Merapi Sejahtera')).toBeVisible();

    await page.getByRole('button', { name: 'Gelap' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-bs-theme', 'dark');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-bs-theme', 'dark'); // pilihan diingat

    await trigger.click();
    await page.keyboard.press('Escape');
    await expect(page.getByText('Customer: Bank Merapi Sejahtera')).toBeHidden();
    await expect(trigger).toBeFocused();
  });
});

test.describe('aplikasi yang bisa dipasang (PWA)', () => {
  test('manifest dan ikon lengkap', async ({ page, request }) => {
    await page.goto('/login');
    const href = await page.locator('link[rel="manifest"]').getAttribute('href');
    expect(href).toBeTruthy();

    const manifest = await (await request.get(href!)).json();
    expect(manifest).toMatchObject({
      name: 'Portal NOC Terpusat',
      short_name: 'Portal NOC',
      start_url: '/',
      display: 'standalone',
      lang: 'id',
    });
    const sizes = manifest.icons.map((i: { sizes: string; purpose?: string }) => `${i.sizes}:${i.purpose ?? 'any'}`);
    expect(sizes).toEqual(expect.arrayContaining(['192x192:any', '512x512:any', '512x512:maskable']));
    for (const icon of manifest.icons as Array<{ src: string }>) {
      const res = await request.get(icon.src);
      expect(res.status(), icon.src).toBe(200);
      expect(res.headers()['content-type']).toContain('image/png');
    }
  });

  test('service worker aktif dan tidak menyimpan jawaban API', async ({ page }) => {
    await page.goto('/login');
    const state = await page.evaluate(async () => {
      // `ready` sudah selesai saat worker masih "activating"; tunggu sampai aktif penuh.
      const worker = (await navigator.serviceWorker.ready).active;
      if (worker && worker.state !== 'activated') {
        await new Promise<void>((resolve) =>
          worker.addEventListener('statechange', () => worker.state === 'activated' && resolve()),
        );
      }
      return worker?.state;
    });
    expect(state).toBe('activated');

    await page.reload();
    const cachedApi = await page.evaluate(async () => {
      const urls: string[] = [];
      for (const name of await caches.keys()) {
        for (const req of await (await caches.open(name)).keys()) urls.push(new URL(req.url).pathname);
      }
      return { total: urls.length, api: urls.filter((u) => u.startsWith('/api')) };
    });
    expect(cachedApi.total).toBeGreaterThan(0);
    expect(cachedApi.api).toEqual([]);

    // Dengan service worker aktif, alamat API tetap dijawab API, bukan halaman aplikasi.
    const res = await page.goto('/api/health');
    expect(res?.headers()['content-type']).toContain('application/json');
  });
});
