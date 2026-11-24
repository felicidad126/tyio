import { type Browser, expect, type Page, test } from '@playwright/test';
import writeXlsxFile from 'write-excel-file/node';
import { ACCOUNTS, loginAs } from './accounts';

// Pembaruan langsung (langkah 2.2, T128–T130): perubahan oleh orang lain muncul tanpa muat ulang
// di Overview, antrean, halaman NPR, dan angka menu Tiket; sambungan yang putus terlihat dan
// menyambung sendiri. Data uji di customer seed Bank Selaras (BSL): berkas uji lain tidak
// membuat NPR di sana, jadi angka yang diamati hanya berubah karena uji ini.

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const run = Math.random().toString(36).slice(2, 7).toUpperCase();
let counter = 0;

interface Bsl {
  tenantId: string;
  category: string;
  system: string;
}
let bsl: Promise<Bsl> | null = null;

/** Admin di konteks peramban terpisah ("operator lain"). */
async function asAdmin<T>(browser: Browser, work: (page: Page) => Promise<T>): Promise<T> {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await loginAs(page, ACCOUNTS.admin);
    return await work(page);
  } finally {
    await context.close();
  }
}

function customer(browser: Browser): Promise<Bsl> {
  bsl ??= asAdmin(browser, async (page) => {
    const tenants = (await (await page.request.get('/api/tenants')).json()) as Array<{ id: string; code: string }>;
    const tenantId = tenants.find((tenant) => tenant.code === 'BSL')?.id;
    if (!tenantId) throw new Error('Customer BSL dari seed tidak ada.');
    const pick = async (kind: string, name: string) => {
      const values = (await (await page.request.get(`/api/master/${kind}?tenantId=${tenantId}`)).json()) as Array<{
        id: string;
        name: string;
      }>;
      const id = values.find((value) => value.name === name)?.id;
      if (!id) throw new Error(`${kind} ${name} tidak ada.`);
      return id;
    };
    return { tenantId, category: await pick('kategori', 'Remote Down'), system: await pick('system', 'SNMP NOC') };
  });
  return bsl;
}

/** NPR baru di remote baru (BSL), dibuat "operator lain". */
async function newTicket(browser: Browser): Promise<{ id: string; number: string }> {
  const data = await customer(browser);
  counter += 1;
  const code = `E2E-LIVE-${run}-${counter}`;
  return asAdmin(browser, async (page) => {
    const file = await writeXlsxFile([
      ['Kode remote', 'Nama remote', 'Jarkom', 'Zona waktu', 'Kota', 'Provinsi'],
      [code, `ATM Langsung ${run} ${counter}`, 'VSAT', 'WITA', 'Palu', 'Sulawesi Tengah'],
    ]).toBuffer();
    const imported = await page.request.post(`/api/remote-import?tenantId=${data.tenantId}&mode=save`, {
      headers: { 'Content-Type': XLSX },
      data: file,
    });
    expect((await imported.json()).created).toBe(1);
    const found = (await (await page.request.get(`/api/remotes?q=${code}`)).json()) as { items: Array<{ id: string }> };
    const res = await page.request.post('/api/tickets', {
      data: {
        remoteId: found.items[0]?.id,
        categoryId: data.category,
        systemId: data.system,
        description: 'Ping gagal 100% dari NOC',
      },
    });
    expect(res.status()).toBe(201);
    return (await res.json()) as { id: string; number: string };
  });
}

const live = (page: Page) => page.getByTestId('status-langsung');

/** Tanda bahwa halaman tidak dimuat ulang: hilang bila halaman dimuat ulang. */
async function markPage(page: Page): Promise<() => Promise<boolean>> {
  await page.evaluate(() => Object.assign(window, { __tandaUji: true }));
  return () => page.evaluate(() => (window as unknown as { __tandaUji?: boolean }).__tandaUji === true);
}

const numberIn = async (page: Page, testId: string) => Number((await page.getByTestId(testId).textContent())?.replace(/\D/g, ''));

test('Overview dan angka menu Tiket berubah sendiri saat NPR baru dibuat orang lain', async ({ page, browser }) => {
  const data = await customer(browser);
  await loginAs(page, ACCOUNTS.l1);
  await page.goto(`/?customer=${data.tenantId}`);
  await expect(live(page)).toContainText('Langsung');
  const open = page.getByRole('region', { name: 'Angka utama' }).getByRole('link', { name: /^\d+ NPR berjalan$/ });
  const before = Number((await open.textContent())?.trim());
  const menuBefore = await numberIn(page, 'angka-menu-tiket');
  const notReloaded = await markPage(page);

  await newTicket(browser);

  await expect(open).toHaveText(String(before + 1));
  await expect.poll(() => numberIn(page, 'angka-menu-tiket')).toBeGreaterThanOrEqual(menuBefore + 1);
  expect(await notReloaded()).toBe(true);
});

