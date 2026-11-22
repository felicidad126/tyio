import { type Browser, expect, type Page, test } from '@playwright/test';
import writeXlsxFile from 'write-excel-file/node';
import { ACCOUNTS, loginAs } from './accounts';

// Halaman NPR (langkah 1.4): linimasa hanya-tambah, panel "Tambah tindakan" dengan status
// sesudah tindakan (T64), alasan pending wajib (T68), nomor tiket customer, lampiran lewat
// klik atau tempel (T70), koreksi, dan tabrakan status. Setiap uji memakai remote dan NPR
// baru yang dibuat lewat API, agar tidak bergantung pada data run sebelumnya.

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const run = Math.random().toString(36).slice(2, 7).toUpperCase();
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('gambar uji')]);

/** NPR baru di remote uji baru (Bank Nusa, WITA), dibuat admin lewat API; mengembalikan id NPR. */
async function newTicket(browser: Browser, suffix: string): Promise<string> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await loginAs(page, ACCOUNTS.admin);
  const tenants = (await (await page.request.get('/api/tenants')).json()) as Array<{ id: string; code: string }>;
  const bna = tenants.find((tenant) => tenant.code === 'BNA');
  if (!bna) throw new Error('Customer BNA dari seed tidak ada.');
  const code = `E2E-LIN-${run}-${suffix}`;
  const file = await writeXlsxFile([
    ['Kode remote', 'Nama remote', 'Jarkom', 'Zona waktu', 'Kota'],
    [code, `ATM Uji Linimasa ${run} ${suffix}`, 'VSAT', 'WITA', 'Makassar'],
  ]).toBuffer();
  const imported = await page.request.post(`/api/remote-import?tenantId=${bna.id}&mode=save`, {
    headers: { 'Content-Type': XLSX },
    data: file,
  });
  expect((await imported.json()).created).toBe(1);
  const found = (await (await page.request.get(`/api/remotes?q=${code}`)).json()) as { items: Array<{ id: string }> };
  const pick = async (kind: string, name: string) => {
    const values = (await (await page.request.get(`/api/master/${kind}?tenantId=${bna.id}`)).json()) as Array<{
      id: string;
      name: string;
    }>;
    return values.find((value) => value.name === name)?.id;
  };
  const created = await page.request.post('/api/tickets', {
    data: {
      remoteId: found.items[0]?.id,
      categoryId: await pick('kategori', 'Remote Down'),
      systemId: await pick('system', 'SNMP NOC'),
      description: 'Ping gagal 100% dari NOC',
    },
  });
  expect(created.status()).toBe(201);
  const id = ((await created.json()) as { id: string }).id;
  await context.close();
  return id;
}

async function openTicket(page: Page, id: string): Promise<void> {
  await page.goto(`/tiket/${id}`);
  await expect(page.getByRole('heading', { name: /^Linimasa/ })).toBeVisible();
}

const panel = (page: Page) => page.getByRole('dialog');
const timeline = (page: Page) => page.getByRole('region', { name: /^Linimasa/ });
/** Label status di judul halaman. */
const statusPill = (page: Page) => page.locator('.page-header .status-pill');

test('L1 menambah tindakan: status Pending · Customer dengan alasan, nomor tiket customer, lampiran klik dan tempel', async ({
  page,
  browser,
}) => {
  const id = await newTicket(browser, 'A');
  await loginAs(page, ACCOUNTS.l1);
  await openTicket(page, id);
  await expect(statusPill(page)).toHaveText('Terbuka');
  await expect(timeline(page).getByRole('listitem').filter({ hasText: 'NPR dibuat' })).toBeVisible();

  const opener = page.getByRole('button', { name: 'Tambah tindakan' });
  await opener.click();
  await expect(panel(page)).toBeVisible();
  await expect(panel(page).getByLabel('Catatan')).toBeFocused();

  // Simpan tanpa catatan dan tanpa alasan pending: pesan di isian, fokus ke isian pertama yang salah.
  await panel(page).getByLabel('Pending · Customer').check();
  await panel(page).getByRole('button', { name: 'Simpan tindakan' }).click();
  await expect(panel(page).getByText('Catatan wajib diisi.')).toBeVisible();
  await expect(panel(page).getByText('Alasan pending wajib diisi.')).toBeVisible();
  await expect(panel(page).getByLabel('Catatan')).toBeFocused();

  await panel(page).getByLabel('Apa yang dikerjakan').selectOption({ label: 'Hubungi customer' });
  await panel(page).getByLabel('Catatan').fill('PIC cabang diminta menyalakan ulang modem');
  await expect(panel(page).getByText('Catatan wajib diisi.')).toBeHidden();
  await panel(page).getByLabel('Alasan pending').fill('Menunggu PIC tiba di lokasi');
  await panel(page).getByLabel('No. tiket customer').fill('INC-88213');

  // Lampiran lewat pemilih berkas dan lewat tempel gambar (Ctrl+V).
  await panel(page).getByLabel('Lampiran').setInputFiles({ name: 'ping-1752.png', mimeType: 'image/png', buffer: PNG });
  await panel(page).getByLabel('Catatan').evaluate((field, bytes) => {
    const data = new DataTransfer();
    data.items.add(new File([new Uint8Array(bytes)], 'image.png', { type: 'image/png' }));
    field.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  }, [...PNG]);
  const picked = panel(page).getByRole('list', { name: 'Berkas yang akan dilampirkan' }).getByRole('listitem');
  await expect(picked).toHaveCount(2);
  await expect(picked.nth(1)).toContainText(/^tempel-\d{6}\.png/);

  await panel(page).getByRole('button', { name: 'Simpan tindakan' }).click();
  await expect(panel(page)).toBeHidden();
  await expect(page.getByRole('status').filter({ hasText: 'Tindakan tersimpan di linimasa.' })).toBeFocused();
  await expect(statusPill(page)).toHaveText('Pending · Customer');
  await expect(page.getByRole('definition').filter({ hasText: 'INC-88213' })).toBeVisible();

  const entry = timeline(page).getByRole('listitem').filter({ hasText: 'PIC cabang diminta' }).first();
  await expect(entry).toContainText('Hubungi customer');
  await expect(entry).toContainText('Status: Terbuka → Pending · Customer');
  await expect(entry).toContainText('Alasan pending: Menunggu PIC tiba di lokasi');
  await expect(entry).toContainText('No. tiket customer: INC-88213');
  const files = entry.getByRole('link');
  await expect(files).toHaveCount(2);
  const href = await files.filter({ hasText: 'ping-1752.png' }).getAttribute('href');
  const download = await page.request.get(href ?? '');
  expect(download.status()).toBe(200);
  expect(download.headers()['content-type']).toBe('image/png');
  expect(Buffer.compare(await download.body(), PNG)).toBe(0);
  await expect(page.getByRole('heading', { name: 'Linimasa (2)' })).toBeVisible();
});

