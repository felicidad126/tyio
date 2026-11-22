import { type Browser, expect, type Page, test } from '@playwright/test';
import writeXlsxFile from 'write-excel-file/node';
import { ACCOUNTS, loginAs } from './accounts';

// TT ke SD (langkah 1.5b): buat TT dari NPR (kontak terisi dari remote, T92), status NPR tetap
// (T90), TT di linimasa NPR, salin ringkasan tercatat (K25), daftar TT aktif, pencarian global.
// Setiap uji memakai remote dan NPR baru lewat API.

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const TT_BNA = /^TT\/VSAT\/BNA\/\d{4}\/(0[1-9]|1[0-2])\/\d{4,}$/;
const run = Math.random().toString(36).slice(2, 7).toUpperCase();

interface Created {
  id: string;
  number: string;
  code: string;
  name: string;
}

async function newTicket(browser: Browser, suffix: string): Promise<Created> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await loginAs(page, ACCOUNTS.admin);
  const tenants = (await (await page.request.get('/api/tenants')).json()) as Array<{ id: string; code: string }>;
  const bna = tenants.find((tenant) => tenant.code === 'BNA');
  if (!bna) throw new Error('Customer BNA dari seed tidak ada.');
  const code = `E2E-TT-${run}-${suffix}`;
  const name = `ATM Uji TT ${run} ${suffix}`;
  const file = await writeXlsxFile([
    ['Kode remote', 'Nama remote', 'Jarkom', 'Zona waktu', 'Alamat', 'Kota', 'Kontak 1 nama', 'Kontak 1 jabatan', 'Kontak 1 telepon'],
    [code, name, 'VSAT', 'WITA', 'Jl. Uji No. 7', 'Kendari', 'Rina', 'Kepala Unit', '0811-1234-567'],
  ]).toBuffer();
  const imported = await page.request.post(`/api/remote-import?tenantId=${bna.id}&mode=save`, {
    headers: { 'Content-Type': XLSX },
    data: file,
  });
  expect((await imported.json()).created).toBe(1);
  const found = (await (await page.request.get(`/api/remotes?q=${code}`)).json()) as { items: Array<{ id: string }> };
  const pick = async (kind: string, value: string) => {
    const values = (await (await page.request.get(`/api/master/${kind}?tenantId=${bna.id}`)).json()) as Array<{
      id: string;
      name: string;
    }>;
    return values.find((item) => item.name === value)?.id;
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
  const ticket = (await created.json()) as { id: string; number: string };
  await context.close();
  return { id: ticket.id, number: ticket.number, code, name };
}

