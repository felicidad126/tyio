import { expect, type Page, test } from '@playwright/test';
import { expectNoPageOverflow, expectPath, signInAs } from './helpers';

// Image uji berjalan tanpa token bot: notifikasi dicatat dan menunggu, tidak dikirim ke Telegram.
const uniqueChat = () => `-100${String(Date.now()).slice(-10)}${Math.floor(Math.random() * 90 + 10)}`;
const drawer = (page: Page) => page.getByRole('dialog');

async function tenantId(page: Page, code: string): Promise<string> {
  const tenants = (await (await page.request.get('/api/tenants')).json()).tenants as Array<{ id: string; code: string }>;
  return tenants.find((t) => t.code === code)!.id;
}

async function createTicket(page: Page, site: string): Promise<string> {
  const remote = (await (await page.request.get(`/api/remotes?q=${site}`)).json()).items[0];
  const categories = (await (await page.request.get('/api/master/kategori')).json()).items as Array<{ id: string; code: string }>;
  const res = await page.request.post('/api/tickets', {
    data: {
      remoteId: remote.id,
      categoryId: categories.find((c) => c.code === 'RD')!.id,
      occurredAt: new Date().toISOString(),
      problem: `Uji notifikasi ${Date.now()}`,
      confirmOpenTickets: true,
    },
  });
  expect(res.status()).toBe(201);
  return (await res.json()).ticket.number as string;
}

