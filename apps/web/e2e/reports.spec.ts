import { readFile } from 'node:fs/promises';
import { expect, type Page, test } from '@playwright/test';
import { expectNoPageOverflow, signInAs } from './helpers';

/** NPR baru (kejadian sekarang) lewat API, agar periode bulan ini tidak kosong. */
async function createTicket(page: Page, site: string): Promise<void> {
  const remote = (await (await page.request.get(`/api/remotes?q=${site}`)).json()).items[0];
  const categories = (await (await page.request.get('/api/master/kategori')).json()).items as Array<{ id: string; code: string }>;
  const res = await page.request.post('/api/tickets', {
    data: {
      remoteId: remote.id,
      categoryId: categories.find((c) => c.code === 'RD')!.id,
      occurredAt: new Date().toISOString(),
      problem: `Uji laporan ${Date.now()}`,
      confirmOpenTickets: true,
    },
  });
  expect(res.status()).toBe(201);
}

const number = (text: string | null) => Number((text ?? '').replace(/\D/g, ''));
const tileValue = async (page: Page, key: string) => number(await page.getByTestId(`ringkasan-${key}`).locator('.tile-value').innerText());
/** Total di bawah daftar Tiket ("1–50 dari 123 tiket"), atau 0 bila kosong. */
async function listTotal(page: Page): Promise<number> {
  await expect(page.getByText(/dari [\d.]+ tiket|Tidak ada|Belum ada/).first()).toBeVisible();
  const range = page.getByText(/dari [\d.]+ tiket/).first();
  return (await range.count()) ? number((await range.innerText()).split('dari')[1]!) : 0;
}
const filters = (page: Page) => page.getByRole('search', { name: 'Periode dan saringan laporan' });

