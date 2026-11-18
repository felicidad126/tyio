import { expect, type Page, test } from '@playwright/test';
import { expectNoPageOverflow, expectPath, signInAs } from './helpers';

const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');

/** NPR baru (kejadian 2 jam lalu) lewat API dengan sesi browser yang sama, lalu buka halamannya. */
async function openNewTicket(page: Page, site: string): Promise<{ id: string; number: string; remoteId: string }> {
  const remote = (await (await page.request.get(`/api/remotes?q=${site}`)).json()).items[0];
  const categories = (await (await page.request.get('/api/master/kategori')).json()).items as Array<{ id: string; code: string }>;
  const res = await page.request.post('/api/tickets', {
    data: {
      remoteId: remote.id,
      categoryId: categories.find((c) => c.code === 'RD')!.id,
      occurredAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      problem: `Jarkom down ${Date.now()}`,
      confirmOpenTickets: true,
    },
  });
  expect(res.status()).toBe(201);
  const ticket = (await res.json()).ticket as { id: string; number: string };
  await page.goto(`/tiket/${ticket.id}`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(ticket.number);
  return { ...ticket, remoteId: remote.id };
}

async function openTt(page: Page, ticket: { id: string }): Promise<string> {
  const res = await page.request.post(`/api/tickets/${ticket.id}/tt`, {
    data: { problem: 'Modem mati, cek BUC dan LNB', expectedStatus: 'terbuka' },
  });
  expect(res.status()).toBe(201);
  await page.reload();
  return (await res.json()).ticket.tt.number as string;
}

const timeline = (page: Page) => page.getByRole('list', { name: 'Linimasa' }).locator(':scope > li');
const types = (page: Page) => page.getByRole('group', { name: 'Jenis tindakan' });
const chooseClose = (page: Page) => types(page).getByText('Close', { exact: true }).click();

test.describe('Close NPR dan riwayat remote', () => {
  test('tanpa TT: waktu online kembali dan catatan penyelesaian; status Selesai, lama gangguan, tidak lagi tiket terbuka', async ({ page }) => {
    await signInAs(page, 'helpdesk.contoh');
    const npr = await openNewTicket(page, 'MRS-011');

    await chooseClose(page);
    await expect(page.getByLabel(/^Waktu online kembali \(W/)).toBeVisible();
    await expect(page.getByLabel('Ubah status')).toHaveCount(0);
    await expect(page.getByTestId('status-close')).toHaveText(/Terbuka\s*→\s*menjadi\s*Selesai/);
    await expect(page.getByRole('group', { name: 'Part yang diganti teknisi' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Close NPR' }).click();
    await expect(page.getByText('Tulis catatan penyelesaian: apa yang membuat jarkom online kembali.')).toBeVisible();

    await page.getByLabel('Catatan penyelesaian').fill('Listrik PLN pulih, modem menyala, jarkom online');
    await page.getByRole('button', { name: 'Close NPR' }).click();

    await expect(page.getByTestId('status-tiket')).toHaveText('Selesai');
    await expect(page.getByTestId('online-kembali')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Gangguan' })).toContainText(/Lama gangguan\s*2 jam/);
    await expect(timeline(page).first()).toContainText('Close');
    await expect(timeline(page).first()).toContainText('Listrik PLN pulih');
    // Sudah Selesai: Close tidak bisa dipilih lagi; NPR bisa dibuka lagi ke Dikerjakan.
    await expect(types(page).getByRole('radio', { name: 'Close' })).toBeDisabled();
    await expect(page.getByText('NPR sudah Selesai.')).toBeVisible();
    await expect(page.getByLabel('Ubah status').locator('option')).toHaveText(['Tetap Selesai', 'Dikerjakan']);
    const open = (await (await page.request.get(`/api/remotes/${npr.remoteId}/open-tickets`)).json()).tickets as Array<{ id: string }>;
    expect(open.map((t) => t.id)).not.toContain(npr.id);
  });

  test('dengan TT: wajib part dan laporan teknisi; TT ikut ditutup; part tampil di linimasa', async ({ page }) => {
    await signInAs(page, 'helpdesk.contoh');
    const npr = await openNewTicket(page, 'MRS-012');
    const tt = await openTt(page, npr);

    await chooseClose(page);
    await expect(page.getByText(`${tt} ikut ditutup.`)).toBeVisible();
    await expect(page.getByTestId('status-close')).toHaveText(/Eskalasi\s*→\s*menjadi\s*Selesai/);
    await page.getByLabel('Catatan penyelesaian').fill('Teknisi ganti modem, jarkom online');
    await page.getByRole('button', { name: 'Close NPR' }).click();
    await expect(page.getByText('Pilih part yang diganti, atau "Tidak ada part yang diganti".')).toBeVisible();
    await expect(page.getByText('Lampirkan laporan teknisi.')).toBeVisible();

    const parts = page.getByRole('group', { name: 'Part yang diganti teknisi' });
    await parts.getByRole('checkbox', { name: 'LNB' }).check();
    await parts.getByRole('checkbox', { name: 'Tidak ada part yang diganti' }).check();
    await expect(parts.getByRole('checkbox', { name: 'LNB' })).not.toBeChecked();
    await parts.getByRole('checkbox', { name: 'Modem' }).check();
    await parts.getByRole('checkbox', { name: 'LNB' }).check();
    await expect(parts.getByRole('checkbox', { name: 'Tidak ada part yang diganti' })).not.toBeChecked();
    await page.locator('input[type="file"]').setInputFiles({ name: 'laporan-teknisi.pdf', mimeType: 'application/pdf', buffer: PDF });
    await page.getByRole('button', { name: 'Close NPR' }).click();

    await expect(page.getByTestId('status-tiket')).toHaveText('Selesai');
    await expect(page.getByRole('region', { name: 'Trouble Ticket (TT)' })).toContainText('ditutup bersama NPR');
    await expect(timeline(page).first()).toContainText('Part diganti: Modem, LNB');
    await expect(timeline(page).first().getByRole('link', { name: 'Buka lampiran laporan-teknisi.pdf' })).toBeVisible();
    await page.goto('/tiket?tampilan=tt');
    await expect(page.getByRole('row').filter({ hasText: npr.number })).toHaveCount(0);
  });

  test('NPR Pending tidak bisa langsung Close: ubah ke Dikerjakan dulu', async ({ page }) => {
    await signInAs(page, 'helpdesk.contoh');
    const npr = await openNewTicket(page, 'MRS-013');
    const res = await page.request.post(`/api/tickets/${npr.id}/actions`, {
      data: {
        occurredAt: new Date().toISOString(),
        statusTo: 'pending',
        expectedStatus: 'terbuka',
        pendingParty: 'customer',
        pendingReason: 'Listrik padam',
      },
    });
    expect(res.status()).toBe(201);
    await page.reload();

    await expect(types(page).getByRole('radio', { name: 'Close' })).toBeDisabled();
    await expect(types(page).getByRole('radio', { name: 'Close' })).toHaveAccessibleDescription(
      'Close dari Pending: ubah ke Dikerjakan dulu.',
    );
  });

  test('riwayat tiket remote: dari tiket ke halaman remote; NPR Selesai dengan online kembali dan lama gangguan', async ({ page }) => {
    await signInAs(page, 'helpdesk.contoh');
    const npr = await openNewTicket(page, 'MRS-014');
    await chooseClose(page);
    await page.getByLabel('Catatan penyelesaian').fill('Online kembali setelah reset modem');
    await page.getByRole('button', { name: 'Close NPR' }).click();
    await expect(page.getByTestId('status-tiket')).toHaveText('Selesai');

    await page.getByRole('link', { name: 'Riwayat tiket remote ini' }).click();
    await expectPath(page, `/remote/${npr.remoteId}`);
    const history = page.getByRole('region', { name: /^Riwayat tiket/ });
    await expect(history).toBeInViewport();
    const item = history.getByRole('listitem').filter({ hasText: npr.number });
    await expect(item).toContainText('Selesai');
    await expect(item).toContainText(/Online kembali .* · lama gangguan 2 jam/);
    await item.getByRole('link', { name: npr.number }).click();
    await expectPath(page, `/tiket/${npr.id}`);
  });

  test('ponsel 375 px: form Close dengan TT tanpa gulir samping; pilihan part setinggi jari', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 740 });
    await signInAs(page, 'helpdesk.contoh');
    const npr = await openNewTicket(page, 'MRS-015');
    await openTt(page, npr);

    await chooseClose(page);
    const parts = page.getByRole('group', { name: 'Part yang diganti teknisi' });
    await expect(parts).toBeVisible();
    for (const label of await parts.locator('label').all()) {
      expect((await label.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    }
    await expectNoPageOverflow(page);
    await page.goto(`/remote/${npr.remoteId}`);
    await expect(page.getByRole('region', { name: /^Riwayat tiket/ }).getByRole('listitem').first()).toBeVisible();
    await expectNoPageOverflow(page);
  });
});
