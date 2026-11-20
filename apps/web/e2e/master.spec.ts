import { expect, type Page, test } from '@playwright/test';
import { ACCOUNTS, loginAs } from './accounts';

// Data master (langkah 1.1): admin mengelola kategori, system, jarkom per customer dan
// daftar customer. Nama yang ditambahkan uji ini unik per run dan dihapus lagi, jadi uji
// aman diulang di database staging yang sama.

const unique = () => Math.random().toString(36).slice(2, 7).toUpperCase();
const table = (page: Page) => page.getByRole('table');
const row = (page: Page, text: string) => table(page).getByRole('row').filter({ hasText: text });

test.describe('data master', () => {
  test('admin membuka data master dari halaman Admin; nilai seed per customer tampil', async ({ page }) => {
    await loginAs(page, ACCOUNTS.admin, '/masuk?next=/admin');

    await page.getByRole('link', { name: /Data master/ }).click();

    await expect(page).toHaveURL(/\/admin\/master\/kategori/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Data master');
    await expect(page).toHaveTitle('Data master · Portal NOC Terpusat');
    // Menu Admin tetap menyala di halaman turunannya.
    await expect(page.getByRole('navigation', { name: 'Menu utama' }).locator('[aria-current="page"]')).toHaveText(
      'Admin',
    );
    const customer = page.getByLabel('Customer');
    await expect(customer.locator('option')).toHaveText([
      'Bank Andalas (BAD)',
      'Bank Nusa (BNA)',
      'Bank Selaras (BSL)',
      'BPD Timur (BPT)',
    ]);
    await expect(table(page).getByRole('row')).toContainText(['Nama', 'Corrective', 'Preventive', 'Remote Down']);

    await customer.selectOption({ label: 'Bank Nusa (BNA)' });
    await expect(page).toHaveURL(/customer=/);
    await page.getByRole('navigation', { name: 'Jenis data master' }).getByRole('link', { name: 'Jarkom' }).click();
    // Pilihan customer ikut pindah tab; jarkom menampilkan kodenya.
    await expect(customer).toHaveValue(await customer.locator('option', { hasText: 'Bank Nusa' }).getAttribute('value') ?? '');
    await expect(row(page, 'VSAT')).toContainText('VSAT');
    await expect(table(page).getByRole('columnheader', { name: 'Kode' })).toBeVisible();
  });

  test('admin menambah, mengganti nama, menonaktifkan, lalu menghapus kategori', async ({ page }) => {
    const name = `Uji Layar ${unique()}`;
    const renamed = `${name} Baru`;
    await loginAs(page, ACCOUNTS.admin, '/masuk?next=/admin/master/kategori');

    await page.getByLabel('Nama', { exact: true }).fill(name);
    await page.getByRole('button', { name: 'Tambah kategori' }).click();
    await expect(page.getByText(`Kategori "${name}" ditambahkan.`)).toBeVisible();
    await expect(row(page, name)).toContainText('Aktif');

    // Nama kembar (beda huruf besar/kecil) ditolak dengan pesan dari server.
    await page.getByLabel('Nama', { exact: true }).fill(name.toLowerCase());
    await page.getByRole('button', { name: 'Tambah kategori' }).click();
    await expect(page.getByRole('alert')).toHaveText('Kategori dengan nama ini sudah ada di customer tersebut.');
    await page.getByLabel('Nama', { exact: true }).clear();

    await page.getByRole('button', { name: `Ganti nama ${name}` }).click();
    const input = page.getByLabel(`Nama baru untuk ${name}`);
    await expect(input).toBeFocused();
    await input.fill(renamed);
    await input.press('Enter');
    await expect(row(page, renamed)).toBeVisible();
    // Galat formulir yang lama tidak tertinggal setelah aksi lain berhasil.
    await expect(page.getByRole('alert')).toHaveCount(0);

    await page.getByRole('button', { name: `Nonaktifkan ${renamed}` }).click();
    await expect(row(page, renamed)).toContainText('Nonaktif');
    await page.getByRole('button', { name: `Aktifkan ${renamed}` }).click();
    await expect(row(page, renamed)).toContainText('Aktif');

    // Hapus meminta konfirmasi yang menyebut nilainya; Batal tidak menghapus.
    await page.getByRole('button', { name: `Hapus ${renamed}` }).click();
    const confirm = page.getByRole('group', { name: `Konfirmasi hapus ${renamed}` });
    await expect(confirm).toContainText(`Hapus kategori ${renamed}?`);
    await confirm.getByRole('button', { name: 'Batal' }).click();
    await expect(row(page, renamed)).toBeVisible();

    await page.getByRole('button', { name: `Hapus ${renamed}` }).click();
    await confirm.getByRole('button', { name: `Hapus ${renamed}` }).click();
    await expect(page.getByText(`"${renamed}" dihapus.`)).toBeVisible();
    await expect(row(page, renamed)).toHaveCount(0);
  });

  test('customer: kode wajib, nonaktifkan meminta konfirmasi yang menyebut akibatnya', async ({ page }) => {
    const code = `U${unique()}`;
    const name = `Bank Uji ${code}`;
    await loginAs(page, ACCOUNTS.admin, '/masuk?next=/admin/master/customer');
    await expect(page.getByLabel('Customer')).toHaveCount(0); // tab customer tanpa pilihan customer

    await page.getByLabel('Kode').fill(code.toLowerCase());
    await page.getByLabel('Nama', { exact: true }).fill(name);
    await page.getByRole('button', { name: 'Tambah customer' }).click();
    await expect(row(page, name)).toContainText(code);

    await page.getByRole('button', { name: `Nonaktifkan ${name}` }).click();
    const confirm = page.getByRole('group', { name: `Konfirmasi nonaktifkan ${name}` });
    await expect(confirm).toContainText('pengguna yang hanya dibatasi ke customer ini tidak bisa melihat datanya lagi');
    await confirm.getByRole('button', { name: `Nonaktifkan ${name}` }).click();
    await expect(row(page, name)).toContainText('Nonaktif');

    await page.getByRole('button', { name: `Hapus ${name}` }).click();
    await page.getByRole('group', { name: `Konfirmasi hapus ${name}` }).getByRole('button', { name: `Hapus ${name}` }).click();
    await expect(row(page, name)).toHaveCount(0);
  });

  test('customer yang sudah punya data tidak bisa dihapus; pesannya menyarankan nonaktifkan', async ({ page }) => {
    await loginAs(page, ACCOUNTS.admin, '/masuk?next=/admin/master/customer');

    await page.getByRole('button', { name: 'Hapus Bank Nusa' }).click();
    await page.getByRole('group', { name: 'Konfirmasi hapus Bank Nusa' }).getByRole('button', { name: 'Hapus Bank Nusa' }).click();

    await expect(row(page, 'Bank Nusa').getByRole('alert')).toHaveText(
      'Customer ini sudah punya pengguna atau data, jadi tidak bisa dihapus. Nonaktifkan saja.',
    );
    await expect(row(page, 'Bank Nusa')).toContainText('Aktif');
  });

  test('L1 yang membuka alamat data master mendapat penjelasan, bukan halaman admin', async ({ page }) => {
    await loginAs(page, ACCOUNTS.l1);

    await page.goto('/admin/master/kategori');

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tidak punya akses');
    await expect(page.getByRole('table')).toHaveCount(0);
  });

  test('ponsel 375px: tanpa geser mendatar, tombol aksi terlihat tanpa menggulir tabel', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 740 });
    await loginAs(page, ACCOUNTS.admin, '/masuk?next=/admin/master/jarkom');
    await expect(table(page)).toBeVisible();

    const remove = page.getByRole('button', { name: 'Hapus VPN IP' });
    await remove.scrollIntoViewIfNeeded();
    await expect(remove).toBeInViewport({ ratio: 1 });
    const tableScroll = await page.locator('.table-responsive').evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(tableScroll).toBeLessThanOrEqual(0);

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