// Uji layar lain bisa membuat tiket bersamaan; perbandingan angka diulang sampai stabil.
test.describe('laporan rekap NPR', () => {
  test('jumlah NPR dan Selesai menuju daftar Tiket dengan total yang sama; periode tampil sebagai chip', async ({ page }) => {
    await signInAs(page, 'helpdesk.contoh');
    await createTicket(page, 'BCN-011');

    for (const [key, view] of [
      ['total', 'semua'],
      ['closed', 'selesai'],
    ] as const) {
      await expect(async () => {
        await page.goto('/laporan');
        const value = await tileValue(page, key);
        if (key === 'total') expect(value).toBeGreaterThan(0);
        await page.getByTestId(`ringkasan-${key}`).click();
        await expect(page).toHaveURL(
          (url) => url.pathname === '/tiket' && url.searchParams.get('tampilan') === view && url.searchParams.has('dari'),
        );
        expect(await listTotal(page)).toBe(value);
      }).toPass({ timeout: 20_000 });
      await expect(page.getByRole('list', { name: 'Saringan dari Overview' })).toContainText('Kejadian');
    }
  });

  test('periode cepat, status, dan saringan tersimpan di alamat; muat ulang halaman tetap sama', async ({ page }) => {
    await signInAs(page, 'helpdesk.contoh');
    await createTicket(page, 'BCN-011');
    await page.goto('/laporan');
    await expect(page.getByTestId('ringkasan-total')).toBeVisible();
    await expect(filters(page).getByRole('button', { name: 'Bulan ini' })).toHaveAttribute('aria-pressed', 'true');

    await filters(page).getByRole('button', { name: 'Bulan lalu' }).click();
    await expect(page).toHaveURL((url) => url.searchParams.get('dari')?.slice(8) === '01' && url.searchParams.has('sampai'));
    await expect(filters(page).getByRole('button', { name: 'Bulan lalu' })).toHaveAttribute('aria-pressed', 'true');
    await expect(filters(page).getByRole('button', { name: 'Bulan ini' })).toHaveAttribute('aria-pressed', 'false');

    await filters(page).getByRole('button', { name: 'Bulan ini' }).click();
    await filters(page).getByLabel('Status').selectOption('aktif');
    await expect(page).toHaveURL((u) => u.searchParams.get('status') === 'aktif');
    const url = new URL(page.url());
    await page.reload();
    await expect(filters(page).getByLabel('Status')).toHaveValue('aktif');
    await expect(filters(page).getByLabel('Dari tanggal')).toHaveValue(url.searchParams.get('dari')!);
    await expect(filters(page).getByLabel('Sampai tanggal')).toHaveValue(url.searchParams.get('sampai')!);
    // Status "Masih aktif": tidak ada NPR Selesai di laporan, dan daftar tidak memuat Selesai.
    await expect(page.getByTestId('ringkasan-closed').locator('.tile-value')).toHaveText('0');
    await expect(page.getByTestId('tabel-daftar-npr').getByText('Selesai', { exact: true })).toHaveCount(0);
  });

  test('periode terbalik ditolak di halaman; periode kosong dan periode lebih dari setahun dijawab dengan pesan', async ({ page }) => {
    await signInAs(page, 'helpdesk.contoh');
    await page.goto('/laporan');
    await expect(page.getByTestId('laporan-diperbarui')).toBeVisible();
    const to = await filters(page).getByLabel('Sampai tanggal').inputValue();
    const dayAfter = new Date(Date.parse(`${to}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

    await filters(page).getByLabel('Dari tanggal').fill(dayAfter);
    await filters(page).getByLabel('Dari tanggal').dispatchEvent('change');
    await expect(filters(page).getByRole('alert')).toHaveText('Tanggal awal tidak boleh setelah tanggal akhir.');
    await expect(page).toHaveURL((url) => !url.searchParams.has('dari'));

    await page.goto('/laporan?dari=2020-01-01&sampai=2020-01-31');
    await expect(page.getByText('Tidak ada NPR dalam periode ini')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Unduh Excel' })).toBeDisabled();

    await page.goto('/laporan?dari=2024-01-01&sampai=2026-10-31');
    await expect(page.getByText('Laporan gagal dimuat')).toBeVisible();
    await expect(page.getByText('Periode laporan paling panjang 366 hari.')).toBeVisible();
    await expect(filters(page)).toBeVisible();
  });

  test('unduh Excel: berkas .xlsx bernama periode, isinya rekap dan daftar NPR', async ({ page }) => {
    await signInAs(page, 'helpdesk.contoh');
    await createTicket(page, 'BCN-013');
    await page.goto('/laporan');
    await expect(page.getByTestId('ringkasan-total')).toBeVisible();

    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Unduh Excel' }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/^rekap-npr-\d{4}-\d{2}-01-\d{4}-\d{2}-\d{2}\.xlsx$/);
    const bytes = await readFile((await file.path())!);
    expect(bytes.subarray(0, 2).toString()).toBe('PK');
    expect(bytes.includes(Buffer.from('xl/worksheets/sheet6.xml'))).toBe(true);
    await expect(page.getByRole('button', { name: 'Unduh Excel' })).toBeEnabled();
  });

  test('cetak / PDF: tanpa menu, header, dan saringan; periode dan saringan tertulis di judul', async ({ page }) => {
    await signInAs(page, 'helpdesk.contoh');
    await createTicket(page, 'BCN-014');
    await page.goto('/laporan?status=aktif');
    await expect(page.getByTestId('ringkasan-total')).toBeVisible();

    await page.emulateMedia({ media: 'print' });
    await expect(page.getByRole('navigation', { name: 'Menu utama' })).toBeHidden();
    await expect(filters(page)).toBeHidden();
    await expect(page.getByRole('button', { name: 'Unduh Excel' })).toBeHidden();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Laporan');
    await expect(page.locator('.page-header')).toContainText('Status Masih aktif');
    await expect(page.getByText('Daftar lengkap ada di berkas Excel.')).toBeVisible();
    const pdf = await page.pdf({ format: 'A4' });
    expect(pdf.length).toBeGreaterThan(1000);
  });

  test('ponsel 375 px: tanpa gulir samping; tombol dan isian setinggi jari', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 740 });
    await signInAs(page, 'helpdesk.contoh');
    await page.goto('/laporan');
    await expect(page.getByTestId('ringkasan-total')).toBeVisible();

    await expectNoPageOverflow(page);
    for (const control of await page.locator('main button:visible, main select:visible, main input:visible').all()) {
      expect((await control.boundingBox())?.height, await control.evaluate((el) => el.outerHTML.slice(0, 80))).toBeGreaterThanOrEqual(44);
    }
  });
});
