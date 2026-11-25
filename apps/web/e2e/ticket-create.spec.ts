import { type APIRequestContext, type Browser, expect, type Page, test } from '@playwright/test';
import writeXlsxFile from 'write-excel-file/node';
import { ACCOUNTS, loginAs } from './accounts';

// Buat NPR (langkah 1.3): pilih remote → lokasi dan jaringan hanya-baca, nomor dibuat sistem,
// peringatan bila remote masih punya NPR terbuka. Setiap run mengimpor remote uji sendiri
// (kode unik), agar peringatan tidak bergantung pada data run sebelumnya.

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const NPR_BNA = /^NPR\/VSAT\/BNA\/\d{4}\/(0[1-9]|1[0-2])\/\d{4,}$/;
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const run = Math.random().toString(36).slice(2, 7).toUpperCase();

interface TestRemote {
  id: string;
  code: string;
  name: string;
}

/** Remote uji Bank Nusa (WITA, VSAT) yang diimpor admin lewat API, satu per uji. */
async function importRemote(browser: Browser, suffix: string): Promise<TestRemote> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await loginAs(page, ACCOUNTS.admin);
  const tenants = (await (await page.request.get('/api/tenants')).json()) as Array<{ id: string; code: string }>;
  const bna = tenants.find((tenant) => tenant.code === 'BNA');
  if (!bna) throw new Error('Customer BNA dari seed tidak ada.');
  const code = `E2E-NPR-${run}-${suffix}`;
  const name = `ATM Uji NPR ${run} ${suffix}`;
  const file = await writeXlsxFile([
    ['Kode remote', 'Nama remote', 'Jarkom', 'Zona waktu', 'Alamat', 'Kota', 'IP SNMP', 'Kontak 1 nama', 'Kontak 1 telepon'],
    [code, name, 'VSAT', 'WITA', 'Jl. Uji No. 1', 'Kendari', '10.99.1.22', 'Rina', '0811-1234-567'],
  ]).toBuffer();
  const imported = await page.request.post(`/api/remote-import?tenantId=${bna.id}&mode=save`, {
    headers: { 'Content-Type': XLSX },
    data: file,
  });
  expect((await imported.json()).created).toBe(1);
  const found = (await (await page.request.get(`/api/remotes?q=${code}`)).json()) as { items: Array<{ id: string }> };
  await context.close();
  const id = found.items[0]?.id;
  if (!id) throw new Error(`Remote ${code} tidak ditemukan sesudah impor.`);
  return { id, code, name };
}

/** NPR yang dibuat lewat API, seperti oleh operator lain. */
async function createTicketViaApi(request: APIRequestContext, remote: TestRemote, description: string): Promise<string> {
  const detail = (await (await request.get(`/api/remotes/${remote.id}`)).json()) as { tenantId: string };
  const pick = async (kind: string, name: string) => {
    const values = (await (await request.get(`/api/master/${kind}?tenantId=${detail.tenantId}`)).json()) as Array<{
      id: string;
      name: string;
    }>;
    return values.find((value) => value.name === name)?.id;
  };
  const res = await request.post('/api/tickets', {
    data: {
      remoteId: remote.id,
      categoryId: await pick('kategori', 'Remote Down'),
      systemId: await pick('system', 'SNMP NOC'),
      description,
      acknowledgeOpenTickets: true,
    },
  });
  expect(res.status()).toBe(201);
  return ((await res.json()) as { number: string }).number;
}

async function fillIncident(page: Page, description: string): Promise<void> {
  await page.getByLabel('Kategori').selectOption({ label: 'Remote Down' });
  await page.getByLabel('System').selectOption({ label: 'SNMP NOC' });
  await page.getByLabel('Keterangan').fill(description);
}

const submit = (page: Page) => page.getByRole('button', { name: 'Buat NPR' });

