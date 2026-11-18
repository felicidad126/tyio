import { expect, type Page, test } from '@playwright/test';
import { signInAs } from './helpers';

/** NPR baru lewat API (seperti dari tab atau rekan lain); halaman yang terbuka tidak dimuat ulang. */
async function createTicket(page: Page, site: string): Promise<{ id: string; number: string }> {
  const remote = (await (await page.request.get(`/api/remotes?q=${site}`)).json()).items[0];
  const categories = (await (await page.request.get('/api/master/kategori')).json()).items as Array<{ id: string; code: string }>;
  const res = await page.request.post('/api/tickets', {
    data: {
      remoteId: remote.id,
      categoryId: categories.find((c) => c.code === 'RD')!.id,
      occurredAt: new Date().toISOString(),
      problem: `Uji langsung ${Date.now()}`,
      confirmOpenTickets: true,
    },
  });
  expect(res.status()).toBe(201);
  return (await res.json()).ticket;
}

/** Penanda di window: hilang bila halaman dimuat ulang. */
const markPage = (page: Page) => page.evaluate(() => ((window as unknown as { tanpaMuatUlang: boolean }).tanpaMuatUlang = true));
const stillSamePage = (page: Page) => page.evaluate(() => (window as unknown as { tanpaMuatUlang?: boolean }).tanpaMuatUlang === true);
const liveStatus = (page: Page) => page.getByTestId('status-langsung');

test.describe('pembaruan langsung', () => {
  test('NPR baru dari tempat lain muncul di daftar tanpa muat ulang, disorot, dengan waktu data diterima', async ({ page }) => {
    await signInAs(page, 'helpdesk.contoh');
    await page.goto('/tiket');
    await expect(liveStatus(page)).toHaveText('Langsung');
    // Daftar sudah dimuat (di database baru daftar Aktif bisa masih kosong).
    await expect(page.getByTestId('daftar-diperbarui')).toBeVisible();
    const before = await page.getByTestId('daftar-diperbarui').innerText();
    await markPage(page);
    await page.waitForTimeout(1100); // waktu "data diterima" tercatat per detik

    const ticket = await createTicket(page, 'MRS-018');

    const row = page.getByRole('row').filter({ hasText: ticket.number });
    await expect(row).toHaveCount(1, { timeout: 5000 });
    await expect(row).toHaveClass(/row-updated/);
    expect(await stillSamePage(page)).toBe(true);
    await expect(page.getByTestId('daftar-diperbarui')).not.toHaveText(before);
  });

  test('Overview: angka tiket aktif bertambah tanpa muat ulang', async ({ page }) => {
    await signInAs(page, 'helpdesk.contoh');
    const total = page
      .getByRole('region', { name: 'Tiket aktif', exact: true })
      .getByRole('link', { name: /^[\d.]+ tiket aktif$/ });
    await expect(total).toBeVisible();
    const before = Number((await total.innerText()).replace(/\D/g, ''));
    await markPage(page);

    await createTicket(page, 'MRS-019');

    await expect
      .poll(async () => Number((await total.innerText()).replace(/\D/g, '')), { timeout: 5000 })
      .toBeGreaterThan(before);
    expect(await stillSamePage(page)).toBe(true);
  });

  test('detail tiket: catatan rekan muncul di linimasa; status diubah rekan memberi peringatan, ketikan tetap', async ({ page }) => {
    await signInAs(page, 'helpdesk.contoh');
    const ticket = await createTicket(page, 'MRS-021');
    await page.goto(`/tiket/${ticket.id}`);
    await expect(liveStatus(page)).toHaveText('Langsung');
    await page.getByLabel('Catatan', { exact: true }).fill('Draf saya, belum disimpan');
    await markPage(page);

    const note = await page.request.post(`/api/tickets/${ticket.id}/actions`, {
      data: { occurredAt: new Date().toISOString(), note: 'Catatan dari rekan' },
    });
    expect(note.status()).toBe(201);
    const timeline = page.getByRole('list', { name: 'Linimasa' });
    await expect(timeline).toContainText('Catatan dari rekan', { timeout: 5000 });

    const status = await page.request.post(`/api/tickets/${ticket.id}/actions`, {
      data: { occurredAt: new Date().toISOString(), statusTo: 'dikerjakan', expectedStatus: 'terbuka' },
    });
    expect(status.status()).toBe(201);
    await expect(page.getByTestId('status-tiket')).toHaveText('Dikerjakan', { timeout: 5000 });
    await expect(page.getByRole('alert').filter({ hasText: 'Status tiket diubah menjadi Dikerjakan di tempat lain' })).toBeVisible();
    await expect(page.getByLabel('Catatan', { exact: true })).toHaveValue('Draf saya, belum disimpan');
    await expect(page.getByLabel('Ubah status').locator('option')).toHaveText(['Tetap Dikerjakan', 'Pending']);
    expect(await stillSamePage(page)).toBe(true);
  });

  test('koneksi putus terlihat jelas, menyambung sendiri, dan perubahan selama putus ikut termuat', async ({ page, context }) => {
    await signInAs(page, 'helpdesk.contoh');
    await page.goto('/tiket');
    await expect(liveStatus(page)).toHaveText('Langsung');
    await markPage(page);

    await context.setOffline(true);
    await expect(page.getByTestId('spanduk-terputus')).toBeVisible();
    await expect(page.getByTestId('spanduk-terputus')).toContainText('Koneksi pembaruan langsung terputus');
    await expect(liveStatus(page)).toHaveText('Terputus');

    // Rekan membuat NPR selama browser ini putus; kabarnya tidak sampai.
    const ticket = await createTicket(page, 'MRS-022');
    await context.setOffline(false);

    await expect(liveStatus(page)).toHaveText('Langsung', { timeout: 10_000 });
    await expect(page.getByTestId('spanduk-terputus')).toHaveCount(0);
    await expect(page.getByRole('row').filter({ hasText: ticket.number })).toHaveCount(1, { timeout: 5000 });
    expect(await stillSamePage(page)).toBe(true);
  });

  test('ponsel 375 px: status koneksi tetap terbaca di header yang ringkas', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 740 });
    await signInAs(page, 'helpdesk.contoh');
    await expect(page.getByTestId('status-langsung-ponsel')).toHaveAccessibleName('Pembaruan langsung: Langsung');
  });
});
