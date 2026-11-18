import { expect, type Page, test } from '@playwright/test';
import { expectPath, fillSignIn, signInAs } from './helpers';

async function createTicket(page: Page, site: string, problem: string): Promise<{ id: string; number: string }> {
  const remote = (await (await page.request.get(`/api/remotes?q=${site}`)).json()).items[0];
  const categories = (await (await page.request.get('/api/master/kategori')).json()).items as Array<{ id: string; code: string }>;
  const res = await page.request.post('/api/tickets', {
    data: { remoteId: remote.id, categoryId: categories.find((c) => c.code === 'RD')!.id, occurredAt: new Date().toISOString(), problem, confirmOpenTickets: true },
  });
  expect(res.status()).toBe(201);
  return (await res.json()).ticket;
}

const panelTitle = (page: Page) => page.getByRole('main').getByRole('heading', { level: 1 });
const noScroll = (page: Page) =>
  page.evaluate(() => [
    document.documentElement.scrollWidth <= innerWidth,
    document.documentElement.scrollHeight <= innerHeight,
  ]);

test.describe('layar dinding', () => {
  test('tanpa interaksi: angka besar, jam berjalan, panel berganti sendiri; 1920×1080 tanpa gulir', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await signInAs(page, 'helpdesk.contoh');
    await page.getByRole('link', { name: 'Layar dinding' }).click();
    await expectPath(page, '/dinding');
    await page.goto('/dinding?putar=2');

    const total = page.getByTestId('dinding-aktif');
    await expect(total).toHaveText(/^\d[\d.]*$/);
    expect(Number.parseFloat(await total.evaluate((el) => getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(64);
    await expect(page.locator('html')).toHaveAttribute('data-bs-theme', 'dark');
    await expect(page.getByTestId('status-langsung')).toHaveText('Langsung');

    const clock = page.getByTestId('jam-dinding');
    const first = await clock.innerText();
    expect(first).toMatch(/^\d{2}\.\d{2}\.\d{2} WIB$/);
    await expect(clock).not.toHaveText(first);

    // Panel berganti tiap 2 detik. NPR baru dari uji lain bisa mengembalikan panel ke antrean,
    // jadi yang diperiksa: beberapa panel berbeda tampil dalam beberapa detik.
    const titles = new Set<string>();
    await expect
      .poll(
        async () => {
          titles.add(await panelTitle(page).innerText());
          return titles.size;
        },
        { timeout: 12_000, intervals: [250] },
      )
      .toBeGreaterThanOrEqual(3);
    expect(await noScroll(page)).toEqual([true, true]);
  });

  test('NPR baru: peringatan besar, bunyi, dan panel antrean', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await signInAs(page, 'helpdesk.contoh');
    await page.goto('/dinding?putar=2');
    await expect(page.getByTestId('status-langsung')).toHaveText('Langsung');
    await page.mouse.click(10, 10); // klik pertama: izin bunyi (dan layar penuh bila diizinkan)
    await expect(panelTitle(page)).toHaveText('NPR baru dan Selesai per hari', { timeout: 4000 });

    const problem = `Modem mati di dinding ${Date.now()}`;
    await createTicket(page, 'MRS-025', problem);

    const alert = page.getByTestId('peringatan-npr-baru').filter({ hasText: problem });
    await expect(alert).toBeVisible({ timeout: 5000 });
    await expect(alert).toContainText('MRS-025');
    await expect(panelTitle(page)).toHaveText('NPR aktif terbaru');
    await expect(page.locator('.wall')).toHaveAttribute('data-bunyi', /^[1-9]/);
    expect(await noScroll(page)).toEqual([true, true]);
  });

  test('NPR dengan waktu kejadian mundur (di luar antrean) tetap diumumkan lewat kabar langsung', async ({ page }) => {
    await signInAs(page, 'helpdesk.contoh');
    await page.goto('/dinding?putar=300');
    await expect(page.getByTestId('status-langsung')).toHaveText('Langsung');
    // Delapan NPR baru mengisi antrean, lalu satu NPR yang kejadiannya tiga hari lalu.
    for (let i = 0; i < 8; i++) await createTicket(page, 'MRS-019', `Pengisi antrean ${i}`);
    const remote = (await (await page.request.get('/api/remotes?q=MRS-019')).json()).items[0];
    const categories = (await (await page.request.get('/api/master/kategori')).json()).items as Array<{ id: string }>;
    const problem = `Dilaporkan terlambat ${Date.now()}`;
    const res = await page.request.post('/api/tickets', {
      data: {
        remoteId: remote.id,
        categoryId: categories[0]!.id,
        occurredAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
        problem,
        confirmOpenTickets: true,
      },
    });
    expect(res.status()).toBe(201);

    await expect(page.getByTestId('peringatan-npr-baru').filter({ hasText: problem })).toBeVisible({ timeout: 5000 });
  });

  test('jaringan putus: peringatan besar; pulih sendiri, NPR selama putus ikut tampil dan diumumkan', async ({ page, context }) => {
    await signInAs(page, 'helpdesk.contoh');
    await page.goto('/dinding?putar=300');
    await expect(page.getByTestId('status-langsung')).toHaveText('Langsung');

    await context.setOffline(true);
    await expect(page.getByTestId('dinding-terputus')).toContainText('Koneksi terputus sejak');
    const problem = `Selama putus ${Date.now()}`;
    const ticket = await createTicket(page, 'MRS-023', problem);
    await context.setOffline(false);

    await expect(page.getByTestId('dinding-terputus')).toHaveCount(0, { timeout: 10_000 });
    await expect(page.getByRole('main')).toContainText(ticket.number, { timeout: 5000 });
    // Kabarnya terlewat selama putus, tetapi NPR baru tetap diumumkan setelah antrean dimuat ulang.
    await expect(page.getByTestId('peringatan-npr-baru').filter({ hasText: problem })).toBeVisible();
  });

  test('sesi berakhir: layar dinding membuka halaman masuk dan kembali ke /dinding setelah masuk', async ({ page, context }) => {
    await signInAs(page, 'helpdesk.contoh');
    await page.goto('/dinding?putar=300');
    await expect(page.getByTestId('status-langsung')).toHaveText('Langsung');

    // Sesi ditutup di server (mis. kedaluwarsa atau dikeluarkan admin), lalu koneksi tersambung ulang.
    expect((await page.request.post('/api/auth/logout')).status()).toBe(204);
    await context.setOffline(true);
    await context.setOffline(false);

    await expect(page).toHaveURL((url) => url.pathname === '/login' && url.searchParams.get('next')?.startsWith('/dinding') === true, {
      timeout: 15_000,
    });
    await fillSignIn(page, 'helpdesk.contoh');
    await expectPath(page, '/dinding');
    await expect(page.getByTestId('status-langsung')).toHaveText('Langsung');
  });

  test('1280×720: tetap muat tanpa gulir; tema pengguna kembali setelah keluar dari layar dinding', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await signInAs(page, 'helpdesk.contoh');
    const theme = await page.locator('html').getAttribute('data-bs-theme');
    // Lewat tombol di Overview (tanpa memuat ulang halaman), lalu kembali di dalam aplikasi.
    await page.getByRole('link', { name: 'Layar dinding' }).click();
    await expectPath(page, '/dinding');
    await expect(page.getByTestId('dinding-aktif')).toHaveText(/^\d/);
    expect(await noScroll(page)).toEqual([true, true]);
    await page.goBack();
    await expectPath(page, '/');
    await expect(page.locator('html')).toHaveAttribute('data-bs-theme', theme ?? 'light');
  });
});
