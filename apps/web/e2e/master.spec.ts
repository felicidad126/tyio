import { expect, type Page, test } from '@playwright/test';
import { expectNoPageOverflow, expectPath, signInAs } from './helpers';

// Uji ini berjalan juga terhadap staging: setiap nilai yang dibuat memakai kode acak dan
// dihapus lagi di akhir, agar bisa diulang tanpa sisa.
const uniqueCode = () => `E2E${Date.now().toString(36).toUpperCase().slice(-6)}`;

const openList = async (page: Page, tab: string) => {
  await page.getByRole('navigation', { name: 'Daftar master' }).getByRole('link', { name: tab }).click();
  await expect(page.getByRole('heading', { level: 2, name: tab })).toBeVisible();
};
const row = (page: Page, name: string) =>
  page.getByRole('row').filter({ has: page.getByRole('button', { name: `Ganti nama ${name}`, exact: true }) });

async function addItem(page: Page, list: string, code: string, name: string): Promise<void> {
  await page.getByRole('button', { name: `Tambah ${list}` }).click();
  const drawer = page.getByRole('dialog', { name: `Tambah ${list}` });
  await drawer.getByLabel('Kode').fill(code);
  await drawer.getByLabel('Nama').fill(name);
  await drawer.getByRole('button', { name: `Tambah ${list}` }).click();
  await expect(drawer).toBeHidden();
  await expect(row(page, name)).toBeVisible();
}

async function deleteItem(page: Page, list: string, name: string): Promise<void> {
  await row(page, name).getByRole('button', { name: `Hapus ${name}` }).click();
  await page.getByRole('dialog', { name: `Hapus ${list} "${name}"?` }).getByRole('button', { name: `Hapus ${list}` }).click();
  await expect(row(page, name)).toHaveCount(0);
}

