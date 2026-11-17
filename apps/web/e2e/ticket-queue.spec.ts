import { expect, type Page, test } from '@playwright/test';
import { expectNoPageOverflow, expectPath, fillSignIn, signInAs } from './helpers';

interface CreatedTicket {
  id: string;
  number: string;
}

/** Tiket baru lewat API dengan sesi browser yang sama; masalahnya unik per run. */
async function createTicket(page: Page, site: string): Promise<CreatedTicket> {
  const remote = (await (await page.request.get(`/api/remotes?q=${site}`)).json()).items[0];
  const categories = (await (await page.request.get('/api/master/kategori')).json()).items as Array<{
    id: string;
    code: string;
  }>;
  const res = await page.request.post('/api/tickets', {
    data: {
      remoteId: remote.id,
      categoryId: categories.find((c) => c.code === 'RD')!.id,
      occurredAt: new Date().toISOString(),
      problem: `Uji antrean ${Date.now()}`,
      confirmOpenTickets: true,
    },
  });
  expect(res.status()).toBe(201);
  return (await res.json()).ticket as CreatedTicket;
}

async function setPending(page: Page, ticket: CreatedTicket, reason: string): Promise<void> {
  const res = await page.request.post(`/api/tickets/${ticket.id}/actions`, {
    multipart: {
      data: JSON.stringify({
        occurredAt: new Date().toISOString(),
        statusTo: 'pending',
        expectedStatus: 'terbuka',
        pendingParty: 'tm',
        pendingReason: reason,
      }),
    },
  });
  expect(res.status()).toBe(201);
}

const row = (page: Page, number: string) => page.getByRole('row').filter({ hasText: number });
const viewTab = (page: Page, name: RegExp) =>
  page.getByRole('navigation', { name: 'Tampilan tiket' }).getByRole('link', { name });

