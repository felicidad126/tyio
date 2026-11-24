import { type Browser, expect, type Page, test } from '@playwright/test';
import writeXlsxFile from 'write-excel-file/node';
import { ACCOUNTS, loginAs } from './accounts';

// Peta remote (langkah 2.3, T140–T143). Data uji di customer seed Bank Andalas (BAD): berkas uji
// lain tidak menulis ke sana, jadi angka peta untuk BAD hanya berubah karena uji ini. Remote
// uji memakai kode unik per run dan disaring dengan kata kunci.
// - A dan B berimpit (±30 m) di Palu; A punya NPR berjalan. C ±10 km dari A, tanpa NPR.
// - D tanpa koordinat; E nonaktif tanpa koordinat (tidak ikut dihitung peta remote aktif).

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const run = Math.random().toString(36).slice(2, 7).toUpperCase();
const code = `E2E-MAP-${run}`;

interface Fixture {
  tenantId: string;
  category: string;
  system: string;
  remotes: Record<'A' | 'B' | 'C' | 'D' | 'E', { id: string; code: string; name: string }>;
}

interface MapAnswer {
  points: Array<[string, string, string, number, number, number]>;
  withoutCoordinates: number;
}

let fixture: Promise<Fixture> | null = null;

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

function setup(browser: Browser): Promise<Fixture> {
  fixture ??= asAdmin(browser, async (page) => {
    const tenants = (await (await page.request.get('/api/tenants')).json()) as Array<{ id: string; code: string }>;
    const tenantId = tenants.find((tenant) => tenant.code === 'BAD')?.id;
    if (!tenantId) throw new Error('Customer BAD dari seed tidak ada.');
    const pick = async (kind: string, name: string) => {
      const values = (await (await page.request.get(`/api/master/${kind}?tenantId=${tenantId}`)).json()) as Array<{
        id: string;
        name: string;
      }>;
      const id = values.find((value) => value.name === name)?.id;
      if (!id) throw new Error(`${kind} ${name} tidak ada.`);
      return id;
    };
    const category = await pick('kategori', 'Remote Down');
    const system = await pick('system', 'SNMP NOC');

    const rows: Array<[keyof Fixture['remotes'], number | null, number | null, string]> = [
      ['A', -0.9, 119.87, 'Aktif'],
      ['B', -0.9003, 119.8703, 'Aktif'],
      ['C', -0.95, 119.95, 'Aktif'],
      ['D', null, null, 'Aktif'],
      ['E', null, null, 'Nonaktif'],
    ];
    const file = await writeXlsxFile([
      ['Kode remote', 'Nama remote', 'Jarkom', 'Status', 'Zona waktu', 'Kota', 'Provinsi', 'Latitude', 'Longitude'],
      ...rows.map(([key, latitude, longitude, status]) => [
        `${code}-${key}`,
        `ATM Peta ${run} ${key}`,
        'VSAT',
        status,
        'WITA',
        'Palu',
        'Sulawesi Tengah',
        latitude,
        longitude,
      ]),
    ]).toBuffer();
    const imported = await page.request.post(`/api/remote-import?tenantId=${tenantId}&mode=save`, {
      headers: { 'Content-Type': XLSX },
      data: file,
    });
    expect((await imported.json()).created, await imported.text()).toBe(5);
    const remotes = {} as Fixture['remotes'];
    for (const [key] of rows) {
      const found = (await (await page.request.get(`/api/remotes?q=${code}-${key}`)).json()) as {
        items: Array<{ id: string; code: string; name: string }>;
      };
      const remote = found.items[0];
      if (!remote) throw new Error(`Remote ${key} tidak ditemukan.`);
      remotes[key] = remote;
    }
    const res = await page.request.post('/api/tickets', {
      data: { remoteId: remotes.A.id, categoryId: category, systemId: system, description: 'Ping gagal 100%' },
    });
    expect(res.status()).toBe(201);
    return { tenantId, category, system, remotes };
  });
  return fixture;
}

const summary = (page: Page) => page.getByRole('status').filter({ hasText: 'di peta' });
const markerLabels = (page: Page) =>
  page
    .getByRole('button', { name: /^(Kelompok|Buka remote)/ })
    .evaluateAll((items) => items.map((item) => item.getAttribute('aria-label') ?? '').join('\n'));
const point = (page: Page, remoteCode: string) =>
  page.getByRole('button', { name: new RegExp(`^Buka remote ${remoteCode} · `) });

async function openMap(page: Page, browser: Browser, query: string): Promise<Fixture> {
  const data = await setup(browser);
  await loginAs(page, ACCOUNTS.l1);
  await page.goto(`/remote?tampilan=peta&customer=${data.tenantId}${query}`);
  await expect(page.getByRole('region', { name: 'Peta remote' })).toBeVisible();
  return data;
}