test.describe('master data (admin)', () => {
  test('menu Admin membuka master data customer berisi customer contoh', async ({ page }) => {
    await signInAs(page, 'admin.contoh');
    await page.getByRole('navigation', { name: 'Menu utama' }).getByRole('link', { name: 'Admin' }).click();

    await expectPath(page, '/admin/master/customer');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Master data');
    await expect(row(page, 'Bank Merapi Sejahtera')).toContainText('MRS');

    await openList(page, 'Kategori');
    await expectPath(page, '/admin/master/kategori');
    await expect(row(page, 'Remote Down')).toBeVisible();
  });

  test('daftar System tidak ditampilkan lagi (kolom System dihapus)', async ({ page }) => {
    await signInAs(page, 'admin.contoh');
    await page.goto('/admin/master/customer');
    const tabs = page.getByRole('navigation', { name: 'Daftar master' }).getByRole('link');
    await expect(tabs).toHaveText(['Customer', 'Kategori', 'Jarkom']);
    await page.goto('/admin/master/system');
    await expect(page.getByRole('heading', { level: 1 })).not.toHaveText('Master data');
  });

  test('tambah, ganti nama di tempat, nonaktifkan, lalu hapus kategori', async ({ page }) => {
    const code = uniqueCode();
    const name = `Kategori Uji ${code}`;
    await signInAs(page, 'admin.contoh');
    await page.goto('/admin/master/kategori');

    // Kode diketik huruf kecil disimpan huruf besar; kode kembar ditolak di kolomnya.
    await addItem(page, 'kategori', code.toLowerCase(), name);
    await expect(row(page, name)).toContainText(code);
    await page.getByRole('button', { name: 'Tambah kategori' }).click();
    const drawer = page.getByRole('dialog', { name: 'Tambah kategori' });
    await drawer.getByLabel('Kode').fill(code);
    await drawer.getByLabel('Nama').fill(`${name} Dua`);
    await drawer.getByRole('button', { name: 'Tambah kategori' }).click();
    await expect(drawer.getByText(`Kode ${code} sudah dipakai di daftar Kategori.`)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
    await expect(page.getByRole('button', { name: 'Tambah kategori' })).toBeFocused();

    // Ganti nama di sel yang sama: baris berikutnya tidak bergeser.
    const renamed = `${name} Baru`;
    const next = page.getByRole('row').last();
    const before = await next.boundingBox();
    await row(page, name).getByRole('button', { name: `Ganti nama ${name}` }).click();
    const input = page.getByRole('textbox', { name: `Nama baru untuk ${name}` });
    await expect(input).toBeFocused();
    expect(await next.boundingBox()).toEqual(before);
    await input.fill(renamed);
    await input.press('Enter');
    await expect(row(page, renamed)).toBeVisible();
    await expect(row(page, renamed).getByRole('button', { name: `Ganti nama ${renamed}` })).toBeFocused();

    const active = row(page, renamed).getByRole('checkbox', { name: `Aktif: ${renamed}` });
    await active.uncheck();
    await expect(row(page, renamed)).toContainText('Nonaktif');
    await page.reload();
    await expect(row(page, renamed).getByRole('checkbox', { name: `Aktif: ${renamed}` })).not.toBeChecked();

    // Konfirmasi menyebut namanya, fokus awal di Batal, Escape tidak menghapus.
    await row(page, renamed).getByRole('button', { name: `Hapus ${renamed}` }).click();
    const confirm = page.getByRole('dialog', { name: `Hapus kategori "${renamed}"?` });
    await expect(confirm.getByRole('button', { name: 'Batal' })).toBeFocused();
    // Isi dialog punya latar sendiri, tidak tembus ke tabel di belakangnya.
    const surface = await confirm.locator(':scope > *').evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(surface).not.toBe('rgba(0, 0, 0, 0)');
    await page.keyboard.press('Escape');
    await expect(confirm).toBeHidden();
    await expect(row(page, renamed)).toBeVisible();

    await deleteItem(page, 'kategori', renamed);
  });

  test('customer yang sudah dipakai tidak bisa dihapus; ditawarkan menonaktifkan', async ({ page }) => {
    await signInAs(page, 'admin.contoh');
    await page.goto('/admin/master/customer');

    // MRS dipakai: pengguna helpdesk.merapi dibatasi ke customer ini.
    await row(page, 'Bank Merapi Sejahtera').getByRole('button', { name: 'Hapus Bank Merapi Sejahtera' }).click();
    const confirm = page.getByRole('dialog', { name: 'Hapus customer "Bank Merapi Sejahtera"?' });
    await confirm.getByRole('button', { name: 'Hapus customer' }).click();

    await expect(confirm.getByRole('alert')).toContainText('sudah dipakai, jadi tidak bisa dihapus');
    await expect(confirm.getByRole('button', { name: 'Nonaktifkan' })).toBeVisible();
    await confirm.getByRole('button', { name: 'Tutup' }).click();
    await expect(row(page, 'Bank Merapi Sejahtera')).toContainText('Aktif');
  });

  test('ponsel 375 px: tanpa gulir samping, panel tambah selebar layar', async ({ page }) => {
    const code = uniqueCode();
    await page.setViewportSize({ width: 375, height: 740 });
    await signInAs(page, 'admin.contoh');
    await page.goto('/admin/master/jarkom');
    await expect(row(page, 'VSAT')).toBeVisible();
    await expectNoPageOverflow(page);

    await page.getByRole('button', { name: 'Tambah jarkom' }).click();
    const drawer = page.getByRole('dialog', { name: 'Tambah jarkom' });
    await expect(drawer).toBeInViewport({ ratio: 1 });
    expect((await drawer.boundingBox())?.width).toBe(375);
    await drawer.getByRole('button', { name: 'Batal' }).click();

    await addItem(page, 'jarkom', code, `Jarkom Uji ${code}`);
    await expectNoPageOverflow(page);
    await deleteItem(page, 'jarkom', `Jarkom Uji ${code}`);
  });
});
