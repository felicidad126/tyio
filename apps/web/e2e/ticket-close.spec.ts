import { type Browser, expect, type Page, test } from '@playwright/test';
import writeXlsxFile from 'write-excel-file/node';
import { ACCOUNTS, loginAs } from './accounts';

// Aturan penutupan (langkah 1.6): "Tutup NPR" hanya di Pulih · siap ditutup, dengan penyebab
// dari daftar tetap dan penyelesaian (T98); L1 menutup NPR tanpa TT, NPR dengan TT dan TT itu
// sendiri hanya L2/admin (K21); TT harus ditutup dulu (T99); TT ditutup dengan hasil kunjungan
// (T100); halaman remote menampilkan riwayat semua NPR-nya (T101). Setiap uji memakai remote
// dan NPR baru lewat API.

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const run = Math.random().toString(36).slice(2, 7).toUpperCase();

interface Created {
  id: string;
  number: string;
  remoteId: string;
  name: string;
}

/** Remote baru di customer BNA dan NPR-nya (dibuat admin lewat API), lalu dipindah ke `status`. */
async function newTicket(browser: Browser, suffix: string, status: 'terbuka' | 'pulih' = 'pulih'): Promise<Created> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await loginAs(page, ACCOUNTS.admin);
  const tenants = (await (await page.request.get('/api/tenants')).json()) as Array<{ id: string; code: string }>;
  const bna = tenants.find((tenant) => tenant.code === 'BNA');
  if (!bna) throw new Error('Customer BNA dari seed tidak ada.');
  const code = `E2E-TUTUP-${run}-${suffix}`;
  const name = `ATM Uji Tutup ${run} ${suffix}`;
  const file = await writeXlsxFile([
    ['Kode remote', 'Nama remote', 'Jarkom', 'Zona waktu', 'Kota', 'Kontak 1 nama', 'Kontak 1 telepon'],
    [code, name, 'VSAT', 'WITA', 'Kendari', 'Rina', '0811-1234-567'],
  ]).toBuffer();
  const imported = await page.request.post(`/api/remote-import?tenantId=${bna.id}&mode=save`, {
    headers: { 'Content-Type': XLSX },
    data: file,
  });
  expect((await imported.json()).created).toBe(1);
  const found = (await (await page.request.get(`/api/remotes?q=${code}`)).json()) as { items: Array<{ id: string }> };
  const remoteId = found.items[0]?.id ?? '';
  const ticket = await createTicketFor(page, bna.id, remoteId);
  if (status === 'pulih') await moveToRecovered(page, ticket.id);
  await context.close();
  return { ...ticket, remoteId, name };
}

async function createTicketFor(page: Page, tenantId: string, remoteId: string): Promise<{ id: string; number: string }> {
  const pick = async (kind: string, value: string) => {
    const values = (await (await page.request.get(`/api/master/${kind}?tenantId=${tenantId}`)).json()) as Array<{
      id: string;
      name: string;
    }>;
    return values.find((item) => item.name === value)?.id;
  };
  const created = await page.request.post('/api/tickets', {
    data: {
      remoteId,
      categoryId: await pick('kategori', 'Remote Down'),
      systemId: await pick('system', 'SNMP NOC'),
      description: 'Ping gagal 100% dari NOC',
      acknowledgeOpenTickets: true,
    },
  });
  expect(created.status()).toBe(201);
  return (await created.json()) as { id: string; number: string };
}

async function moveToRecovered(page: Page, ticketId: string): Promise<void> {
  const moved = await page.request.post(`/api/tickets/${ticketId}/actions`, {
    data: { kind: 'catatan', note: 'Remote up kembali', statusFrom: 'terbuka', statusTo: 'pulih' },
  });
  expect(moved.status()).toBe(201);
}

const statusPill = (page: Page) => page.locator('.page-header .status-pill');

