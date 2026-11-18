import { expect, type Page, test } from '@playwright/test';
import { expectNoPageOverflow, expectPath, signInAs } from './helpers';

// Gambar peta diganti petak kosong: uji tidak bergantung pada server peta di internet.
const BLANK_PNG = Buffer.from(
  '89504e470d0a1a0a0000000d4948445200000001000000010806000000' +
    '1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082',
  'hex',
);
const STATES = ['gangguan', 'pending', 'normal', 'nonaktif'] as const;

async function offlineTiles(page: Page): Promise<void> {
  // OpenStreetMap (dev) atau alamat .invalid (CI, lihat ci.yml).
  await page.route(/tile\.openstreetmap\.org|peta\.invalid/, (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: BLANK_PNG }),
  );
}

/** Jumlah remote yang tampil di peta: angka di kelompok ditambah titik tunggal. */
const shownOnMap = (page: Page) =>
  page.evaluate(() => {
    const clusters = [...document.querySelectorAll('.map-cluster')].reduce((sum, el) => sum + Number(el.textContent), 0);
    return clusters + document.querySelectorAll('[data-testid="peta-remote"] path.leaflet-interactive').length;
  });
const legendCount = async (page: Page, state: string) =>
  Number((await page.getByTestId(`peta-jumlah-${state}`).innerText()).replace(/\D/g, ''));
const mapCard = (page: Page) => page.locator('section[aria-labelledby="peta"]');

test.describe('peta remote', () => {
  test('jumlah di keterangan sama dengan data; semua remote tampil dalam kelompok; saringan kondisi', async ({ page }) => {
    await offlineTiles(page);
    await signInAs(page, 'helpdesk.contoh');
    await expect(page.locator('.map-cluster').first()).toBeVisible();
    await expect(mapCard(page)).toContainText('OpenStreetMap');

    await expect(async () => {
      const api = (await (await page.request.get('/api/map')).json()) as { remotes: Array<{ state: string }> };
      for (const state of STATES) {
        expect(await legendCount(page, state), state).toBe(api.remotes.filter((r) => r.state === state).length);
      }
      expect(await shownOnMap(page)).toBe(api.remotes.length);
    }).toPass({ timeout: 10_000 });

    const normal = await legendCount(page, 'normal');
    const before = await shownOnMap(page);
    await mapCard(page).getByRole('checkbox', { name: /^Normal/ }).uncheck();
    await expect.poll(() => shownOnMap(page)).toBe(before - normal);
    await mapCard(page).getByRole('checkbox', { name: /^Normal/ }).check();
    await expect.poll(() => shownOnMap(page)).toBe(before);
  });

  test('perbesar sampai titik tunggal, klik titik: info remote, lalu ke halaman remote', async ({ page }) => {
    await offlineTiles(page);
    await signInAs(page, 'helpdesk.contoh');
    const map = page.getByTestId('peta-remote');
    await expect(page.locator('.map-cluster').first()).toBeVisible();

    const dots = map.locator('path.leaflet-interactive');
    for (let i = 0; i < 8 && (await dots.count()) === 0; i++) {
      await map.locator('.map-cluster').first().click();
      await page.waitForTimeout(600);
    }
    await dots.first().click({ force: true });
    const popup = page.locator('.leaflet-popup-content');
    await expect(popup).toContainText(/[A-Z]{3}-\d{3}/);
    await popup.getByRole('link', { name: 'Buka remote' }).click();
    await expect(page).toHaveURL(/\/remote\/[0-9a-f-]{36}$/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('NPR baru di remote normal: jumlah Gangguan bertambah tanpa muat ulang (kondisi terkini saja)', async ({ page }) => {
    await offlineTiles(page);
    await signInAs(page, 'helpdesk.contoh');
    await expect(page.getByTestId('peta-jumlah-gangguan')).toBeVisible();
    const api = (await (await page.request.get('/api/map')).json()) as {
      remotes: Array<{ id: string; siteId: string; state: string }>;
    };
    const target = api.remotes.find((r) => r.state === 'normal');
    test.skip(!target, 'tidak ada remote normal di data contoh');
    const before = await legendCount(page, 'gangguan');

    const categories = (await (await page.request.get('/api/master/kategori')).json()).items as Array<{ id: string }>;
    const statesCall = page.waitForResponse((res) => res.url().endsWith('/api/map/states'));
    const res = await page.request.post('/api/tickets', {
      data: { remoteId: target!.id, categoryId: categories[0]!.id, occurredAt: new Date().toISOString(), problem: 'Uji peta', confirmOpenTickets: true },
    });
    expect(res.status()).toBe(201);
    await statesCall;
    await expect.poll(() => legendCount(page, 'gangguan')).toBeGreaterThan(before);
  });

  test('layar dinding: panel peta dengan keterangan, tanpa saringan', async ({ page }) => {
    await offlineTiles(page);
    await page.setViewportSize({ width: 1920, height: 1080 });
    await signInAs(page, 'helpdesk.contoh');
    await page.goto('/dinding?putar=2');
    await expect(page.getByRole('main').getByRole('heading', { name: 'Peta remote' })).toBeVisible({ timeout: 8000 });
    const main = page.getByRole('main');
    await expect(main.getByRole('group', { name: 'Keterangan peta' })).toContainText('Gangguan (NPR aktif)');
    await expect(main.getByRole('checkbox')).toHaveCount(0);
    await expect(main.locator('.map-cluster').first()).toBeVisible();
  });

  test('ponsel 375 px: Overview dengan peta tanpa gulir samping; saringan setinggi jari', async ({ page }) => {
    await offlineTiles(page);
    await page.setViewportSize({ width: 375, height: 740 });
    await signInAs(page, 'helpdesk.contoh');
    await expect(page.locator('.map-cluster').first()).toBeVisible();
    await expectNoPageOverflow(page);
    for (const label of await mapCard(page).locator('label.legend-item').all()) {
      expect((await label.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    }
    await expectPath(page, '/');
  });
});