test('koreksi: entri lama tetap ada dan ditandai dikoreksi', async ({ page, browser }) => {
  const id = await newTicket(browser, 'B');
  await loginAs(page, ACCOUNTS.l1);
  await openTicket(page, id);

  await page.getByRole('button', { name: 'Tambah tindakan' }).click();
  await panel(page).getByLabel('Catatan').fill('Gangguan mulai sekitar 14:30');
  await panel(page).getByRole('button', { name: 'Simpan tindakan' }).click();
  await expect(panel(page)).toBeHidden();

  const original = timeline(page).getByRole('listitem').filter({ hasText: 'Gangguan mulai sekitar 14:30' }).first();
  await original.getByRole('button', { name: /^Koreksi entri Cek jaringan/ }).click();
  await expect(panel(page).getByRole('heading', { name: 'Koreksi entri' })).toBeVisible();
  await expect(panel(page)).toContainText('Gangguan mulai sekitar 14:30');
  await panel(page).getByLabel('Isi koreksi').fill('Waktu mulai 14:12 dari log NMS, bukan 14:30');
  await panel(page).getByRole('button', { name: 'Simpan koreksi' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Koreksi tersimpan di linimasa.' })).toBeVisible();

  const correction = timeline(page).getByRole('listitem').filter({ hasText: 'Waktu mulai 14:12' }).first();
  await expect(correction).toContainText('Koreksi');
  await expect(correction).toContainText(/Mengoreksi entri Cek jaringan/);
  await expect(original).toContainText('Gangguan mulai sekitar 14:30');
  await expect(original).toContainText(/Dikoreksi oleh entri Koreksi/);
  // Status tidak berubah oleh koreksi.
  await expect(statusPill(page)).toHaveText('Terbuka');
});

test('panel: Escape menutup dan fokus kembali ke tombol pembuka; tanpa geser mendatar di ponsel', async ({
  page,
  browser,
}) => {
  const id = await newTicket(browser, 'C');
  await page.setViewportSize({ width: 375, height: 800 });
  await loginAs(page, ACCOUNTS.l1);
  await openTicket(page, id);
  const opener = page.getByRole('button', { name: 'Tambah tindakan' });
  await opener.click();
  await expect(panel(page)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await page.keyboard.press('Escape');
  await expect(panel(page)).toBeHidden();
  await expect(opener).toBeFocused();
  // Batal tidak menyimpan apa pun.
  await opener.click();
  await panel(page).getByLabel('Catatan').fill('Tidak jadi');
  await panel(page).getByRole('button', { name: 'Batal' }).click();
  await expect(page.getByRole('heading', { name: 'Linimasa (1)' })).toBeVisible();
});

test('status diubah operator lain saat panel terbuka: pesan jelas, status dimuat ulang, tidak ada yang tersimpan', async ({
  page,
  browser,
}) => {
  const id = await newTicket(browser, 'D');
  await loginAs(page, ACCOUNTS.l1);
  await openTicket(page, id);
  await page.getByRole('button', { name: 'Tambah tindakan' }).click();
  await panel(page).getByLabel('Catatan').fill('Eskalasi ke NOC');
  await panel(page).getByLabel('Eskalasi · L2').check();

  const other = await page.request.post(`/api/tickets/${id}/actions`, {
    data: { kind: 'catatan', note: 'Diambil operator lain', statusFrom: 'terbuka', statusTo: 'dikerjakan' },
  });
  expect(other.status()).toBe(201);

  await panel(page).getByRole('button', { name: 'Simpan tindakan' }).click();
  await expect(panel(page).getByRole('alert')).toContainText('Status NPR sudah berubah menjadi Dikerjakan');
  await expect(panel(page).getByLabel('Tetap Dikerjakan')).toBeChecked();
  await expect(panel(page).getByLabel('Catatan')).toHaveValue('Eskalasi ke NOC');
  await panel(page).getByRole('button', { name: 'Batal' }).click();
  await expect(page.getByRole('heading', { name: 'Linimasa (2)' })).toBeVisible();
  await expect(timeline(page)).not.toContainText('Eskalasi ke NOC');
});