test.describe('buat NPR', () => {
  test('L1 memilih remote dari tombol Buat NPR; data remote hanya-baca; nomor dibuat sistem', async ({
    page,
    browser,
  }) => {
    const remote = await importRemote(browser, 'A');
    await loginAs(page, ACCOUNTS.l1);

    await page.getByRole('banner').getByRole('link', { name: 'Buat NPR' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Buat NPR');
    // Menu Tiket diikuti angka NPR berjalan (T130).
    await expect(page.getByRole('navigation', { name: 'Menu utama' }).locator('[aria-current="page"]')).toHaveText(
      /^Tiket\d*$/,
    );

    await page.getByLabel('Cari remote').fill(remote.code.toLowerCase());
    await page.getByRole('list', { name: 'Hasil pencarian remote' }).getByRole('button', { name: remote.code }).click();

    const remoteCard = page.getByRole('region', { name: new RegExp(remote.name) });
    await expect(remoteCard.getByRole('region', { name: 'Lokasi', exact: true })).toContainText('Jl. Uji No. 1');
    await expect(remoteCard.getByRole('region', { name: 'Lokasi', exact: true })).toContainText('WITA (UTC+8)');
    await expect(remoteCard.getByRole('region', { name: 'Jaringan' })).toContainText('VSAT (VSAT)');
    await expect(remoteCard.getByRole('region', { name: 'Jaringan' })).toContainText('10.99.1.22');
    await expect(remoteCard.getByRole('region', { name: 'Kontak di lokasi' })).toContainText('Rina');
    // Hanya-baca: tidak ada isian untuk lokasi dan jaringan.
    await expect(remoteCard.locator('input, select, textarea')).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`/tiket/baru\\?remote=${remote.id}$`));

    await expect(page.getByLabel('Mulai gangguan (WITA)')).toHaveValue(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    await expect(page.getByRole('region', { name: /NPR terbuka/ })).toHaveCount(0);
    await fillIncident(page, `Ping gagal 100% (uji ${run})`);
    await submit(page).click();

    await expect(page).toHaveURL(new RegExp(`/tiket/${UUID}\\?baru=1$`));
    const heading = page.getByRole('heading', { level: 1 });
    await expect(heading).toHaveText(NPR_BNA);
    const number = (await heading.textContent()) ?? '';
    await expect(page.getByRole('status').filter({ hasText: 'tersimpan' })).toHaveText(
      `NPR tersimpan dengan nomor ${number}.`,
    );
    await expect(page.locator('.page-header .status-pill')).toHaveText('Terbuka');
    const incident = page.getByRole('region', { name: 'Gangguan' });
    await expect(incident).toContainText('Remote Down / SNMP NOC');
    await expect(incident).toContainText(/\d{2}:\d{2} WITA · Dewi A\./);
    await expect(incident).toContainText(`Ping gagal 100% (uji ${run})`);
    await expect(page).toHaveTitle(`${number} · Network Problem Report`);

    // Halaman remote menampilkan NPR terbuka itu.
    await incident.getByRole('link', { name: remote.name }).click();
    await expect(page.getByRole('region', { name: 'NPR terbuka' }).getByRole('link', { name: number })).toBeVisible();
  });

  test('remote dengan NPR terbuka memberi peringatan; NPR baru hanya setelah konfirmasi', async ({ page, browser }) => {
    const remote = await importRemote(browser, 'B');
    await loginAs(page, ACCOUNTS.l1);
    const first = await createTicketViaApi(page.request, remote, 'Listrik padam di lokasi');

    await page.goto(`/remote/${remote.id}`);
    const openCard = page.getByRole('region', { name: 'NPR terbuka' });
    await expect(openCard.getByRole('link', { name: first })).toBeVisible();
    await openCard.getByRole('link', { name: 'Buat NPR untuk remote ini' }).click();

    const warning = page.getByRole('region', { name: 'Remote ini masih punya 1 NPR terbuka' });
    await expect(warning).toContainText(first);
    await expect(warning).toContainText('Listrik padam di lokasi');
    await expect(warning).toContainText('Dewi A.');
    await fillIncident(page, 'Modem tidak sinkron, berbeda dari listrik padam');

    // Tanpa konfirmasi, formulir tidak terkirim (kotak centang wajib).
    await submit(page).click();
    await expect(page).toHaveURL(/\/tiket\/baru/);
    await page.getByLabel('Gangguan ini berbeda dari NPR terbuka di atas; tetap buat NPR baru.').check();
    await submit(page).click();

    await expect(page).toHaveURL(new RegExp(`/tiket/${UUID}\\?baru=1$`));
    const second = (await page.getByRole('heading', { level: 1 }).textContent()) ?? '';
    expect(second).toMatch(NPR_BNA);
    expect(second).not.toBe(first);
  });

  test('NPR dari operator lain saat formulir terbuka: peringatan dari server, belum ada yang tersimpan', async ({
    page,
    browser,
  }) => {
    const remote = await importRemote(browser, 'C');
    await loginAs(page, ACCOUNTS.l1, `/masuk?next=/tiket/baru?remote=${remote.id}`);
    await expect(page.getByRole('region', { name: new RegExp(remote.name) })).toBeVisible();
    await expect(page.getByRole('region', { name: /NPR terbuka/ })).toHaveCount(0);
    await fillIncident(page, 'Ping gagal dari NOC');

    const other = await createTicketViaApi(page.request, remote, 'Dibuat operator lain lebih dulu');
    await submit(page).click();

    const warning = page.getByRole('region', { name: 'Remote ini masih punya 1 NPR terbuka' });
    await expect(warning).toContainText(other);
    await expect(warning).toBeFocused();
    await expect(page).toHaveURL(/\/tiket\/baru/);
    const open = (await (await page.request.get(`/api/remotes/${remote.id}/open-tickets`)).json()) as unknown[];
    expect(open).toHaveLength(1);
    // Isian operator tidak hilang.
    await expect(page.getByLabel('Keterangan')).toHaveValue('Ping gagal dari NOC');

    await page.getByLabel('Gangguan ini berbeda dari NPR terbuka di atas; tetap buat NPR baru.').check();
    await submit(page).click();
    await expect(page).toHaveURL(new RegExp(`/tiket/${UUID}\\?baru=1$`));
  });

  test('NPR yang tidak ada atau milik customer lain menampilkan penjelasan', async ({ page }) => {
    await loginAs(page, ACCOUNTS.l1, '/masuk?next=/tiket/00000000-0000-4000-8000-000000000000');

    await expect(page.getByText('NPR tidak ditemukan.')).toBeVisible();
    await page.getByRole('link', { name: 'Kembali ke Tiket' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tiket');
  });

  test('ponsel 375px: tombol Buat NPR bisa diketuk; formulir dan halaman NPR tanpa geser mendatar', async ({
    page,
    browser,
  }) => {
    const remote = await importRemote(browser, 'D');
    await page.setViewportSize({ width: 375, height: 740 });
    await loginAs(page, ACCOUNTS.l1);

    const button = page.getByRole('banner').getByRole('link', { name: 'Buat NPR' });
    const box = await button.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
    await button.click();
    await page.getByLabel('Cari remote').fill(remote.code);
    await page.getByRole('button', { name: remote.code }).click();
    await expect(page.getByLabel('Kategori')).toBeVisible();

    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(await overflow()).toBeLessThanOrEqual(0);
    expect((await submit(page).boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);

    await fillIncident(page, 'Uji tampilan ponsel');
    await submit(page).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(NPR_BNA);
    expect(await overflow()).toBeLessThanOrEqual(0);
  });
});