test.describe('Admin › Notifikasi', () => {
  test('tambah grup lewat panel: validasi, customer tertentu; NPR customer itu masuk log sebagai menunggu', async ({ page }) => {
    const name = `NOC Uji ${Date.now()}`;
    await signInAs(page, 'admin.contoh');
    await page.goto('/admin/master/customer');
    await page.getByRole('navigation', { name: 'Bagian Admin' }).getByRole('link', { name: 'Notifikasi' }).click();
    await expectPath(page, '/admin/notifikasi');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Notifikasi');
    await expect(page.getByTestId('status-bot')).toContainText('Belum dipasang');

    await page.getByRole('button', { name: 'Tambah grup' }).first().click();
    const form = drawer(page);
    await expect(form.getByRole('heading', { name: 'Tambah grup Telegram' })).toBeVisible();
    // Tanpa token, tombol Cari grup tidak ditawarkan; kejadian bawaan sudah dicentang.
    await expect(form.getByRole('button', { name: 'Cari grup' })).toHaveCount(0);
    await expect(form.getByRole('checkbox', { name: /^NPR baru/ })).toBeChecked();
    await expect(form.getByRole('checkbox', { name: /^NPR dibuka lagi/ })).not.toBeChecked();

    await form.getByRole('button', { name: 'Tambah grup' }).click();
    await expect(form.getByText('Isi nama grup')).toBeVisible();
    await expect(form.getByText('Isi ID chat grup Telegram.')).toBeVisible();

    await form.getByLabel('Nama').fill(name);
    await form.getByLabel('ID chat grup').fill('grup noc');
    await form.getByLabel('ID chat grup').blur();
    await expect(form.getByText(/ID chat berupa angka/)).toBeVisible();
    await form.getByLabel('ID chat grup').fill(uniqueChat());
    await form.getByRole('radio', { name: 'Customer tertentu' }).check();
    await form.getByRole('button', { name: 'Tambah grup' }).click();
    await expect(form.getByText('Pilih minimal satu customer, atau Semua customer.')).toBeVisible();
    await form.getByRole('checkbox', { name: 'Bank Merapi Sejahtera' }).check();
    await form.getByRole('button', { name: 'Tambah grup' }).click();
    await expect(form).toBeHidden();

    const row = page.getByTestId(`grup-${name}`);
    await expect(row).toContainText('Bank Merapi Sejahtera');
    await expect(row).toContainText('NPR baru');
    await expect(row).toContainText('TT dibuka (Eskalasi To SD)');
    await expect(row.getByRole('button', { name: 'Kirim uji' })).toBeDisabled();

    // NPR customer lain tidak dicatat untuk grup ini; NPR Merapi dicatat dan menunggu (tanpa token).
    await createTicket(page, 'BCN-012');
    const number = await createTicket(page, 'MRS-021');
    await page.getByRole('button', { name: 'Muat ulang' }).click();
    const log = page.getByTestId('log-pengiriman');
    const entry = log.getByRole('row').filter({ hasText: number });
    await expect(entry).toContainText(name);
    await expect(entry).toContainText('Menunggu');
    await expect(entry).toContainText('NPR baru');
    await expect(log.getByRole('row').filter({ hasText: name }).filter({ hasText: 'BCN' })).toHaveCount(0);
    await expect(row).toContainText(/\d+ notifikasi menunggu dikirim/);

    // Hapus dengan konfirmasi yang menyebut nama grup.
    await row.getByRole('button', { name: `Hapus ${name}` }).click();
    const confirm = page.getByRole('dialog');
    await expect(confirm.getByRole('heading')).toHaveText(`Hapus grup ${name}?`);
    await confirm.getByRole('button', { name: `Hapus ${name}` }).click();
    await expect(page.getByTestId(`grup-${name}`)).toHaveCount(0);
  });

  test('ubah grup: nonaktifkan dan pilih kejadian; nama kembar ditolak di kolomnya', async ({ page }) => {
    const name = `SD Uji ${Date.now()}`;
    await signInAs(page, 'admin.contoh');
    const base = { chatId: uniqueChat(), events: ['tt_dibuka'], allTenants: true, tenantIds: [], active: true };
    const created = await page.request.post('/api/admin/notifications/channels', { data: { name, ...base } });
    expect(created.status()).toBe(201);
    const other = await page.request.post('/api/admin/notifications/channels', {
      data: { ...base, name: `${name} B`, chatId: uniqueChat(), allTenants: false, tenantIds: [await tenantId(page, 'MRS')] },
    });
    expect(other.status()).toBe(201);
    await page.goto('/admin/notifikasi');

    await page.getByRole('button', { name: `Ubah ${name}`, exact: true }).click();
    const form = drawer(page);
    await expect(form.getByLabel('Nama')).toHaveValue(name);
    await form.getByLabel('Nama').fill(`${name} b`);
    await form.getByRole('button', { name: 'Simpan perubahan' }).click();
    await expect(form.getByText('Nama ini sudah dipakai grup lain.')).toBeVisible();
    await form.getByLabel('Nama').fill(name);
    await form.getByRole('checkbox', { name: /^NPR Selesai/ }).check();
    await form.getByRole('checkbox', { name: /^Aktif/ }).uncheck();
    await form.getByRole('button', { name: 'Simpan perubahan' }).click();
    await expect(form).toBeHidden();
    const row = page.getByTestId(`grup-${name}`);
    await expect(row).toContainText('Nonaktif');
    await expect(row).toContainText('NPR Selesai (Close)');

    for (const id of [(await created.json()).channel.id, (await other.json()).channel.id]) {
      expect((await page.request.delete(`/api/admin/notifications/channels/${id}`)).status()).toBe(204);
    }
  });

  test('Helpdesk tidak bisa membuka pengaturan notifikasi', async ({ page }) => {
    await signInAs(page, 'helpdesk.contoh');
    await page.goto('/admin/notifikasi');
    await expectPath(page, '/tanpa-akses');
  });

  test('ponsel 375 px: halaman dan panel tanpa gulir samping; tombol setinggi jari', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 740 });
    await signInAs(page, 'admin.contoh');
    await page.goto('/admin/notifikasi');
    await expect(page.getByTestId('status-bot')).toBeVisible();
    await expectNoPageOverflow(page);
    await page.getByRole('button', { name: 'Tambah grup' }).first().click();
    const form = drawer(page);
    await expect(form.getByLabel('Nama')).toBeVisible();
    await expectNoPageOverflow(page);
    for (const control of await form.locator('button:visible, label.option:visible').all()) {
      expect((await control.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    }
  });
});
