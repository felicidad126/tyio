import { expect, type Page, test } from '@playwright/test';
import { expectLoginPage, expectPath, fillSignIn, SEED_PASSWORD } from './helpers';

// Memakai pengguna contoh dari seed (kata sandi: lihat helpers.ts).
const signIn = (page: Page, password = SEED_PASSWORD) => fillSignIn(page, 'helpdesk.contoh', password);

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
    await expect(heading).toHaveText('Selamat datang, Helpdesk Contoh');
    const account = page.getByRole('main');
    await expect(account.getByText('Helpdesk', { exact: true })).toBeVisible();
    await expect(account.getByText('Semua customer')).toBeVisible();

    await page.reload();
    await expect(heading).toHaveText('Selamat datang, Helpdesk Contoh');

    await page.getByRole('button', { name: 'Menu pengguna Helpdesk Contoh', exact: true }).click();
    await page.getByRole('button', { name: 'Keluar' }).click();
    await expectLoginPage(page);
    await page.goto('/');
    await expectLoginPage(page, '/');
  });

  test('tautan langsung kembali ke tujuannya setelah masuk', async ({ page }) => {
    await page.goto('/tiket/baru');
    await expectLoginPage(page, '/tiket/baru');

    await signIn(page);

    await expectPath(page, '/tiket/baru');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Buat tiket');
  });

  test('tujuan di luar aplikasi diabaikan (tanpa open redirect)', async ({ page, baseURL }) => {
    await page.goto('/login?next=//contoh.invalid/curi');

    await signIn(page);

    await expect(page).toHaveURL(`${baseURL}/`);
  });
});
