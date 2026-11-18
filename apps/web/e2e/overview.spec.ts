import { expect, type Page, test } from '@playwright/test';
import { expectNoPageOverflow, expectPath, fillSignIn, signInAs } from './helpers';

/** NPR baru (kejadian sekarang) lewat API dengan sesi browser yang sama. */
async function createTicket(page: Page, site: string): Promise<{ id: string; number: string }> {
  const remote = (await (await page.request.get(`/api/remotes?q=${site}`)).json()).items[0];
  const categories = (await (await page.request.get('/api/master/kategori')).json()).items as Array<{ id: string; code: string }>;
  const res = await page.request.post('/api/tickets', {
    data: {
      remoteId: remote.id,
      categoryId: categories.find((c) => c.code === 'RD')!.id,
      occurredAt: new Date().toISOString(),
      problem: `Uji Overview ${Date.now()}`,
      confirmOpenTickets: true,
    },
  });
  expect(res.status()).toBe(201);
  return (await res.json()).ticket;
}

const number = (text: string | null) => Number((text ?? '').replace(/\D/g, ''));
const viewTab = (page: Page, name: RegExp) =>
  page.getByRole('navigation', { name: 'Tampilan tiket' }).getByRole('link', { name });
/** Total di bawah daftar ("1–50 dari 123 tiket"), atau 0 bila kosong. */
async function listTotal(page: Page): Promise<number> {
  await expect(page.getByText(/dari [\d.]+ tiket|Tidak ada|Belum ada/).first()).toBeVisible();
  const range = page.getByText(/dari [\d.]+ tiket/).first();
  return (await range.count()) ? number((await range.innerText()).split('dari')[1]!) : 0;
}

// Uji layar lain bisa membuat tiket bersamaan; perbandingan angka diulang sampai stabil.
test.describe('Overview', () => {
  test('angka status menuju daftar dengan jumlah yang sama; saringannya tampil sebagai chip', async ({ page }) => {
    await signInAs(page, 'helpdesk.contoh');
    await createTicket(page, 'MRS-016');

    await expect(async () => {
      await page.goto('/');
      const tile = page.getByRole('link', { name: /^Terbuka: [\d.]+ tiket$/ });
      const value = number(await tile.getAttribute('aria-label'));
      expect(value).toBeGreaterThan(0);
      await tile.click();
      await expect(page).toHaveURL((url) => url.pathname === '/tiket' && url.searchParams.get('status') === 'terbuka');
      await expect(viewTab(page, /^Aktif/)).toHaveText(new RegExp(`^Aktif\\s*${value.toLocaleString('id-ID')}$`));
    }).toPass({ timeout: 20_000 });

    const chips = page.getByRole('list', { name: 'Saringan dari Overview' });
    await expect(chips).toContainText('Status Terbuka');
    await chips.getByRole('button', { name: 'Hapus saringan Status Terbuka' }).click();
    await expect(page).toHaveURL((url) => !url.searchParams.has('status'));
    await expect(chips).toHaveCount(0);
  });

  test('batang tren hari ini dan remote teratas menuju daftar dengan total yang sama', async ({ page }) => {
    await signInAs(page, 'helpdesk.contoh');
    const ticket = await createTicket(page, 'MRS-017');

    await expect(async () => {
      await page.goto('/');
      const region = page.getByRole('region', { name: 'NPR baru dan Selesai per hari' });
      const today = region.locator('.hit').nth(-2); // hari terakhir, seri NPR baru
      const value = number((await today.getAttribute('aria-label'))!.split(':')[1]!);
      expect(value).toBeGreaterThan(0);
      await today.click();
      await expect(page).toHaveURL((url) => url.searchParams.get('tampilan') === 'semua' && url.searchParams.has('dari'));
      expect(await listTotal(page)).toBe(value);
    }).toPass({ timeout: 20_000 });
    await expect(page.getByRole('row').filter({ hasText: ticket.number })).toHaveCount(1);
    await expect(page.getByRole('list', { name: 'Saringan dari Overview' })).toContainText(/^Kejadian \d+ \w+ \d{4}/);

    await expect(async () => {
      await page.goto('/');
      const top = page.getByRole('region', { name: 'Remote paling sering bermasalah' });
      const link = top.getByRole('link', { name: /NPR di / }).first();
      const value = number((await link.getAttribute('aria-label'))!.split(' NPR')[0]!);
      await link.click();
      await expect(page).toHaveURL((url) => url.searchParams.has('remote'));
      expect(await listTotal(page)).toBe(value);
    }).toPass({ timeout: 20_000 });
    await expect(page.getByRole('list', { name: 'Saringan dari Overview' })).toContainText(/Remote [A-Z]+-\d{3} · /);
  });

  test('tabel tren dan tooltip: nilai yang sama terbaca tanpa grafik', async ({ page }) => {
    await signInAs(page, 'helpdesk.contoh');
    await page.goto('/');
    const region = page.getByRole('region', { name: 'NPR baru dan Selesai per hari' });
    await expect(region.getByRole('list', { name: 'Keterangan grafik' })).toContainText('NPR baru');

    const bar = region.locator('.hit').nth(-2);
    const label = (await bar.getAttribute('aria-label'))!;
    await bar.focus();
    const tooltip = region.getByRole('tooltip');
    await expect(tooltip).toBeVisible();
    await expect(bar).toHaveAttribute('aria-describedby', (await tooltip.getAttribute('id'))!);

    await region.getByText('Lihat sebagai tabel').click();
    const row = region.getByRole('row').nth(1); // hari ini, paling atas
    await expect(row.getByRole('rowheader')).toHaveText(label.split(':')[0]!);
    await expect(row.getByRole('cell').first()).toHaveText(label.split(':')[1]!.trim().split(' ')[0]!);
  });

  test('pengguna yang dibatasi ke satu customer hanya melihat customernya', async ({ page }) => {
    await page.goto('/login');
    await fillSignIn(page, 'helpdesk.merapi');
    await expectPath(page, '/');
    const customers = page.getByRole('region', { name: 'Tiket aktif per customer' });
    await expect(customers.getByRole('listitem')).toHaveCount(1);
    await expect(customers).toContainText('Bank Merapi Sejahtera');
    await expect(page.getByRole('region', { name: 'Remote paling sering bermasalah' })).not.toContainText('BCN-');
  });

  test('ponsel 375 px: tanpa gulir samping; angka dan baris setinggi jari; muat ulang', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 740 });
    await signInAs(page, 'helpdesk.contoh');
    await expect(page.getByTestId('overview-diperbarui')).toBeVisible();
    await expectNoPageOverflow(page);
    for (const link of await page.getByRole('region', { name: 'Tiket aktif' }).getByRole('link').all()) {
      expect((await link.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    }
    for (const link of await page.getByRole('region', { name: 'Tiket aktif per kategori' }).getByRole('link').all()) {
      expect((await link.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    }
    const refreshed = page.waitForResponse((res) => res.url().endsWith('/api/overview') && res.status() === 200);
    await page.getByRole('button', { name: 'Muat ulang Overview' }).click();
    await refreshed;
  });
});