test.describe('antrean tiket dan pencarian global', () => {
  test('tiket yang dibuat muncul di Aktif dan Milik saya, dicari di daftar, lalu dibuka', async ({ page }) => {
    await signInAs(page, 'l1.contoh');
    const ticket = await createTicket(page, 'MRS-003');

    await page.getByRole('navigation', { name: 'Menu utama' }).getByRole('link', { name: 'Tiket' }).click();
    await expectPath(page, '/tiket');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tiket');
    await expect(viewTab(page, /^Aktif/)).toHaveAttribute('aria-current', 'page');

    await page.getByLabel('Cari', { exact: true }).fill(ticket.number);
    await expect(page).toHaveURL((url) => url.searchParams.get('q') === ticket.number);
    await expect(row(page, ticket.number)).toHaveCount(1);
    await expect(row(page, ticket.number)).toContainText('Terbuka');

    await viewTab(page, /^Milik saya/).click();
    await expect(page).toHaveURL(
      (url) => url.searchParams.get('tampilan') === 'saya' && url.searchParams.get('q') === ticket.number,
    );
    await expect(row(page, ticket.number)).toHaveCount(1);

    await row(page, ticket.number).getByRole('link', { name: ticket.number }).click();
    await expectPath(page, `/tiket/${ticket.id}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(ticket.number);

    // Kembali ke daftar dengan tampilan dan pencarian yang sama.
    await page.goBack();
    await expect(page).toHaveURL((url) => url.searchParams.get('tampilan') === 'saya');
    await expect(row(page, ticket.number)).toHaveCount(1);
  });

  test('tab Pending menampilkan pihak dan alasan; tiket pending tidak ada di tab Eskalasi', async ({ page }) => {
    await signInAs(page, 'l1.contoh');
    const ticket = await createTicket(page, 'MRS-004');
    const reason = `Menunggu teknisi TM ${Date.now()}`;
    await setPending(page, ticket, reason);

    await page.goto(`/tiket?tampilan=pending&q=${encodeURIComponent(ticket.number)}`);
    await expect(viewTab(page, /^Pending/)).toHaveAttribute('aria-current', 'page');
    await expect(row(page, ticket.number)).toContainText('Pending');
    await expect(row(page, ticket.number)).toContainText('Menunggu TM');
    await expect(row(page, ticket.number)).toContainText(reason);

    await viewTab(page, /^Eskalasi/).click();
    await expect(page.getByText('Tidak ada tiket yang cocok')).toBeVisible();
    await page.getByRole('button', { name: 'Hapus pencarian dan saringan' }).click();
    await expect(page).toHaveURL((url) => url.searchParams.get('tampilan') === 'eskalasi' && !url.searchParams.has('q'));
  });

  test('pencarian global di header: no. tiket customer dan Site ID', async ({ page }) => {
    await signInAs(page, 'l1.contoh');
    const ticket = await createTicket(page, 'MRS-005');
    const customerNumber = `INC-${Date.now()}`;
    expect((await page.request.patch(`/api/tickets/${ticket.id}`, { data: { customerTicketNumber: customerNumber } })).status()).toBe(200);

    const box = page.getByRole('banner').getByRole('searchbox', { name: 'Cari tiket atau remote' });
    await box.fill(customerNumber.toLowerCase());
    await box.press('Enter');
    await expectPath(page, '/cari');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Hasil pencarian');
    const tickets = page.getByRole('region', { name: /^Tiket/ });
    await expect(tickets.getByRole('listitem')).toHaveCount(1);
    await expect(tickets).toContainText(customerNumber);

    await tickets.getByRole('link', { name: ticket.number }).click();
    await expectPath(page, `/tiket/${ticket.id}`);

    await box.fill('MRS-005');
    await box.press('Enter');
    const remotes = page.getByRole('region', { name: /^Remote/ });
    await expect(remotes.getByRole('listitem')).toHaveCount(1);
    await expect(remotes).toContainText('MRS-005');
    await expect(page.getByRole('region', { name: /^Tiket/ })).toContainText(ticket.number);
  });

  test('pengguna yang dibatasi ke satu customer tidak menemukan tiket customer lain', async ({ page }) => {
    await signInAs(page, 'l1.contoh');
    const other = await createTicket(page, 'BCN-001');

    await page.goto('/login');
    await page.context().clearCookies();
    await page.goto('/login');
    await fillSignIn(page, 'l1.merapi');
    await expect(page.getByRole('heading', { level: 1, name: /Selamat datang/ })).toBeVisible();

    await page.goto(`/tiket?tampilan=semua&q=${encodeURIComponent(other.number)}`);
    await expect(page.getByText('Tidak ada tiket yang cocok')).toBeVisible();
    await page.goto(`/cari?q=${encodeURIComponent(other.number)}`);
    await expect(page.getByText('Tidak ada tiket atau remote yang cocok')).toBeVisible();
  });

  test('lebar 1280 px: tabel tidak melebihi kartunya, juga dengan catatan tindakan panjang', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await signInAs(page, 'l1.contoh');
    const ticket = await createTicket(page, 'MRS-003');
    const res = await page.request.post(`/api/tickets/${ticket.id}/actions`, {
      multipart: {
        data: JSON.stringify({
          occurredAt: new Date().toISOString(),
          note: `Cek ke lokasi oleh teknisi; modem ${'menyala-tetapi-tidak-tersambung '.repeat(6)}`,
        }),
      },
    });
    expect(res.status()).toBe(201);

    await page.goto(`/tiket?q=${encodeURIComponent(ticket.number)}`);
    await expect(row(page, ticket.number)).toContainText('Cek ke lokasi oleh teknisi');
    const overflow = await page.getByRole('table').evaluate((table) => {
      const card = table.closest('.card')!;
      return table.getBoundingClientRect().right - card.getBoundingClientRect().right;
    });
    expect(overflow, 'tabel melebihi kartunya').toBeLessThanOrEqual(1);
    await expectNoPageOverflow(page);
  });

  test('ponsel 375 px: tab bergulir sendiri tanpa gulir samping halaman; cari lewat menu', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 740 });
    await signInAs(page, 'l1.contoh');
    // Tiket dengan nomor dan nama remote panjang, agar lebar baris benar-benar diuji.
    await createTicket(page, 'MRS-003');
    await page.goto('/tiket?tampilan=semua');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tiket');
    // Periksa setelah baris tiket tampil: tabel yang belum dimuat tidak bisa melebar.
    await expect(page.getByRole('row').nth(1)).toBeVisible();
    await expectNoPageOverflow(page);
    for (const link of await page.getByRole('navigation', { name: 'Tampilan tiket' }).getByRole('link').all()) {
      expect((await link.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    }

    await page.getByRole('button', { name: 'Buka menu' }).click();
    const box = page.locator('#menu-utama').getByRole('searchbox', { name: 'Cari tiket atau remote' });
    await box.fill('MRS-003');
    await box.press('Enter');
    await expectPath(page, '/cari');
    await expect(page.getByRole('region', { name: /^Remote/ })).toContainText('MRS-003');
    await expectNoPageOverflow(page);
  });
});
