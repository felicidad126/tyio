import { type Browser, expect, type Locator, type Page, test } from '@playwright/test';
import writeXlsxFile from 'write-excel-file/node';
import { ACCOUNTS, loginAs } from './accounts';

// Overview (langkah 2.1): setiap angka membuka daftar dengan jumlah yang sama persis
// (T108–T114). Berkas uji lain menulis NPR paralel ke Bank Nusa, jadi uji ini memakai
// customer seed BPD Timur (BPT) dengan saringan customer, dan menambah remote baru (kode unik
// per run) beserta NPR-nya. Angka BPT bertambah setiap run, jadi uji membandingkan angka yang
// tampil dengan jumlah di antrean, bukan dengan nilai tetap.

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const run = Math.random().toString(36).slice(2, 7).toUpperCase();

interface Fixture {
  tenantId: string;
  name: string;
  remotes: Record<'r1' | 'r2' | 'r3', { id: string; name: string }>;
}

let fixture: Promise<Fixture> | null = null;

/**
 * Tiga remote baru di BPT (Sulawesi Selatan, Jawa Barat, Papua) dan lima NPR: R1 Terbuka,
 * R1 Pending · Customer (Corrective), R2 Eskalasi · L2 (+ TT), R3 Ditutup hari ini, R1 Terbuka
 * lagi. Dibuat sekali per proses uji.
 */
function setup(browser: Browser): Promise<Fixture> {
  fixture ??= (async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await loginAs(page, ACCOUNTS.admin);
    const post = async (url: string, data: unknown, status = 201) => {
      const res = await page.request.post(url, { data });
      expect(res.status(), `${url}: ${await res.text()}`).toBe(status);
      return (await res.json()) as { id: string };
    };
    const tenants = (await (await page.request.get('/api/tenants')).json()) as Array<{ id: string; code: string; name: string }>;
    const bpt = tenants.find((tenant) => tenant.code === 'BPT');
    if (!bpt) throw new Error('Customer BPT dari seed tidak ada.');
    const tenantId = bpt.id;
    const name = bpt.name;
    const pick = async (kind: string, value: string) => {
      const values = (await (await page.request.get(`/api/master/${kind}?tenantId=${tenantId}`)).json()) as Array<{
        id: string;
        name: string;
      }>;
      const found = values.find((item) => item.name === value);
      if (!found) throw new Error(`${kind} ${value} dari seed tidak ada.`);
      return found.id;
    };
    const rd = await pick('kategori', 'Remote Down');
    const cm = await pick('kategori', 'Corrective');
    const system = await pick('system', 'SNMP NOC');
    const code = `E2E-OVW-${run}`;

    const rows: Array<[string, string, string, string]> = [
      ['r1', 'Sulawesi Selatan', 'WITA', 'Makassar'],
      ['r2', 'Jawa Barat', 'WIB', 'Bandung'],
      ['r3', 'Papua', 'WIT', 'Jayapura'],
    ];
    const file = await writeXlsxFile([
      ['Kode remote', 'Nama remote', 'Jarkom', 'Zona waktu', 'Kota', 'Provinsi'],
      ...rows.map(([key, province, zone, city]) => [`${code}-${key}`, `ATM Overview ${run} ${key}`, 'VSAT', zone, city, province]),
    ]).toBuffer();
    const imported = await page.request.post(`/api/remote-import?tenantId=${tenantId}&mode=save`, {
      headers: { 'Content-Type': XLSX },
      data: file,
    });
    expect((await imported.json()).created).toBe(3);
    const remotes = {} as Fixture['remotes'];
    for (const [key] of rows) {
      const found = (await (await page.request.get(`/api/remotes?q=${code}-${key}`)).json()) as {
        items: Array<{ id: string; name: string }>;
      };
      const remote = found.items[0];
      if (!remote) throw new Error(`Remote ${key} tidak ditemukan.`);
      remotes[key as keyof Fixture['remotes']] = remote;
    }

    const npr = (remoteId: string, categoryId: string) =>
      post('/api/tickets', { remoteId, categoryId, systemId: system, description: 'Ping gagal', acknowledgeOpenTickets: true });
    const move = (id: string, from: string, to: string, extra: Record<string, string> = {}) =>
      post(`/api/tickets/${id}/actions`, { kind: 'catatan', note: 'Pindah status', statusFrom: from, statusTo: to, ...extra });

    await npr(remotes.r1.id, rd);
    const pending = await npr(remotes.r1.id, cm);
    await move(pending.id, 'terbuka', 'pending_customer', { pendingReason: 'Menunggu PIC' });
    const escalated = await npr(remotes.r2.id, rd);
    await move(escalated.id, 'terbuka', 'eskalasi_l2');
    await post(`/api/tickets/${escalated.id}/trouble-tickets`, { problem: 'Modem VSAT mati' });
    const closed = await npr(remotes.r3.id, rd);
    await move(closed.id, 'terbuka', 'pulih');
    await post(`/api/tickets/${closed.id}/close`, { cause: 'listrik', resolution: 'Listrik kembali menyala' });
    await npr(remotes.r1.id, rd);
    await context.close();
    return { tenantId, name, remotes };
  })();
  return fixture;
}

