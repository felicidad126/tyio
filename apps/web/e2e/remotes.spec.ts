import { readFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import { REMOTE_IMPORT_COLUMNS } from '@tyio/shared';
import { readFirstSheet } from '../src/lib/xlsx/read';
import { writeXlsx } from '../src/lib/xlsx/write';
import { expectNoPageOverflow, expectPath, SEED_PASSWORD, signInAs } from './helpers';

// Data contoh: 25 remote rekaan per customer contoh (MRS, BCN, BLH). Uji impor memakai
// Site ID tetap (E2E-001, E2E-002) di customer MRS, jadi bisa diulang tanpa menumpuk data.

const openRemotes = async (page: Page) => {
  await page.getByRole('navigation', { name: 'Menu utama' }).getByRole('link', { name: 'Remote' }).click();
  await expectPath(page, '/remote');
};
const rows = (page: Page) => page.getByRole('table').getByRole('row').filter({ has: page.getByRole('cell') });
const xlsx = (name: string, data: string[][]) => ({
  name,
  mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  buffer: Buffer.from(writeXlsx([{ name: 'Remote', rows: data }])),
});

test.describe('daftar dan detail remote', () => {
  test('Helpdesk mencari, menyaring, membuka detail, lalu kembali ke daftar yang sama', async ({ page }) => {
    await signInAs(page, 'helpdesk.contoh');
    await openRemotes(page);

    await page.getByLabel('Cari', { exact: true }).fill('mrs-001');
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page).first()).toContainText('ATM Pasar Raya Yogyakarta');
    await expect(page).toHaveURL(/q=mrs-001/);

    await page.getByLabel('Cari', { exact: true }).fill('');
    await page.getByLabel('Provinsi').selectOption('Papua');
    await expect(page.getByText('1–5 dari 5 remote', { exact: true })).toBeVisible();
    for (const row of await rows(page).all()) await expect(row).toContainText('Jayapura');

    await rows(page).first().getByRole('link').click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Jayapura');
    await expect(page.getByText('Bank Cendrawasih Nusantara')).toBeVisible();
    const zone = page.locator('.datagrid-item').filter({ hasText: 'Zona waktu' });
    await expect(zone).toContainText('WIT');
    await expect(page.getByRole('link', { name: /Telepon Petugas Contoh/ })).toHaveAttribute('href', /^tel:021/);

    await page.getByRole('link', { name: 'Daftar remote' }).click();
    await expect(page).toHaveURL(/provinsi=Papua/);
    await expect(page.getByLabel('Provinsi')).toHaveValue('Papua');
  });

  test('pengguna yang dibatasi hanya melihat remote customernya', async ({ page, request }) => {
    // Id remote customer lain, diambil sebagai admin.
    await request.post('/api/auth/login', { data: { username: 'admin.contoh', password: SEED_PASSWORD } });
    const other = (await (await request.get('/api/remotes?q=BCN-001')).json()).items[0].id as string;

    await signInAs(page, 'helpdesk.merapi');
    await openRemotes(page);

    await expect(page.getByLabel('Customer', { exact: true })).toHaveCount(0);
    await page.getByLabel('Cari', { exact: true }).fill('BCN');
    await expect(page.getByText('Tidak ada remote yang cocok')).toBeVisible();

    await page.goto(`/remote/${other}`);
    await expect(page.getByText('Remote tidak ditemukan')).toBeVisible();
  });

  test('Helpdesk tidak melihat tombol impor dan tidak bisa membuka halaman impor', async ({ page }) => {
    await signInAs(page, 'helpdesk.contoh');
    await openRemotes(page);
    await expect(page.getByRole('link', { name: 'Impor dari Excel' })).toHaveCount(0);

    await page.goto('/remote/impor');
    await expectPath(page, '/tanpa-akses');
  });

  test('status remote yang dibongkar bernama Dismantle', async ({ page }) => {
    await signInAs(page, 'helpdesk.contoh');
    await page.goto('/remote');
    await expect(page.getByLabel('Status').locator('option')).toHaveText(['Semua', 'Aktif', 'Nonaktif', 'Dismantle']);
    await page.getByLabel('Status').selectOption({ label: 'Dismantle' });
    await expect(rows(page).first()).toContainText('Dismantle');
  });

  test('ponsel 375 px: daftar dan detail tanpa gulir samping', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 740 });
    await signInAs(page, 'helpdesk.contoh');
    await page.goto('/remote');
    await expect(rows(page).first()).toBeVisible();
    await expectNoPageOverflow(page);

    await rows(page).first().getByRole('link').click();
    await expect(page.getByRole('heading', { name: 'Kontak' })).toBeVisible();
    await expectNoPageOverflow(page);
  });
});

test.describe('impor remote dari Excel (admin)', () => {
  test('template, pemeriksaan dengan baris gagal, lalu simpan file yang benar', async ({ page }) => {
    const run = Date.now().toString(36);
    await signInAs(page, 'admin.contoh');
    await openRemotes(page);
    await page.getByRole('link', { name: 'Impor dari Excel' }).click();
    await expectPath(page, '/remote/impor');

    // Template berisi semua judul kolom impor.
    const downloading = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Unduh template' }).click();
    const template = readFirstSheet(readFileSync(await (await downloading).path()));
    expect([...template.rows[0]!.cells.values()]).toEqual(REMOTE_IMPORT_COLUMNS.map((c) => c.header));

    const header = ['Site ID', 'Nama Remote', 'Jarkom', 'Kota', 'Provinsi', 'Kanca'];
    await page.getByLabel('Customer', { exact: true }).selectOption({ label: 'Bank Merapi Sejahtera' });
    await page.getByLabel('File Excel (.xlsx)').setInputFiles(
      xlsx('remote-salah.xlsx', [
        header,
        ['E2E-001', 'ATM Uji Otomatis 1', 'VSAT', 'Sleman', 'DIY', `KC Uji ${run}`],
        ['E2E-002', 'ATM Uji Otomatis 2', 'VSAT', 'Sleman', 'Atlantis', `KC Uji ${run}`],
      ]),
    );
    const failures = page.getByRole('table', { name: 'Baris yang gagal' });
    await expect(failures.getByRole('row').filter({ hasText: 'Atlantis' })).toContainText('3');
    await expect(page.getByText('1 baris gagal, jadi belum ada yang disimpan')).toBeVisible();
    await expect(page.getByRole('button', { name: /^Simpan/ })).toHaveCount(0);

    await page.getByRole('button', { name: 'Pilih file lain' }).click();
    await page.getByLabel('File Excel (.xlsx)').setInputFiles(
      xlsx('remote-benar.xlsx', [
        header,
        ['E2E-001', 'ATM Uji Otomatis 1', 'VSAT', 'Sleman', 'DIY', `KC Uji ${run}`],
        ['E2E-002', 'ATM Uji Otomatis 2', 'VSAT', 'Sleman', 'DI Yogyakarta', `KC Uji ${run}`],
      ]),
    );
    await page.getByRole('button', { name: 'Simpan 2 remote' }).click();
    await expect(page.getByText('Impor selesai untuk Bank Merapi Sejahtera')).toBeVisible();

    await page.getByRole('link', { name: 'Lihat remote Bank Merapi Sejahtera' }).click();
    await page.getByLabel('Cari', { exact: true }).fill(`KC Uji ${run}`);
    await expect(rows(page)).toHaveCount(2);
  });
});
