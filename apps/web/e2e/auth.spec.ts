import { expect, type Page, test } from '@playwright/test';

// Alur login di browser terhadap aplikasi yang menyala dan sudah di-seed.
// Bawaan: akun dummy dev (seed). Di staging/CI isi E2E_USER_PASSWORD dengan
// SEED_USER_PASSWORD yang dipakai saat seed.
const USER = {
  email: process.env.E2E_USER_EMAIL ?? 'dewi@noc.example',
  password: process.env.E2E_USER_PASSWORD ?? 'sandi-dev-tyio',
  shownAs: process.env.E2E_USER_SHOWN_AS ?? 'Dewi A. · L1 Monitoring',
};

async function submitLogin(page: Page, email: string, password: string): Promise<void> {
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Kata sandi').fill(password);
  await page.getByRole('button', { name: 'Masuk' }).click();
}

test.describe('login', () => {
  test('tanpa sesi, halaman aplikasi dialihkan ke halaman login', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveURL('/masuk');
    await expect(page.getByRole('button', { name: 'Masuk' })).toBeVisible();
    await expect(page.getByLabel('Email')).toBeFocused();
  });

  test('masuk, melihat nama dan peran, lalu keluar', async ({ page, context }) => {
    await page.goto('/masuk');

    await submitLogin(page, USER.email, USER.password);

    await expect(page).toHaveURL('/');
    await expect(page.getByText(USER.shownAs)).toBeVisible();
    const cookie = (await context.cookies()).find((c) => c.name === 'tyio_sesi');
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Strict', path: '/api' });

    // Sesi bertahan saat halaman dimuat ulang.
    await page.reload();
    await expect(page.getByText(USER.shownAs)).toBeVisible();

    await page.getByRole('button', { name: 'Keluar' }).click();

    await expect(page).toHaveURL('/masuk');
    expect((await context.cookies()).some((c) => c.name === 'tyio_sesi')).toBe(false);
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

    await submitLogin(page, USER.email, USER.password);

    await expect(page).toHaveURL('/tiket/NPR-CONTOH');
  });

  test('tujuan setelah login ke situs lain diabaikan', async ({ page }) => {
    await page.goto('/masuk?next=//contoh.example/jebakan');

    await submitLogin(page, USER.email, USER.password);

    await expect(page).toHaveURL('/');
    await expect(page.getByText(USER.shownAs)).toBeVisible();
  });
});
