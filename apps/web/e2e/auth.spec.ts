import { expect, type Page, test } from '@playwright/test';
import { expectLoginPage, expectPath } from './helpers';

// Memakai pengguna contoh dari seed. Kata sandi: bawaan dev, atau E2E_PASSWORD di staging/CI.
const USERNAME = 'l1.contoh';
const PASSWORD = process.env.E2E_PASSWORD ?? 'contoh-dev-2026';

async function signIn(page: Page, password = PASSWORD): Promise<void> {
  await page.getByLabel('Nama pengguna').fill(USERNAME);
  await page.getByLabel('Kata sandi', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Masuk' }).click();
}

// Berurutan: percobaan gagal lebih dulu, lalu login yang berhasil mengosongkan hitungannya.
test.describe.configure({ mode: 'serial' });

test.describe('masuk dan keluar', () => {
  test('kolom kosong ditandai tanpa mengirim apa pun', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'Masuk' }).click();

    await expect(page.getByText('Isi nama pengguna.')).toBeVisible();
    await expect(page.getByText('Isi kata sandi.')).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test('kata sandi salah: pesan jelas, tetap di halaman masuk, kolom sandi dikosongkan', async ({ page }) => {
    await page.goto('/login');
    await signIn(page, 'bukan-sandi-yang-benar');

    await expect(page.getByRole('alert')).toHaveText('Nama pengguna atau kata sandi tidak cocok.');
    await expectLoginPage(page);
    const password = page.getByLabel('Kata sandi', { exact: true });
    await expect(password).toHaveValue('');
    await expect(password).toBeFocused();
    // Satu pesan saja: kolom sandi yang dikosongkan tidak ikut ditandai "Isi kata sandi."
    await expect(page.getByText('Isi kata sandi.')).toHaveCount(0);
  });

  test('masuk, sesi bertahan saat halaman dimuat ulang, lalu keluar', async ({ page }) => {
    await page.goto('/');
    await expectLoginPage(page, '/');

    await signIn(page);

    const heading = page.getByRole('heading', { level: 1 });
    await expectPath(page, '/');
    await expect(heading).toHaveText('Selamat datang, Operator L1 Contoh');
    await expect(page.getByText('L1 Monitoring')).toBeVisible();
    await expect(page.getByText('Semua customer')).toBeVisible();

    await page.reload();
    await expect(heading).toHaveText('Selamat datang, Operator L1 Contoh');

    await page.getByRole('button', { name: 'Keluar' }).click();
    await expectLoginPage(page);
    await page.goto('/');
    await expectLoginPage(page, '/');
  });

  test('tautan langsung kembali ke tujuannya setelah masuk', async ({ page }) => {
    await page.goto('/tiket/NPR-CONTOH');
    await expectLoginPage(page, '/tiket/NPR-CONTOH');

    await signIn(page);

    await expectPath(page, '/tiket/NPR-CONTOH');
    // Rute tiket baru dibuat di R1; sampai saat itu yang tampil halaman tidak ditemukan.
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Halaman tidak ditemukan');
  });

  test('tujuan di luar aplikasi diabaikan (tanpa open redirect)', async ({ page, baseURL }) => {
    await page.goto('/login?next=//contoh.invalid/curi');

    await signIn(page);

    await expect(page).toHaveURL(`${baseURL}/`);
  });
});
