import { expect, type Page, test } from '@playwright/test';
import writeXlsxFile from 'write-excel-file/node';
import { ACCOUNTS, loginAs } from './accounts';

// Remote (langkah 1.2): daftar yang bisa dicari dan disaring, halaman remote, dan impor
// Excel dengan pratinjau. Remote yang dibuat uji impor memakai kode unik per run.

const unique = () => Math.random().toString(36).slice(2, 7).toUpperCase();
const rows = (page: Page) => page.getByRole('table').locator('tbody tr');
const IMPORT_HEADER = ['Kode remote', 'Nama remote', 'Jarkom', 'Zona waktu', 'Kota', 'Kontak 1 nama', 'Kontak 1 telepon'];

test.describe('daftar dan halaman remote', () => {
  test('L1 mencari remote, membuka halamannya, lalu kembali ke daftar yang sama', async ({ page }) => {
    await loginAs(page, ACCOUNTS.l1);
    await page.getByRole('navigation', { name: 'Menu utama' }).getByRole('link', { name: 'Remote' }).click();

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Remote');
    await expect(page.getByRole('status').filter({ hasText: /^1–50 dari [\d.]+ remote$/ })).toBeVisible();
    // Operator tidak mendapat tombol impor (data remote hanya diubah admin).
    await expect(page.getByRole('link', { name: 'Impor dari Excel' })).toHaveCount(0);

    await page.getByLabel('Cari remote').fill('pasar sentral');
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page)).toContainText(['BNA-MKS-0217']);
    await expect(page).toHaveURL(/q=pasar(\+|%20)sentral/);

    await rows(page).first().getByRole('link', { name: 'BNA-MKS-0217' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('ATM KCP Pasar Sentral');
    await expect(page).toHaveTitle('BNA-MKS-0217 · ATM KCP Pasar Sentral · Portal NOC Terpusat');
    const location = page.getByRole('region', { name: 'Lokasi', exact: true });
    await expect(location).toContainText('Kanwil Makassar / KCP Pasar Sentral');
    await expect(location).toContainText('WITA (UTC+8)');
    await expect(page.getByRole('region', { name: 'Jaringan' })).toContainText('10.41.17.22');
    await expect(page.getByRole('link', { name: '+62 811-0000-0217' })).toHaveAttribute('href', 'tel:+6281100000217');
    // Menu Remote tetap menyala di halaman turunannya.
    await expect(page.getByRole('navigation', { name: 'Menu utama' }).locator('[aria-current="page"]')).toHaveText(
      'Remote',
    );

    await page.goBack();
    await expect(page.getByLabel('Cari remote')).toHaveValue('pasar sentral');
    await expect(rows(page)).toHaveCount(1);
  });

  test('menyaring per customer, jarkom, dan status; halaman berikutnya; saringan bisa dihapus', async ({ page }) => {
    await loginAs(page, ACCOUNTS.l1, '/masuk?next=/remote');

    await expect(page.getByLabel('Jarkom')).toBeDisabled(); // jarkom milik customer tertentu
    await page.getByLabel('Customer').selectOption({ label: 'Bank Selaras' });
    await page.getByLabel('Jarkom').selectOption({ label: 'VPN IP (VPN)' });
    await expect(rows(page).first()).toBeVisible();
    // Ditunggu sampai daftar termuat ulang dengan saringan jarkom: membaca baris sekali saja
    // kadang masih mendapat daftar sebelumnya (CI run #151).
    await expect
      .poll(async () => [...new Set((await rows(page).locator('td:nth-child(3)').allTextContents()).map((text) => text.trim()))])
      .toEqual(['VPN']);

    await page.getByLabel('Customer').selectOption({ label: 'Semua customer' });
    await expect(page.getByLabel('Jarkom')).toHaveValue('');
    await page.getByRole('button', { name: 'Berikutnya' }).click();
    await expect(page.getByRole('status').filter({ hasText: /^51–100 dari/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sebelumnya' })).toBeEnabled();

    await page.getByLabel('Status').selectOption({ label: 'Nonaktif' });
    await page.getByLabel('Cari remote').fill('tidak-ada-remote-seperti-ini');
    await expect(page.getByText('Tidak ada remote yang cocok')).toBeVisible();
    await page.getByRole('button', { name: 'Hapus saringan' }).click();
    await expect(page).toHaveURL('/remote');
    await expect(page.getByLabel('Cari remote')).toHaveValue('');
    await expect(rows(page)).toHaveCount(50);
  });

  test('remote yang tidak ada atau milik customer lain menampilkan penjelasan', async ({ page }) => {
    await loginAs(page, ACCOUNTS.l1, '/masuk?next=/remote/00000000-0000-4000-8000-000000000000');

    await expect(page.getByText('Remote tidak ditemukan.')).toBeVisible();
    await page.getByRole('link', { name: 'Kembali ke daftar remote' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Remote');
  });

  test('ponsel 375px: daftar tanpa geser mendatar, kode remote bisa diketuk', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 740 });
    await loginAs(page, ACCOUNTS.l1, '/masuk?next=/remote');
    await expect(rows(page).first()).toBeVisible();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    const tableScroll = await page.locator('.table-responsive').evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(tableScroll).toBeLessThanOrEqual(0);
    const link = rows(page).first().getByRole('link');
    expect((await link.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  });
});

test.describe('impor remote', () => {
  test('admin memeriksa berkas, membaca laporan baris gagal, lalu menyimpan baris yang benar', async ({ page }) => {
    const code = `E2E-${unique()}`;
    const file = await writeXlsxFile([
      IMPORT_HEADER,
      [code, `ATM Uji ${code}`, 'VSAT', 'WITA', 'Kendari', 'Rina', '0811-1234-567'],
      [`${code}-X`, 'Jarkom salah', 'TIDAKADA', 'WIB', null, null, null],
    ]).toBuffer();
    await loginAs(page, ACCOUNTS.admin, '/masuk?next=/remote');

    await page.getByRole('link', { name: 'Impor dari Excel' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Impor remote');
    const download = page.waitForEvent('download');
    await page.getByRole('link', { name: 'Unduh templat' }).click();
    expect((await download).suggestedFilename()).toBe('templat-impor-remote.xlsx');

    await page.getByLabel('Customer').selectOption({ label: 'Bank Nusa (BNA)' });
    await page.getByLabel('Berkas Excel (.xlsx)').setInputFiles({
      name: 'remote.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: file,
    });
    await page.getByRole('button', { name: 'Periksa berkas' }).click();

    const result = page.getByRole('region', { name: 'Hasil pemeriksaan untuk Bank Nusa' });
    await expect(result).toContainText('2 baris dibaca');
    await expect(result).toContainText('1 remote baru');
    await expect(result).toContainText('1 gagal');
    await expect(result.getByRole('table', { name: 'Baris yang gagal' }).locator('tbody tr')).toHaveText([
      /^3\s*E2E-.+-X\s*Jarkom TIDAKADA tidak ada di customer ini\.$/,
    ]);
    // Belum ada yang tersimpan sebelum tombol simpan ditekan.
    const before = await page.request.get(`/api/remotes?q=${code}`);
    expect((await before.json()).total).toBe(0);

    await result.getByRole('button', { name: 'Simpan 1 remote' }).click();
    const done = page.getByRole('region', { name: 'Impor selesai untuk Bank Nusa' });
    await expect(done).toContainText('1 remote baru, 0 diperbarui, 0 tidak berubah, 1 baris gagal tidak disimpan.');

    await done.getByRole('link', { name: 'Lihat remote Bank Nusa' }).click();
    await page.getByLabel('Cari remote').fill(code);
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page)).toContainText([`ATM Uji ${code}`]);
  });

  test('berkas dengan judul kolom yang salah ditolak dengan penjelasan', async ({ page }) => {
    const file = await writeXlsxFile([['Kode', 'Nama']]).toBuffer();
    await loginAs(page, ACCOUNTS.admin, '/masuk?next=/remote/impor');

    await page.getByLabel('Berkas Excel (.xlsx)').setInputFiles({
      name: 'salah.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: file,
    });
    await page.getByRole('button', { name: 'Periksa berkas' }).click();

    await expect(page.getByRole('alert')).toHaveText(
      'Judul kolom tidak dikenal: "Kode", "Nama". Pakai judul kolom dari templat.',
    );
  });

  test('L1 yang membuka alamat impor mendapat penjelasan, bukan halaman impor', async ({ page }) => {
    await loginAs(page, ACCOUNTS.l1);

    await page.goto('/remote/impor');

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tidak punya akses');
  });
});