async function createTt(page: Page, problem: string): Promise<string> {
  await page.getByRole('button', { name: 'Buat TT ke SD' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Problem jarkom').fill(problem);
  await dialog.getByRole('button', { name: 'Simpan TT' }).click();
  await expect(dialog).toBeHidden();
  const card = page.getByRole('region', { name: /^TT ke SD/ }).getByRole('article').filter({ hasText: problem });
  const number = (await card.getByRole('heading').textContent())?.trim() ?? '';
  expect(number).toMatch(TT_BNA);
  return number;
}

test('L1 membuat TT dari NPR: kontak dari remote, status NPR tetap, TT di linimasa', async ({ page, browser }) => {
  const ticket = await newTicket(browser, 'A');
  await loginAs(page, ACCOUNTS.l1);
  await page.goto(`/tiket/${ticket.id}`);
  await expect(page.locator('.page-header .status-pill')).toHaveText('Terbuka');

  const opener = page.getByRole('button', { name: 'Buat TT ke SD' });
  await opener.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Buat TT ke SD' })).toBeVisible();
  await expect(dialog.getByLabel('Problem jarkom')).toBeFocused();
  await expect(dialog.getByLabel('Kontak di lokasi')).toHaveValue('Rina, Kepala Unit · 0811-1234-567');
  await dialog.getByRole('button', { name: 'Simpan TT' }).click();
  await expect(dialog.getByText('Problem jarkom wajib diisi.')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();

  const number = await createTt(page, 'Modem VSAT tidak sinkron, cek BUC/LNB');
  await expect(page.getByRole('status').filter({ hasText: `${number} tersimpan.` })).toBeFocused();
  await expect(page.locator('.page-header .status-pill')).toHaveText('Terbuka');
  const card = page.getByRole('region', { name: /^TT ke SD/ }).getByRole('article');
  await expect(card).toContainText('Menunggu SD');
  await expect(card).toContainText('Rina, Kepala Unit · 0811-1234-567');
  await expect(card).toContainText('Belum, ringkasan belum disalin');
  const entry = page.getByRole('region', { name: /^Linimasa/ }).getByRole('listitem').filter({ hasText: 'TT dibuat' }).first();
  await expect(entry).toContainText(`${number} dibuat untuk SD.`);

  // NPR yang sama boleh punya TT kedua; nomornya lanjut.
  const second = await createTt(page, 'Kabel IFL terkelupas');
  expect(Number(second.split('/')[5])).toBe(Number(number.split('/')[5]) + 1);
  await expect(page.getByRole('heading', { name: 'TT ke SD (2)' })).toBeVisible();
});

test('salin ringkasan TT: teks siap tempel di clipboard dan tercatat di linimasa (K25)', async ({ page, browser, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const ticket = await newTicket(browser, 'B');
  await loginAs(page, ACCOUNTS.l1);
  await page.goto(`/tiket/${ticket.id}`);
  const number = await createTt(page, 'Modem mati total');
  const card = page.getByRole('region', { name: /^TT ke SD/ }).getByRole('article');

  await card.getByRole('button', { name: 'Salin ringkasan TT' }).click();
  await expect(card.getByRole('button', { name: 'Ringkasan disalin' })).toBeVisible();
  await expect(card).toContainText('Tercatat di linimasa. Tempel ke chat SD.');
  const text = await page.evaluate(() => navigator.clipboard.readText());
  expect(text.split('\n')).toEqual([
    `${number} (${ticket.number})`,
    `Remote: ${ticket.name}, Bank Nusa (${ticket.code})`,
    'Lokasi: Jl. Uji No. 7, Kendari · WITA',
    'Problem: Modem mati total',
    'Kontak: Rina, Kepala Unit · 0811-1234-567',
  ]);
  await expect(card).toContainText(/Ringkasan disalin \d+ \w+ \d{4} \d{2}:\d{2} WITA/);
  await expect(
    page.getByRole('region', { name: /^Linimasa/ }).getByRole('listitem').filter({ hasText: `Ringkasan TT disalin untuk SD: ${number}.` }),
  ).toHaveCount(1);

  await card.getByRole('button', { name: 'Ringkasan disalin' }).click();
  await expect(card).toContainText('Disalin 2 kali');
});

test('clipboard ditolak peramban: ringkasan tampil untuk disalin manual dan tidak dicatat', async ({ page, browser }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: () => Promise.reject(new Error('ditolak')) },
      configurable: true,
    });
  });
  const ticket = await newTicket(browser, 'C');
  await loginAs(page, ACCOUNTS.l1);
  await page.goto(`/tiket/${ticket.id}`);
  const number = await createTt(page, 'Cek listrik panel');
  const card = page.getByRole('region', { name: /^TT ke SD/ }).getByRole('article');
  await card.getByRole('button', { name: 'Salin ringkasan TT' }).click();
  const manual = card.getByLabel(/Salin teks ini/);
  await expect(manual).toBeFocused();
  await expect(manual).toHaveValue(new RegExp(`^${number.replace(/\//g, '\\/')} \\(`));
  await expect(card).toContainText('Belum, ringkasan belum disalin');
});

test('daftar TT aktif terpisah dari antrean NPR; pencarian global menemukan nomor TT', async ({ page, browser }) => {
  const ticket = await newTicket(browser, 'D');
  await loginAs(page, ACCOUNTS.l1);
  await page.goto(`/tiket/${ticket.id}`);
  const number = await createTt(page, 'Perlu kunjungan teknisi');

  await page.goto('/tiket');
  await page.getByRole('navigation', { name: 'Daftar tiket' }).getByRole('link', { name: 'TT aktif' }).click();
  await expect(page).toHaveURL(/daftar=tt/);
  await page.getByLabel('Cari TT').fill(ticket.code);
  const row = page.getByRole('row').filter({ hasText: number });
  await expect(row).toContainText(ticket.number);
  await expect(row).toContainText('Menunggu SD');
  await expect(row).toContainText('Belum disalin');
  await row.getByRole('link', { name: number }).click();
  await expect(page).toHaveURL(new RegExp(`/tiket/${ticket.id}#tt-`));
  await expect(page.getByRole('article').filter({ hasText: number })).toBeFocused();

  const box = page.getByRole('combobox', { name: 'Cari di seluruh portal' });
  await box.fill(number);
  const group = page.getByRole('listbox', { name: 'Hasil pencarian' }).getByRole('group', { name: 'TT' });
  await expect(group.getByRole('option')).toContainText(number);
  await page.goto('/remote');
  await box.fill(number);
  await expect(group.getByRole('option')).toHaveCount(1);
  await box.press('ArrowDown');
  await box.press('ArrowDown');
  await box.press('Enter');
  await expect(page).toHaveURL(new RegExp(`/tiket/${ticket.id}#tt-`));
});

test('ponsel 375px: halaman NPR dengan TT dan daftar TT tanpa geser mendatar', async ({ page, browser }) => {
  const ticket = await newTicket(browser, 'E');
  await page.setViewportSize({ width: 375, height: 800 });
  await loginAs(page, ACCOUNTS.l1);
  await page.goto(`/tiket/${ticket.id}`);
  await createTt(page, 'Modem tidak menyala sejak pagi, adaptor kemungkinan rusak');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  const copy = page.getByRole('button', { name: 'Salin ringkasan TT' });
  expect((await copy.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  await page.goto(`/tiket?daftar=tt&tq=${ticket.code}`);
  await expect(page.getByRole('row').filter({ hasText: ticket.number })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});
