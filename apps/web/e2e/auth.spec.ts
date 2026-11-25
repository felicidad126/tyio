import { expect, test } from '@playwright/test';
import { ACCOUNTS, accountButton, PASSWORD, submitLogin } from './accounts';

// Alur login di browser terhadap aplikasi yang menyala dan sudah di-seed.
const USER = ACCOUNTS.l1;

test.describe('login', () => {
  test('tanpa sesi, halaman aplikasi dialihkan ke halaman login', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveURL('/masuk');
    await expect(page.getByRole('button', { name: 'Masuk' })).toBeVisible();
    await expect(page.getByLabel('Email')).toBeFocused();
  });

  test('masuk, melihat nama dan peran, lalu keluar', async ({ page, context }) => {
    await page.goto('/masuk');

    await submitLogin(page, USER.email, PASSWORD);

    await expect(page).toHaveURL('/');
    await expect(accountButton(page, USER)).toBeVisible();
    const cookie = (await context.cookies()).find((c) => c.name === 'npr_sesi');
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Strict', path: '/api' });

    // Sesi bertahan saat halaman dimuat ulang.
    await page.reload();
    await expect(accountButton(page, USER)).toBeVisible();

    await accountButton(page, USER).click();
    await page.getByRole('button', { name: 'Keluar' }).click();

    await expect(page).toHaveURL('/masuk');
    expect((await context.cookies()).some((c) => c.name === 'npr_sesi')).toBe(false);
    await page.goto('/');
    await expect(page).toHaveURL('/masuk');
  });

  test('email atau kata sandi salah menampilkan pesan dan mengosongkan kata sandi', async ({ page }) => {
    await page.goto('/masuk');
    // Email yang tidak terdaftar memberi jawaban yang sama dengan kata sandi salah, dan
    // tidak menambah hitungan kegagalan akun uji (yang bisa mengunci uji berikutnya).
    await submitLogin(page, `tidak-ada-${Date.now()}@noc.example`, 'bukan-kata-sandinya');

    await expect(page.getByRole('alert')).toHaveText('Email atau kata sandi salah.');
    await expect(page.getByLabel('Kata sandi')).toHaveValue('');
    await expect(page.getByLabel('Kata sandi')).toBeFocused();
    await expect(page).toHaveURL('/masuk');
  });

  test('isian kosong ditandai tanpa menghubungi server', async ({ page }) => {
    await page.goto('/masuk');
    let loginCalls = 0;
    page.on('request', (request) => {
      if (request.url().endsWith('/api/auth/login')) loginCalls += 1;
    });

    await page.getByRole('button', { name: 'Masuk' }).click();

    await expect(page.getByText('Isi email Anda.')).toBeVisible();
    await expect(page.getByLabel('Email')).toBeFocused();
    expect(loginCalls).toBe(0);
  });

  test('tautan langsung ke halaman aplikasi kembali ke sana setelah login', async ({ page }) => {
    await page.goto('/tiket/NPR-CONTOH');
    await expect(page).toHaveURL('/masuk?next=/tiket/NPR-CONTOH');

    await submitLogin(page, USER.email, PASSWORD);

    await expect(page).toHaveURL('/tiket/NPR-CONTOH');
  });

  test('tujuan setelah login ke situs lain diabaikan', async ({ page }) => {
    await page.goto('/masuk?next=//contoh.example/jebakan');

    await submitLogin(page, USER.email, PASSWORD);

    await expect(page).toHaveURL('/');
    await expect(accountButton(page, USER)).toBeVisible();
  });
});