test('antrean: angka tab langsung berubah, daftar menunggu "Tampilkan" (T129)', async ({ page, browser }) => {
  const data = await customer(browser);
  await newTicket(browser); // antrean BSL tidak kosong
  await loginAs(page, ACCOUNTS.l1);
  await page.goto(`/tiket?customer=${data.tenantId}&sort=terbaru`);
  await expect(live(page)).toContainText('Langsung');
  const tab = page.getByRole('navigation', { name: 'Tampilan antrean' }).getByRole('link', { name: /^Semua terbuka/ });
  const before = Number((await tab.textContent())?.replace(/\D/g, ''));
  const rows = await page.getByRole('row').count();

  const created = await newTicket(browser);

  await expect(tab).toContainText(String(before + 1));
  const changes = page.getByRole('status').filter({ hasText: 'perubahan baru' });
  await expect(changes).toContainText('1 perubahan baru');
  // Daftar belum bergeser: NPR baru belum tampil, jumlah baris sama.
  await expect(page.getByRole('row').filter({ hasText: created.number })).toHaveCount(0);
  expect(await page.getByRole('row').count()).toBe(rows);

  await page.setViewportSize({ width: 375, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await changes.getByRole('button', { name: 'Tampilkan' }).click();
  await expect(page.getByRole('row').filter({ hasText: created.number })).toBeVisible();
  await expect(changes).toHaveCount(0);
});

test('halaman NPR: entri dari orang lain muncul tanpa muat ulang', async ({ page, browser }) => {
  const ticket = await newTicket(browser);
  await loginAs(page, ACCOUNTS.l1);
  await page.goto(`/tiket/${ticket.id}`);
  await expect(page.getByRole('heading', { name: ticket.number })).toBeVisible();
  await expect(live(page)).toContainText('Langsung');
  const notReloaded = await markPage(page);

  await asAdmin(browser, async (admin) => {
    const res = await admin.request.post(`/api/tickets/${ticket.id}/actions`, {
      data: { kind: 'catatan', note: `Catatan langsung ${run}`, statusFrom: 'terbuka', statusTo: 'eskalasi_l2' },
    });
    expect(res.status()).toBe(201);
  });

  await expect(page.getByRole('region', { name: /^Linimasa/ })).toContainText(`Catatan langsung ${run}`);
  await expect(page.getByRole('heading', { name: 'Linimasa (2)' })).toBeVisible();
  await expect(page.locator('.page-header').getByText('Eskalasi · L2', { exact: true })).toBeVisible();
  expect(await notReloaded()).toBe(true);
});

test('panel yang terbuka tetap memakai status saat dibuka: perubahan langsung tidak meloloskan tabrakan (T73)', async ({
  page,
  browser,
}) => {
  const ticket = await newTicket(browser);
  await loginAs(page, ACCOUNTS.l1);
  await page.goto(`/tiket/${ticket.id}`);
  await expect(live(page)).toContainText('Langsung');
  await page.getByRole('button', { name: 'Tambah tindakan' }).click();
  const panel = page.getByRole('dialog');
  await panel.getByLabel('Catatan').fill(`Dicek dari layar ${run}`);
  await panel.getByLabel('Eskalasi · L2').check();

  await asAdmin(browser, async (admin) => {
    const res = await admin.request.post(`/api/tickets/${ticket.id}/actions`, {
      data: { kind: 'catatan', note: 'Diambil operator lain', statusFrom: 'terbuka', statusTo: 'dikerjakan' },
    });
    expect(res.status()).toBe(201);
  });
  // Pembaruan langsung sudah tiba di halaman (status di judul berganti) sebelum menyimpan.
  await expect(page.locator('.page-header').getByText('Dikerjakan', { exact: true })).toBeVisible();

  await panel.getByRole('button', { name: 'Simpan tindakan' }).click();
  await expect(panel.getByRole('alert')).toContainText('Status NPR sudah berubah menjadi Dikerjakan');
  await panel.getByRole('button', { name: 'Batal' }).click();
  await expect(page.getByRole('region', { name: /^Linimasa/ })).not.toContainText(`Dicek dari layar ${run}`);
});

test('sambungan putus terlihat jelas, lalu menyambung sendiri dan memuat perubahan yang terlewat', async ({
  page,
  browser,
}) => {
  const data = await customer(browser);
  // Mode offline peramban tidak memutus aliran SSE yang sudah terbuka; EventSource dicatat agar
  // uji bisa memutusnya, dan sambungan baru ditolak selama "jaringan" putus.
  await page.addInitScript(() => {
    const Original = window.EventSource;
    const opened: EventSource[] = [];
    class Recorded extends Original {
      constructor(url: string | URL, init?: EventSourceInit) {
        super(url, init);
        opened.push(this);
      }
    }
    Object.assign(window, { EventSource: Recorded, __aliranUji: opened });
  });
  await loginAs(page, ACCOUNTS.l1);
  await page.goto(`/?customer=${data.tenantId}`);
  await expect(live(page)).toContainText('Langsung');
  const open = page.getByRole('region', { name: 'Angka utama' }).getByRole('link', { name: /^\d+ NPR berjalan$/ });
  const before = Number((await open.textContent())?.trim());

  await page.route('**/api/stream', (route) => route.abort('internetdisconnected'));
  await page.evaluate(() => {
    const streams = (window as unknown as { __aliranUji: EventSource[] }).__aliranUji;
    const current = streams[streams.length - 1];
    current?.close();
    current?.dispatchEvent(new Event('error'));
  });
  await expect(live(page)).toContainText('Terputus');
  await expect(live(page)).toContainText(/menyambung ulang · data per \d\d:\d\d:\d\d WIB/);
  await newTicket(browser); // perubahan selama terputus
  await page.waitForTimeout(2_500); // percobaan sambung ulang yang ditolak
  await expect(live(page)).toContainText('Terputus');
  await expect(open).toHaveText(String(before));

  await page.unroute('**/api/stream');
  await expect(live(page)).toContainText('Langsung', { timeout: 20_000 });
  await expect(open).toHaveText(String(before + 1));
});