test('titik merah berangka untuk NPR berjalan, titik berimpit dalam satu kelompok, remote tanpa koordinat disebut', async ({
  page,
  browser,
}) => {
  const data = await openMap(page, browser, `&q=${code}`);
  await expect(summary(page)).toHaveText('3 remote aktif di peta · 1 dengan NPR berjalan');
  await expect(point(page, data.remotes.C.code)).toHaveAccessibleName(/· tidak ada NPR berjalan$/);
  const cluster = page.getByRole('button', { name: /^Kelompok 2 remote, 1 dengan NPR berjalan/ });
  await expect(cluster).toHaveText('21');

  // A dan B tidak bisa dipisah dengan memperbesar: kelompok menampilkan daftarnya.
  await cluster.click();
  const popup = page.locator('.leaflet-popup');
  await expect(popup).toContainText('2 remote di titik yang sama');
  await expect(popup.getByRole('link')).toHaveCount(2);
  await expect(popup.getByRole('link', { name: `${data.remotes.A.code} · ${data.remotes.A.name} · 1 NPR berjalan` })).toBeVisible();
  await expect(popup.getByRole('link', { name: `${data.remotes.B.code} · ${data.remotes.B.name}`, exact: true })).toBeVisible();
  await popup.getByRole('link', { name: new RegExp(`^${data.remotes.A.code}`) }).click();
  await expect(page).toHaveURL(new RegExp(`/remote/${data.remotes.A.id}$`));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(data.remotes.A.name);

  // Remote tanpa koordinat: tautan ke daftar yang berisi tepat remote itu (T143).
  await page.goBack();
  const missing = page.getByRole('link', { name: 'Lihat 1 remote tanpa koordinat' });
  await expect(page.getByText('1 remote aktif belum punya koordinat, jadi tidak tampil di peta.')).toBeVisible();
  await missing.click();
  await expect(page).toHaveURL(/koordinat=tidak/);
  await expect(page.getByText('Hanya remote tanpa koordinat')).toBeVisible();
  await expect(page.getByRole('status')).toHaveText('1–1 dari 1 remote');
  await expect(page.getByRole('row').filter({ hasText: data.remotes.D.code })).toBeVisible();
});

test('klik titik atau Enter membuka halaman remote', async ({ page, browser }) => {
  const data = await openMap(page, browser, `&q=${code}`);
  await point(page, data.remotes.C.code).click();
  await expect(page).toHaveURL(new RegExp(`/remote/${data.remotes.C.id}$`));
  await page.goBack();
  await point(page, data.remotes.C.code).focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(new RegExp(`/remote/${data.remotes.C.id}$`));
});

test('angka di peta sama dengan daftar remote, dan kelompok memuat semua titik', async ({ page, browser }) => {
  const data = await openMap(page, browser, '');
  await expect(summary(page)).toContainText('remote aktif di peta');
  const answer = (await (await page.request.get(`/api/remote-map?tenantId=${data.tenantId}`)).json()) as MapAnswer;
  const total = async (query: string) =>
    ((await (await page.request.get(`/api/remotes?tenantId=${data.tenantId}&active=true&${query}`)).json()) as {
      total: number;
    }).total;
  const shown = await total('hasCoordinates=true');
  const problems = answer.points.filter((item) => item[5] > 0).length;
  expect(answer.points).toHaveLength(shown);
  expect(problems).toBeGreaterThanOrEqual(1);
  await expect(summary(page)).toHaveText(`${shown} remote aktif di peta · ${problems} dengan NPR berjalan`);
  const without = await total('hasCoordinates=false');
  await expect(page.getByRole('link', { name: `Lihat ${without} remote tanpa koordinat` })).toBeVisible();

  // Peta menampilkan seluruh remote: jumlah di semua kelompok + titik tunggal = jumlah remote,
  // dan angka merah kelompok + titik merah = remote dengan NPR berjalan.
  const labels = (await markerLabels(page)).split('\n');
  let count = 0;
  let red = 0;
  for (const label of labels) {
    const group = /^Kelompok (\d+) remote(?:, (\d+) dengan NPR berjalan)?/.exec(label);
    if (group) {
      count += Number(group[1]);
      red += Number(group[2] ?? 0);
    } else {
      count += 1;
      if (/· \d+ NPR berjalan$/.test(label)) red += 1;
    }
  }
  expect({ count, red }).toEqual({ count: shown, red: problems });

  // Klik kelompok memperbesar peta: penanda digambar ulang untuk perbesaran baru.
  const before = labels.join('\n');
  await page.getByRole('button', { name: /^Kelompok/ }).first().click();
  await expect.poll(() => markerLabels(page)).not.toBe(before);
});

test('titik berubah merah sendiri saat orang lain membuat NPR di remote itu', async ({ page, browser }) => {
  const data = await openMap(page, browser, `&q=${code}`);
  await expect(point(page, data.remotes.C.code)).toHaveAccessibleName(/tidak ada NPR berjalan$/);
  const before = Number((await summary(page).locator('strong').nth(1).textContent())?.trim());
  await page.evaluate(() => Object.assign(window, { __tandaUji: true }));

  await asAdmin(browser, async (admin) => {
    const res = await admin.request.post('/api/tickets', {
      data: { remoteId: data.remotes.C.id, categoryId: data.category, systemId: data.system, description: 'Ping gagal' },
    });
    expect(res.status()).toBe(201);
  });

  await expect(point(page, data.remotes.C.code)).toHaveAccessibleName(/· 1 NPR berjalan$/);
  await expect(point(page, data.remotes.C.code)).toHaveText('1');
  await expect(summary(page)).toHaveText(`3 remote aktif di peta · ${before + 1} dengan NPR berjalan`);
  expect(await page.evaluate(() => (window as unknown as { __tandaUji?: boolean }).__tandaUji)).toBe(true);
});