async function openOverview(page: Page, browser: Browser, query = ''): Promise<Fixture> {
  const data = await setup(browser);
  await loginAs(page, ACCOUNTS.l2);
  await page.goto(`/?customer=${data.tenantId}${query}`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Overview');
  await expect(page.getByRole('region', { name: 'Angka utama' })).toBeVisible();
  return data;
}

/** Antrean yang terbuka berisi tepat `expected` NPR. */
async function expectQueueTotal(page: Page, expected: number): Promise<void> {
  await expect(page).toHaveURL(/\/tiket\?/);
  if (expected === 0) await expect(page.getByText('Tidak ada NPR yang cocok')).toBeVisible();
  else await expect(page.getByText(new RegExp(`dari ${expected} NPR$`))).toBeVisible();
}

/** Angka pertama di teks tautan. */
async function countOf(link: Locator): Promise<number> {
  const text = (await link.textContent()) ?? '';
  const match = /\d+/.exec(text.replace(/\./g, ''));
  if (!match) throw new Error(`Tautan tanpa angka: ${text}`);
  return Number(match[0]);
}

/**
 * Klik angka di Overview, pastikan antrean berisi jumlah yang sama dengan angka itu, lalu
 * kembali. `atLeast` = NPR yang dibuat uji ini, agar angka nol karena data hilang ketahuan.
 */
async function follow(page: Page, link: Locator, atLeast: number): Promise<number> {
  const count = await countOf(link);
  expect(count).toBeGreaterThanOrEqual(atLeast);
  await link.click();
  await expectQueueTotal(page, count);
  await page.goBack();
  await expect(page.getByRole('region', { name: 'Angka utama' })).toBeVisible();
  return count;
}

const list = (page: Page, name: string) => page.getByRole('list', { name, exact: true });

test('setiap angka di Overview membuka antrean dengan jumlah yang sama persis', async ({ page, browser }) => {
  await openOverview(page, browser);
  const stats = page.getByRole('region', { name: 'Angka utama' });

  await follow(page, stats.getByRole('link', { name: /^\d+ NPR berjalan$/ }), 4);
  await follow(page, stats.getByRole('link', { name: /^\d+ pending$/ }), 1);
  await follow(page, stats.getByRole('link', { name: /^\d+ eskalasi$/ }), 1);
  await follow(page, stats.getByRole('link', { name: /^\d+ pulih · siap ditutup$/ }), 0);
  await follow(page, stats.getByRole('link', { name: /^\d+ NPR baru hari ini$/ }), 5);
  await follow(page, stats.getByRole('link', { name: /^\d+ NPR ditutup hari ini$/ }), 1);

  // Wilayah dari provinsi remote; label saringan wilayah tampil di antrean.
  const sulawesi = list(page, 'NPR berjalan per wilayah').getByRole('link', { name: /NPR berjalan di wilayah Sulawesi$/ });
  await follow(page, sulawesi, 3);
  await follow(page, list(page, 'NPR berjalan per wilayah').getByRole('link', { name: /wilayah Jawa$/ }), 1);
  await sulawesi.click();
  await expect(page.getByRole('list', { name: 'Saringan lain:' })).toContainText('Wilayah: Sulawesi');
  await page.goBack();

  await follow(page, list(page, 'NPR berjalan per kategori').getByRole('link', { name: /berkategori Remote Down$/ }), 3);
  await follow(page, list(page, 'NPR berjalan per kategori').getByRole('link', { name: /berkategori Corrective$/ }), 1);
  await follow(page, list(page, 'NPR berjalan per status').getByRole('link', { name: /NPR Pending · Customer$/ }), 1);
  await follow(page, list(page, 'NPR berjalan per status').getByRole('link', { name: /NPR Eskalasi · L2$/ }), 1);

  // Remote paling sering bermasalah: jumlah NPR dalam periode, termasuk yang Ditutup.
  const frequent = list(page, 'Remote paling sering bermasalah').getByRole('link', { name: /NPR di .* dalam 14 hari$/ });
  await expect(frequent).not.toHaveCount(0);
  await follow(page, frequent.first(), 1);
  await follow(page, frequent.last(), 1);

  // Tabel tren: hari ini (total dan Corrective).
  await page.getByRole('button', { name: 'Lihat sebagai tabel' }).click();
  const today = () => page.getByRole('row').filter({ hasText: '(hari ini)' });
  await follow(page, today().getByRole('link', { name: /NPR baru,/ }), 5);
  await page.getByRole('button', { name: 'Lihat sebagai tabel' }).click();
  await follow(page, today().getByRole('link', { name: /NPR Corrective,/ }), 1);

  // TT aktif membuka daftar TT customer itu dengan jumlah yang sama.
  const tt = stats.getByRole('link', { name: /^\d+ TT aktif$/ });
  const ttCount = await countOf(tt);
  expect(ttCount).toBeGreaterThanOrEqual(1);
  await tt.click();
  await expect(page).toHaveURL(/daftar=tt/);
  await expect(page.getByText(new RegExp(`dari ${ttCount} TT aktif$`))).toBeVisible();
});

test('saringan dari Overview tampil di antrean dan bisa dihapus satu per satu', async ({ page, browser }) => {
  await openOverview(page, browser);
  const link = list(page, 'Remote paling sering bermasalah').getByRole('link', { name: /NPR di .* dalam 14 hari$/ }).first();
  const count = await countOf(link);
  await link.click();
  await expectQueueTotal(page, count);
  const chips = page.getByRole('list', { name: 'Saringan lain:' });
  await expect(chips.getByRole('listitem')).toHaveText([/^Remote: .+ · .+/, /^Dibuat .* \(WIB\)/]);
  await expect(page.getByLabel('Status')).toHaveValue('semua');

  await chips.getByRole('button', { name: /^Hapus saringan Dibuat/ }).click();
  await expect(page).not.toHaveURL(/dibuatDari/);
  await expect(chips.getByRole('listitem')).toHaveCount(1);
  await chips.getByRole('button', { name: /^Hapus saringan Remote/ }).click();
  await expect(page).not.toHaveURL(/remote=/);
  await expect(chips).toHaveCount(0);
});

test('periode 7/14/30 hari tersimpan di alamat; tren menampilkan sebanyak itu hari', async ({ page, browser }) => {
  await openOverview(page, browser);
  const periods = page.getByRole('navigation', { name: 'Periode' });
  await expect(periods.getByRole('link', { name: '14 hari' })).toHaveAttribute('aria-current', 'page');
  await page.getByRole('button', { name: 'Lihat sebagai tabel' }).click();
  await expect(page.locator('.daily__table tbody tr')).toHaveCount(14);

  await periods.getByRole('link', { name: '30 hari' }).click();
  await expect(page).toHaveURL(/periode=30/);
  await expect(page.getByText('Jumlah NPR per remote · 30 hari terakhir')).toBeVisible();
  // Tampilan tabel tetap terbuka saat periode diganti.
  await expect(page.getByRole('button', { name: 'Lihat sebagai grafik' })).toBeVisible();
  await expect(page.locator('.daily__table tbody tr')).toHaveCount(30);

  await periods.getByRole('link', { name: '7 hari' }).click();
  await expect(page).toHaveURL(/periode=7/);
  await page.reload();
  await expect(periods.getByRole('link', { name: '7 hari' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByText('Jumlah NPR per remote · 7 hari terakhir')).toBeVisible();
});

test('grafik: legenda per kategori, segmen membuka antrean hari dan kategori itu', async ({ page, browser }) => {
  await openOverview(page, browser);
  // Warna mengikuti kategori: Remote Down, Corrective, Preventive di slot tetap (seperti mockup).
  await expect(page.getByRole('list', { name: 'Kategori', exact: true }).getByRole('listitem').first()).toHaveText(
    'Remote Down',
  );
  const lastDay = page.getByTestId('grafik-harian').locator('.daily__day').last();
  await lastDay.hover();
  const tip = lastDay.locator('.daily__tip');
  await expect(tip).toContainText('Total');
  const remoteDown = Number(/Remote Down(\d+)/.exec((await tip.textContent()) ?? '')?.[1]);
  expect(remoteDown).toBeGreaterThanOrEqual(4);
  // Segmen paling bawah = Remote Down.
  await lastDay.locator('a.daily__seg').first().click();
  await expectQueueTotal(page, remoteDown);
  await expect(page.getByRole('list', { name: 'Saringan lain:' })).toContainText('Kategori: Remote Down');
});

test('ponsel 375px dan tema gelap: tanpa geser mendatar, warna seri tema gelap', async ({ page, browser }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await openOverview(page, browser);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  const box = await page.getByRole('link', { name: /^\d+ pending$/ }).boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  await page.getByRole('button', { name: 'Lihat sebagai tabel' }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  // Aturan tema gelap di CSS komponen benar-benar berlaku (jebakan :global di 1.6).
  const series = await page
    .locator('.overview')
    .evaluate((element) => getComputedStyle(element).getPropertyValue('--series-1').trim());
  expect(series).toBe('#3987e5');
});
