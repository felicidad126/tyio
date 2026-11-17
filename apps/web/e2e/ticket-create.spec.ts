import { expect, type Page, test } from '@playwright/test';
import { expectNoPageOverflow, expectPath, signInAs } from './helpers';

// Tiket tidak pernah dihapus, jadi saat uji diulang remote yang sama bisa sudah punya tiket
// terbuka. Uji ini menangani kedua keadaan dan memeriksa peringatannya secara eksplisit.

const NUMBER = /^NPR\/VSAT\/MRS\/\d{4}\/\d{2}\/\d{4}$/;

async function pickRemote(page: Page, search: string, name: string): Promise<void> {
  await page.getByRole('searchbox', { name: /^Remote/ }).fill(search);
  await page.getByRole('button', { name: new RegExp(name) }).click();
  await expect(page.getByRole('button', { name: 'Ganti remote' })).toBeVisible();
}

async function fillIncident(page: Page, problem: string): Promise<void> {
  await page.getByLabel('Kategori').selectOption({ label: 'Remote Down' });
  await page.getByLabel('Keterangan').fill(problem);
}

async function confirmIfWarned(page: Page): Promise<void> {
  const confirm = page.getByLabel(/tetap buat tiket baru/);
  if (await confirm.isVisible()) await confirm.check();
}

async function submitAndReadNumber(page: Page): Promise<string> {
  await page.getByRole('button', { name: 'Buat tiket', exact: true }).last().click();
  await expect(page).toHaveURL(/\/tiket\/[0-9a-f-]{36}\?baru=1$/);
  const number = (await page.getByRole('heading', { level: 1 }).innerText()).trim();
  expect(number).toMatch(NUMBER);
  await expect(page.getByText(`Tiket ${number} dibuat.`)).toBeVisible();
  return number;
}

test.describe('buat tiket', () => {
  test('L1 memilih remote, data lokasi terisi hanya-baca, lalu tiket bernomor dibuat', async ({ page }) => {
    await signInAs(page, 'l1.contoh');
    await page.getByRole('banner').getByRole('link', { name: 'Buat tiket' }).click();
    await expectPath(page, '/tiket/baru');

    await pickRemote(page, 'MRS-002', 'ATM Pasar Raya Sleman');
    const remote = page.getByRole('region', { name: 'Remote' });
    await expect(remote).toContainText('Bank Merapi Sejahtera');
    await expect(remote).toContainText('Sleman, DI Yogyakarta (WIB)');
    await expect(remote.getByRole('textbox')).toHaveCount(0); // data remote tidak bisa diubah di sini
    await expect(page.getByLabel('Waktu kejadian (WIB)')).not.toHaveValue('');

    await fillIncident(page, 'Remote down, listrik padam (uji otomatis).');
    await confirmIfWarned(page);
    const number = await submitAndReadNumber(page);

    await expect(page.getByText('Remote Down').first()).toBeVisible();
    await page.getByRole('link', { name: 'ATM Pasar Raya Sleman' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('ATM Pasar Raya Sleman');

    // Tiket kedua untuk remote yang sama: peringatan menyebut tiket tadi, wajib dikonfirmasi.
    await page.getByRole('link', { name: 'Buat tiket untuk remote ini' }).click();
    const warning = page.getByRole('alert').filter({ hasText: 'tiket terbuka' });
    await expect(warning).toContainText(number);
    await fillIncident(page, 'Gangguan kedua di remote yang sama (uji otomatis).');
    await page.getByRole('button', { name: 'Buat tiket', exact: true }).last().click();
    await expect(page.getByText('Centang konfirmasi, atau buka tiket yang sudah ada.')).toBeVisible();
    await expectPath(page, '/tiket/baru');

    await page.getByLabel(/tetap buat tiket baru/).check();
    const second = await submitAndReadNumber(page);
    expect(second).not.toBe(number);
  });

  test('isian kosong ditandai per kolom tanpa mengirim apa pun', async ({ page }) => {
    await signInAs(page, 'l1.contoh');
    await page.goto('/tiket/baru');

    await page.getByRole('button', { name: 'Buat tiket', exact: true }).last().click();

    await expect(page.getByText('Pilih remote.')).toBeVisible();
    await expect(page.getByText('Pilih kategori.')).toBeVisible();
    await expect(page.getByText(/Keterangan 3–4\.000 karakter/)).toBeVisible();
    await expectPath(page, '/tiket/baru');
  });

  test('pengguna yang dibatasi hanya menemukan remote customernya', async ({ page }) => {
    await signInAs(page, 'l1.merapi');
    await page.goto('/tiket/baru');

    await page.getByRole('searchbox', { name: /^Remote/ }).fill('BCN-0');
    await expect(page.getByText('Tidak ada remote yang cocok.')).toBeVisible();
    await page.getByRole('searchbox', { name: /^Remote/ }).fill('MRS-00');
    await expect(page.getByRole('list', { name: 'Hasil pencarian remote' }).getByRole('button').first()).toBeVisible();
  });

  test('ponsel 375 px: tombol Buat tiket ada di menu dan form tanpa gulir samping', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 740 });
    await signInAs(page, 'l1.contoh');

    await page.getByRole('button', { name: 'Buka menu' }).click();
    await page.getByRole('link', { name: 'Buat tiket' }).click();
    await expectPath(page, '/tiket/baru');
    await pickRemote(page, 'BLH-002', 'ATM Pasar Raya Denpasar');
    await expect(page.getByLabel('Waktu kejadian (WITA)')).toBeVisible();
    await expectNoPageOverflow(page);
  });
});