test('panel wilayah Overview membuka peta dengan customer yang sama', async ({ page, browser }) => {
  const data = await setup(browser);
  await loginAs(page, ACCOUNTS.l1);
  await page.goto(`/?customer=${data.tenantId}`);
  await page.getByRole('link', { name: 'Lihat peta lengkap di halaman Remote' }).click();
  await expect(page).toHaveURL(new RegExp(`/remote\\?.*tampilan=peta`));
  await expect(page).toHaveURL(new RegExp(`customer=${data.tenantId}`));
  await expect(page.getByLabel('Customer')).toHaveValue(data.tenantId);
  await expect(summary(page)).toContainText('remote aktif di peta');
  await page.getByRole('link', { name: 'Daftar', exact: true }).click();
  await expect(page).not.toHaveURL(/tampilan=/);
  await expect(page.getByRole('table')).toBeVisible();
});

test('ponsel 375 px: tanpa gulir mendatar, tombol peta 44 px', async ({ browser }) => {
  const data = await setup(browser);
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  try {
    await loginAs(page, ACCOUNTS.l1);
    await page.goto(`/remote?tampilan=peta&customer=${data.tenantId}`);
    await expect(summary(page)).toContainText('remote aktif di peta');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
    for (const control of [
      page.getByRole('button', { name: 'Zoom in' }),
      page.getByRole('link', { name: 'Peta', exact: true }),
      page.getByRole('link', { name: 'Daftar', exact: true }),
    ]) {
      const box = await control.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
    // Seluruh Indonesia muat di layar sempit: semua remote BAD ada di kelompok/titik yang tampil.
    const answer = (await (await page.request.get(`/api/remote-map?tenantId=${data.tenantId}`)).json()) as MapAnswer;
    const labels = (await markerLabels(page)).split('\n');
    const count = labels.reduce((sum, label) => sum + Number(/^Kelompok (\d+)/.exec(label)?.[1] ?? 1), 0);
    expect(count).toBe(answer.points.length);
  } finally {
    await context.close();
  }
});

test('5.000 remote: peta tampil cepat dan hanya menggambar kelompok', async ({ page, browser }) => {
  const data = await setup(browser);
  // Jawaban peta diganti 5.000 titik buatan yang tersebar di Indonesia (acak-tetap).
  let seed = 7;
  const random = () => {
    seed = (seed * 16_807) % 2_147_483_647;
    return seed / 2_147_483_647;
  };
  const points = Array.from({ length: 5_000 }, (_, i) => [
    `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    `SIM-${String(i).padStart(4, '0')}`,
    `ATM Simulasi ${i}`,
    -8 + random() * 11,
    96 + random() * 44,
    i % 25 === 0 ? 1 + (i % 3) : 0,
  ]);
  await page.route('**/api/remote-map?**', (route) =>
    route.fulfill({ json: { points, withoutCoordinates: 37 }, headers: { 'Cache-Control': 'no-store' } }),
  );
  await page.addInitScript(() => {
    const tasks: number[] = [];
    new PerformanceObserver((list) => tasks.push(...list.getEntries().map((entry) => entry.duration))).observe({
      type: 'longtask',
      buffered: true,
    });
    Object.assign(window, { __tugasPanjang: tasks });
  });
  await loginAs(page, ACCOUNTS.l1);
  const started = Date.now();
  await page.goto(`/remote?tampilan=peta&customer=${data.tenantId}`);
  await expect(summary(page)).toHaveText('5.000 remote aktif di peta · 200 dengan NPR berjalan');
  await expect(page.getByRole('button', { name: /^Kelompok/ }).first()).toBeVisible();
  const elapsed = Date.now() - started;
  const drawn = await page.getByRole('button', { name: /^(Kelompok|Buka remote)/ }).count();
  const shown = await markerLabels(page);
  const longest = await page.evaluate(() => Math.max(0, ...(window as unknown as { __tugasPanjang: number[] }).__tugasPanjang));
  console.log(`5.000 titik: tampil ${elapsed} ms, ${drawn} penanda, tugas terpanjang ${Math.round(longest)} ms`);
  expect(elapsed).toBeLessThan(5_000);
  expect(drawn).toBeLessThan(150);
  expect(longest).toBeLessThan(500);

  // Perbesar dua kali: penanda digambar ulang dengan cepat.
  const zoomStart = Date.now();
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await expect.poll(() => markerLabels(page)).not.toBe(shown);
  expect(Date.now() - zoomStart).toBeLessThan(2_000);
});
