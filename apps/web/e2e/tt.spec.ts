import { expect, type Page, test } from '@playwright/test';
import { expectNoPageOverflow, signInAs } from './helpers';

/** NPR baru lewat API dengan sesi browser yang sama, lalu buka halamannya. */
async function openNewTicket(page: Page, site = 'MRS-007'): Promise<{ id: string; number: string }> {
  const remote = (await (await page.request.get(`/api/remotes?q=${site}`)).json()).items[0];
  const categories = (await (await page.request.get('/api/master/kategori')).json()).items as Array<{ id: string; code: string }>;
  const res = await page.request.post('/api/tickets', {
    data: {
      remoteId: remote.id,
      categoryId: categories.find((c) => c.code === 'RD')!.id,
      occurredAt: new Date().toISOString(),
      problem: `Modem tidak merespons ${Date.now()}`,
      confirmOpenTickets: true,
    },
  });
  expect(res.status()).toBe(201);
  const ticket = (await res.json()).ticket as { id: string; number: string };
  await page.goto(`/tiket/${ticket.id}`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(ticket.number);
  return ticket;
}

const timeline = (page: Page) => page.getByRole('list', { name: 'Linimasa' }).locator(':scope > li');
const ttCard = (page: Page) => page.getByRole('region', { name: 'Trouble Ticket (TT)' });

test.describe('Trouble Ticket: Eskalasi To SD', () => {
  test('membuka TT dari NPR: nomor TT, status Eskalasi, tercatat di linimasa, tidak bisa dibuka dua kali', async ({ page }) => {
    await signInAs(page, 'helpdesk.contoh');
    const npr = await openNewTicket(page);
    // Eskalasi tidak ditawarkan di form status; hanya lewat Eskalasi To SD.
    await expect(page.getByLabel('Ubah status').locator('option')).toHaveText(['Tetap Terbuka', 'Dikerjakan', 'Pending']);

    await ttCard(page).getByRole('button', { name: 'Eskalasi To SD' }).click();
    const drawer = page.getByRole('dialog', { name: 'Eskalasi To SD' });
    const problem = drawer.getByLabel('Problem untuk teknisi');
    await expect(problem).toBeFocused();
    await expect(problem).toHaveValue(/Modem tidak merespons/);
    await problem.fill('x');
    await drawer.getByRole('button', { name: 'Buka TT' }).click();
    await expect(drawer.getByText(/Problem untuk teknisi 3–2.000 karakter/)).toBeVisible();

    await problem.fill('Cek BUC dan LNB, modem tidak lock');
    await drawer.getByRole('button', { name: 'Buka TT' }).click();
    await expect(drawer).toBeHidden();

    await expect(page.getByTestId('status-tiket')).toHaveText('Eskalasi');
    const number = (await ttCard(page).getByTestId('nomor-tt').innerText()).trim();
    expect(number).toMatch(/^TT\/VSAT\/MRS\/\d{4}\/\d{2}\/\d{4}$/);
    await expect(ttCard(page)).toContainText('Cek BUC dan LNB, modem tidak lock');
    await expect(timeline(page).first()).toContainText('Eskalasi To SD');
    await expect(timeline(page).first()).toContainText(number);
    await expect(ttCard(page).getByRole('button', { name: 'Eskalasi To SD' })).toHaveCount(0);

    // Setelah kunjungan: Dikerjakan atau Pending; Selesai lewat jenis tindakan Close.
    await expect(page.getByLabel('Ubah status').locator('option')).toHaveText(['Tetap Eskalasi', 'Dikerjakan', 'Pending']);
    expect((await page.request.post(`/api/tickets/${npr.id}/tt`, { data: { problem: 'Lagi', expectedStatus: 'eskalasi' } })).status()).toBe(409);
  });

  test('salin ringkasan TT ke clipboard; penyalinan tercatat di linimasa', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await signInAs(page, 'helpdesk.contoh');
    await openNewTicket(page, 'MRS-008');
    await ttCard(page).getByRole('button', { name: 'Eskalasi To SD' }).click();
    await page.getByRole('dialog', { name: 'Eskalasi To SD' }).getByRole('button', { name: 'Buka TT' }).click();
    const number = (await ttCard(page).getByTestId('nomor-tt').innerText()).trim();

    await ttCard(page).getByRole('button', { name: 'Salin ringkasan TT' }).click();
    await expect(ttCard(page).getByText('Ringkasan disalin. Tempel di chat Service Delivery.')).toBeVisible();
    const text = await page.evaluate(() => navigator.clipboard.readText());
    expect(text.split('\n')[0]).toContain(number);
    expect(text).toContain('Remote: ');
    expect(text).toContain('(MRS-008)');
    await expect(timeline(page).first()).toContainText(`Ringkasan ${number} disalin untuk dikirim ke SD.`);
  });

  test('tab TT aktif dan pencarian global menemukan NPR lewat no. TT', async ({ page }) => {
    await signInAs(page, 'helpdesk.contoh');
    const npr = await openNewTicket(page, 'MRS-009');
    await ttCard(page).getByRole('button', { name: 'Eskalasi To SD' }).click();
    await page.getByRole('dialog', { name: 'Eskalasi To SD' }).getByRole('button', { name: 'Buka TT' }).click();
    const number = (await ttCard(page).getByTestId('nomor-tt').innerText()).trim();

    await page.goto(`/tiket?tampilan=tt&q=${encodeURIComponent(npr.number)}`);
    const row = page.getByRole('row').filter({ hasText: npr.number });
    await expect(row).toContainText(number);

    const box = page.getByRole('banner').getByRole('searchbox', { name: 'Cari tiket atau remote' });
    await box.fill(number.toLowerCase());
    await box.press('Enter');
    await expect(page.getByRole('region', { name: /^Tiket/ })).toContainText(npr.number);
  });

  test('ponsel 375 px: detail dengan TT tanpa gulir samping; panel Eskalasi selebar layar', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 740 });
    await signInAs(page, 'helpdesk.contoh');
    await openNewTicket(page, 'MRS-010');
    await ttCard(page).getByRole('button', { name: 'Eskalasi To SD' }).click();
    const drawer = page.getByRole('dialog', { name: 'Eskalasi To SD' });
    expect((await drawer.boundingBox())?.width).toBeGreaterThanOrEqual(370);
    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
    await expect(ttCard(page).getByRole('button', { name: 'Eskalasi To SD' })).toBeFocused();

    await ttCard(page).getByRole('button', { name: 'Eskalasi To SD' }).click();
    await drawer.getByRole('button', { name: 'Buka TT' }).click();
    await expect(ttCard(page).getByTestId('nomor-tt')).toBeVisible();
    await expectNoPageOverflow(page);
  });
});