test('L1 menutup NPR tanpa TT: tombol hanya di Pulih, penyebab dan penyelesaian wajib, kartu Penutupan', async ({
  page,
  browser,
}) => {
  const ticket = await newTicket(browser, 'A', 'terbuka');
  await loginAs(page, ACCOUNTS.l1);
  await page.goto(`/tiket/${ticket.id}`);
  await expect(statusPill(page)).toHaveText('Terbuka');
  await expect(page.getByRole('button', { name: 'Tutup NPR' })).toHaveCount(0);

  // Pindah ke Pulih lewat panel tindakan: pilihan status tidak memuat Ditutup.
  await page.getByRole('button', { name: 'Tambah tindakan' }).click();
  const actionPanel = page.getByRole('dialog');
  await actionPanel.getByLabel('Catatan').fill('Remote up 15:10 setelah listrik menyala');
  await expect(actionPanel.getByRole('radio', { name: 'Ditutup', exact: true })).toHaveCount(0);
  await actionPanel.getByLabel('Pulih · siap ditutup').check();
  await actionPanel.getByRole('button', { name: 'Simpan tindakan' }).click();
  await expect(actionPanel).toBeHidden();
  await expect(statusPill(page)).toHaveText('Pulih · siap ditutup');

  const opener = page.getByRole('button', { name: 'Tutup NPR' });
  await expect(opener).toBeEnabled();
  await opener.click();
  const dialog = page.getByRole('dialog', { name: 'Tutup NPR' });
  await expect(dialog.getByLabel('Penyebab')).toBeFocused();
  await dialog.getByRole('button', { name: 'Tutup NPR' }).click();
  await expect(dialog.getByText('Pilih penyebab gangguan.')).toBeVisible();
  await dialog.getByLabel('Penyebab').selectOption({ label: 'Listrik' });
  await dialog.getByRole('button', { name: 'Tutup NPR' }).click();
  await expect(dialog.getByText('Penyelesaian wajib diisi.')).toBeVisible();
  await expect(dialog.getByLabel('Penyelesaian')).toBeFocused();
  await dialog.getByLabel('Penyelesaian').fill('PLN menyalakan kembali listrik gedung; remote up 15:10');
  await dialog.getByRole('button', { name: 'Tutup NPR' }).click();
  await expect(dialog).toBeHidden();

  await expect(statusPill(page)).toHaveText('Ditutup');
  await expect(page.getByRole('status').filter({ hasText: 'NPR ditutup.' })).toBeFocused();
  const closure = page.getByRole('region', { name: 'Penutupan' });
  await expect(closure).toContainText('Listrik');
  await expect(closure).toContainText('PLN menyalakan kembali listrik gedung; remote up 15:10');
  await expect(closure).toContainText('Dewi A.');
  await expect(page.getByRole('button', { name: 'Tambah tindakan' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Buka kembali' })).toHaveCount(0);
  const latest = page.getByRole('region', { name: /^Linimasa/ }).getByRole('listitem').first();
  await expect(latest).toContainText('NPR ditutup');
  await expect(latest).toContainText('Penyebab: Listrik');
  await expect(latest).toContainText('Pulih · siap ditutup → Ditutup');
});

test('NPR dengan TT: L1 melihat alasan tombol mati; L2 menutup TT dengan hasil kunjungan lalu menutup NPR', async ({
  page,
  browser,
}) => {
  const ticket = await newTicket(browser, 'B');
  await loginAs(page, ACCOUNTS.l1);
  await page.goto(`/tiket/${ticket.id}`);
  await page.getByRole('button', { name: 'Buat TT ke SD' }).click();
  const ttPanel = page.getByRole('dialog');
  await ttPanel.getByLabel('Problem jarkom').fill('Modem VSAT tidak sinkron, perlu cek BUC/LNB');
  await ttPanel.getByRole('button', { name: 'Simpan TT' }).click();
  await expect(ttPanel).toBeHidden();
  const card = page.getByRole('region', { name: /^TT ke SD/ }).getByRole('article');
  const ttNumber = (await card.getByRole('heading').textContent())?.trim() ?? '';

  // L1: K21, tombol mati dengan alasan tertulis; tidak ada "Tutup TT".
  await expect(page.getByRole('button', { name: 'Tutup NPR' })).toBeDisabled();
  await expect(page.getByText('NPR yang punya TT hanya ditutup L2 atau admin.')).toBeVisible();
  await expect(card.getByRole('button', { name: 'Tutup TT' })).toHaveCount(0);
  await expect(card).toContainText('TT ditutup oleh L2 atau admin');

  const l2Context = await browser.newContext();
  const l2 = await l2Context.newPage();
  await loginAs(l2, ACCOUNTS.l2);
  await l2.goto(`/tiket/${ticket.id}`);
  // T99: TT yang masih berjalan disebut di alasan.
  await expect(l2.getByRole('button', { name: 'Tutup NPR' })).toBeDisabled();
  await expect(l2.getByText(`Tutup dulu TT yang masih berjalan: ${ttNumber}.`)).toBeVisible();

  const l2Card = l2.getByRole('region', { name: /^TT ke SD/ }).getByRole('article');
  await l2Card.getByRole('button', { name: 'Tutup TT' }).click();
  const dialog = l2.getByRole('dialog', { name: 'Tutup TT' });
  await expect(dialog).toContainText(ttNumber);
  await expect(dialog.getByLabel('Hasil kunjungan / penyelesaian')).toBeFocused();
  await dialog.getByRole('button', { name: 'Tutup TT' }).click();
  await expect(dialog.getByText('Hasil kunjungan / penyelesaian wajib diisi.')).toBeVisible();
  await dialog.getByLabel('Hasil kunjungan / penyelesaian').fill('Teknisi SD tiba 14:05; modem VSAT diganti; remote up 14:40');
  await dialog.getByRole('button', { name: 'Tutup TT' }).click();
  await expect(dialog).toBeHidden();

  await expect(l2.getByRole('status').filter({ hasText: `${ttNumber} ditutup.` })).toBeVisible();
  await expect(l2Card.locator('.tt-pill')).toHaveText('Ditutup');
  await expect(l2Card).toContainText('Teknisi SD tiba 14:05; modem VSAT diganti; remote up 14:40');
  await expect(l2Card).toContainText('Arif S.');
  await expect(l2Card.getByRole('button', { name: 'Salin ringkasan TT' })).toHaveCount(0);
  await expect(l2.getByRole('region', { name: /^Linimasa/ }).getByRole('listitem').first()).toContainText('TT ditutup');
  await expect(statusPill(l2)).toHaveText('Pulih · siap ditutup');

  const closeNpr = l2.getByRole('button', { name: 'Tutup NPR' });
  await expect(closeNpr).toBeEnabled();
  await closeNpr.click();
  const closeDialog = l2.getByRole('dialog', { name: 'Tutup NPR' });
  await closeDialog.getByLabel('Penyebab').selectOption({ label: 'Perangkat' });
  await closeDialog.getByLabel('Penyelesaian').fill('Modem VSAT diganti teknisi SD');
  await closeDialog.getByRole('button', { name: 'Tutup NPR' }).click();
  await expect(closeDialog).toBeHidden();
  await expect(statusPill(l2)).toHaveText('Ditutup');
  await expect(l2.getByRole('region', { name: 'Penutupan' })).toContainText('Perangkat');
  // L2 boleh membuka kembali (T66).
  await expect(l2.getByRole('button', { name: 'Buka kembali' })).toBeVisible();
  await l2Context.close();

  // Halaman L1 yang usang: penutupan NPR ditolak server dengan alasan yang sama (bukan hanya tombol).
  const denied = await page.request.post(`/api/tickets/${ticket.id}/close`, {
    data: { cause: 'listrik', resolution: 'x' },
  });
  expect(denied.status()).toBe(400);
});

test('riwayat NPR di halaman remote: NPR ditutup dengan penyebab, NPR berjalan ditandai', async ({ page, browser }) => {
  const closed = await newTicket(browser, 'C');
  await loginAs(page, ACCOUNTS.l1);
  const closedRes = await page.request.post(`/api/tickets/${closed.id}/close`, {
    data: { cause: 'cuaca', resolution: 'Hujan lebat (rain fade); sinyal kembali normal' },
  });
  expect(closedRes.status()).toBe(201);
  const tenantId = ((await (await page.request.get(`/api/tickets/${closed.id}`)).json()) as { tenantId: string }).tenantId;
  const running = await createTicketFor(page, tenantId, closed.remoteId);

  await page.goto(`/remote/${closed.remoteId}`);
  const history = page.getByRole('region', { name: 'Riwayat NPR (2)' });
  const rows = history.getByRole('row');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(1)).toContainText(running.number);
  await expect(rows.nth(1)).toContainText('berjalan');
  await expect(rows.nth(1)).toContainText('Belum ditutup');
  await expect(rows.nth(2)).toContainText(closed.number);
  await expect(rows.nth(2)).toContainText('Ditutup');
  await expect(rows.nth(2)).toContainText('Cuaca');
  await expect(rows.nth(2)).toContainText('Hujan lebat (rain fade); sinyal kembali normal');

  // Desktop 1280 px: tabel muat tanpa geser mendatar di dalam kartu.
  expect(await history.locator('.table-responsive').evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);

  await rows.nth(2).getByRole('link', { name: closed.number }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(closed.number);
});

test('ponsel 375px: tombol dan panel penutupan, halaman remote dengan riwayat tanpa geser mendatar', async ({
  page,
  browser,
}) => {
  const ticket = await newTicket(browser, 'D');
  await page.setViewportSize({ width: 375, height: 740 });
  await loginAs(page, ACCOUNTS.l2);
  await page.goto(`/tiket/${ticket.id}`);
  const opener = page.getByRole('button', { name: 'Tutup NPR' });
  await expect(opener).toBeVisible();
  expect((await opener.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);

  await opener.click();
  const dialog = page.getByRole('dialog', { name: 'Tutup NPR' });
  const box = await dialog.boundingBox();
  expect(box?.width ?? 0).toBeLessThanOrEqual(375);
  await dialog.getByLabel('Penyebab').selectOption({ label: 'Link/jarkom' });
  await dialog.getByLabel('Penyelesaian').fill('Link VSAT kembali normal setelah repointing');
  await dialog.getByRole('button', { name: 'Tutup NPR' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('region', { name: 'Penutupan' })).toContainText('Link/jarkom');
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);

  await page.goto(`/remote/${ticket.remoteId}`);
  await expect(page.getByRole('region', { name: 'Riwayat NPR (1)' })).toContainText('Link/jarkom');
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  const tableScroll = await page
    .getByRole('region', { name: 'Riwayat NPR (1)' })
    .locator('.table-responsive')
    .evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(tableScroll).toBeLessThanOrEqual(0);
});

// Regresi: aturan tema gelap di CSS komponen pernah dikompilasi menjadi `[data-bs-theme=dark]{…}`
// tanpa kelasnya (`:global(…) .kelas`), sehingga teks oranye/hijau gelap tetap dipakai di latar gelap.
test('tema gelap: tombol penutupan, "Belum disalin", dan alasan pending memakai warna terang', async ({
  page,
  browser,
}) => {
  const ticket = await newTicket(browser, 'E');
  await page.emulateMedia({ colorScheme: 'dark' });
  await loginAs(page, ACCOUNTS.l2);
  const tt = await page.request.post(`/api/tickets/${ticket.id}/trouble-tickets`, { data: { problem: 'Modem mati' } });
  const ttNumber = ((await tt.json()) as { ticket: { troubleTickets: Array<{ number: string }> } }).ticket.troubleTickets[0]
    ?.number;

  await page.goto(`/tiket/${ticket.id}`);
  await expect(page.locator('html')).toHaveAttribute('data-bs-theme', 'dark');
  const closeTt = page.getByRole('region', { name: /^TT ke SD/ }).getByRole('button', { name: 'Tutup TT' });
  await expect(closeTt).toHaveCSS('color', 'rgb(111, 207, 138)');

  await page.goto(`/tiket?daftar=tt&tq=${encodeURIComponent(ttNumber ?? '')}`);
  await expect(page.getByText('Belum disalin').first()).toHaveCSS('color', 'rgb(244, 165, 119)');

  const pending = await page.request.post(`/api/tickets/${ticket.id}/actions`, {
    data: {
      kind: 'catatan',
      note: 'Menunggu PIC',
      statusFrom: 'pulih',
      statusTo: 'pending_customer',
      pendingReason: 'PIC cabang belum datang',
    },
  });
  expect(pending.status()).toBe(201);
  await page.goto(`/tiket?q=${encodeURIComponent(ticket.number)}`);
  await expect(page.getByText('PIC cabang belum datang').first()).toHaveCSS('color', 'rgb(240, 195, 107)');
});
