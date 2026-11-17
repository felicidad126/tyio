import { expect, type Page, test } from '@playwright/test';
import { expectNoPageOverflow, signInAs } from './helpers';

const TINY_PNG = Buffer.from(
  '89504e470d0a1a0a0000000d4948445200000001000000010806000000' +
    '1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082',
  'hex',
);

/** Tiket baru lewat API (sesi browser yang sama), lalu buka halamannya. */
async function openNewTicket(page: Page, site = 'MRS-003'): Promise<{ id: string; number: string }> {
  const remote = (await (await page.request.get(`/api/remotes?q=${site}`)).json()).items[0];
  const categories = (await (await page.request.get('/api/master/kategori')).json()).items as Array<{ id: string; code: string }>;
  const res = await page.request.post('/api/tickets', {
    data: {
      remoteId: remote.id,
      categoryId: categories.find((c) => c.code === 'RD')!.id,
      occurredAt: new Date().toISOString(),
      problem: 'Uji linimasa (otomatis)',
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
const statusOptions = async (page: Page) =>
  (await page.getByLabel('Ubah status').locator('option').allInnerTexts()).map((t) => t.trim());

test.describe('detail tiket dan linimasa', () => {
  test('tindakan dengan perubahan status; hanya jalur yang sah ditawarkan; pending wajib pihak dan alasan', async ({ page }) => {
    await signInAs(page, 'l1.contoh');
    await openNewTicket(page);
    await expect(timeline(page).first()).toContainText('Tiket dibuat');
    expect(await statusOptions(page)).toEqual(['Tetap Terbuka', 'Dikerjakan', 'Pending', 'Eskalasi', 'Selesai']);

    await page.getByLabel('Ubah status').selectOption({ label: 'Dikerjakan' });
    await page.getByLabel('Catatan').fill('Cek ping ke remote: timeout.');
    await page.getByRole('button', { name: 'Simpan tindakan' }).click();
    await expect(page.getByTestId('status-tiket')).toHaveText('Dikerjakan');
    await expect(timeline(page).first()).toContainText('Cek ping ke remote: timeout.');
    await expect(timeline(page).first()).toContainText('Terbuka');
    expect(await statusOptions(page)).toEqual(['Tetap Dikerjakan', 'Pending', 'Eskalasi', 'Selesai']);

    await page.getByLabel('Ubah status').selectOption({ label: 'Pending' });
    await page.getByRole('button', { name: 'Simpan tindakan' }).click();
    await expect(page.getByText('Pilih pihak yang ditunggu.')).toBeVisible();
    await expect(page.getByText(/Alasan pending 3–500 karakter/)).toBeVisible();

    await page.getByRole('radio', { name: 'TM' }).check();
    await page.getByLabel('Alasan pending').fill('Menunggu teknisi TM ke lokasi');
    await page.getByRole('button', { name: 'Simpan tindakan' }).click();
    await expect(page.getByTestId('status-tiket')).toHaveText('Pending');
    await expect(page.getByText('Menunggu TM: Menunggu teknisi TM ke lokasi').first()).toBeVisible();
    expect(await statusOptions(page)).toEqual(['Tetap Pending', 'Dikerjakan']);
  });

  test('lampiran lewat pilih berkas dan tempel, lalu entri dikoreksi tanpa menghapusnya', async ({ page }) => {
    await signInAs(page, 'l1.contoh');
    await openNewTicket(page);

    await page.locator('input[type=file]').setInputFiles({ name: 'layar.png', mimeType: 'image/png', buffer: TINY_PNG });
    await page.getByLabel('Catatan').evaluate((el, bytes) => {
      const data = new DataTransfer();
      data.items.add(new File([new Uint8Array(bytes)], 'image.png', { type: 'image/png' }));
      el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
    }, [...TINY_PNG]);
    const pending = page.getByRole('list', { name: 'Lampiran yang akan disimpan' });
    await expect(pending.locator('li')).toHaveCount(2);
    await expect(pending).toContainText(/tempelan-\d+\.png/);

    await page.getByLabel('Catatan').fill('Teknisi tiba 09.00, bukti terlampir.');
    await page.getByRole('button', { name: 'Simpan tindakan' }).click();
    const entry = timeline(page).first();
    await expect(entry.getByRole('img')).toHaveCount(2);
    const src = await entry.getByRole('img', { name: 'layar.png' }).getAttribute('src');
    const file = await page.request.get(src!);
    expect(file.headers()['content-type']).toBe('image/png');

    await entry.getByRole('button', { name: /^Koreksi entri/ }).click();
    await page.getByLabel('Koreksi untuk entri ini').fill('Ralat: teknisi tiba 10.00.');
    await page.getByRole('button', { name: 'Simpan koreksi' }).click();
    await expect(timeline(page).first()).toContainText('Ralat: teknisi tiba 10.00.');
    await expect(timeline(page).first()).toContainText('Koreksi atas entri');
    await expect(timeline(page).nth(1)).toContainText('Teknisi tiba 09.00, bukti terlampir.');
    await expect(timeline(page).nth(1)).toContainText('Dikoreksi');
  });

  test('nomor tiket customer diubah di tempat tanpa menggeser isi halaman, dan tercatat di linimasa', async ({ page }) => {
    await signInAs(page, 'l1.contoh');
    await openNewTicket(page);
    const formTitle = page.getByRole('heading', { name: 'Tambah tindakan' });
    const before = await formTitle.boundingBox();

    await page.getByRole('button', { name: 'Isi nomor tiket customer' }).click();
    expect(await formTitle.boundingBox()).toEqual(before);
    await page.getByLabel('Nomor tiket customer', { exact: true }).fill('INC-777');
    await page.getByLabel('Nomor tiket customer', { exact: true }).press('Enter');

    await expect(page.getByRole('button', { name: 'Ubah nomor tiket customer INC-777' })).toBeFocused();
    await expect(timeline(page).first()).toContainText('Nomor tiket customer: INC-777');
  });

  test('status diubah rekan saat form terbuka: peringatan, lalu tiket dimuat ulang', async ({ page }) => {
    await signInAs(page, 'l1.contoh');
    const ticket = await openNewTicket(page);
    // Rekan mengubah status lebih dulu.
    const res = await page.request.post(`/api/tickets/${ticket.id}/actions`, {
      data: { occurredAt: new Date().toISOString(), statusTo: 'dikerjakan', expectedStatus: 'terbuka' },
    });
    expect(res.status()).toBe(201);

    await page.getByLabel('Ubah status').selectOption({ label: 'Selesai' });
    await page.getByRole('button', { name: 'Simpan tindakan' }).click();

    await expect(page.getByTestId('status-tiket')).toHaveText('Dikerjakan');
    // Pesan tetap terlihat setelah tiket dimuat ulang, dan pilihan status mengikuti status baru.
    await expect(page.getByRole('alert').filter({ hasText: 'Status tiket sudah berubah menjadi Dikerjakan' })).toBeVisible();
    expect(await statusOptions(page)).toEqual(['Tetap Dikerjakan', 'Pending', 'Eskalasi', 'Selesai']);
  });

  test('jenis tindakan Cek lokasi dan Problem wajib catatan, tampil di linimasa dan di daftar', async ({ page }) => {
    await signInAs(page, 'l1.contoh');
    const ticket = await openNewTicket(page);
    const types = page.getByRole('group', { name: 'Jenis tindakan' });
    await expect(types.getByRole('radio', { name: 'Bebas' })).toBeChecked();

    await types.getByText('Cek lokasi').click();
    await expect(page.getByText('Minta PIC di lokasi mengecek.')).toBeVisible();
    await page.getByRole('button', { name: 'Simpan tindakan' }).click();
    await expect(page.getByText('Tulis catatan untuk tindakan Cek lokasi.')).toBeVisible();

    await page.getByLabel('Catatan').fill('Hubungi PIC lokasi untuk cek lampu modem');
    await page.getByRole('button', { name: 'Simpan tindakan' }).click();
    await expect(timeline(page).first()).toContainText('Cek lokasi');
    await expect(timeline(page).first()).toContainText('Hubungi PIC lokasi untuk cek lampu modem');
    // Form kembali ke Bebas setelah disimpan.
    await expect(types.getByRole('radio', { name: 'Bebas' })).toBeChecked();

    await types.getByText('Problem').click();
    await page.getByLabel('Catatan').fill('PIC: modem mati, adaptor rusak');
    await page.getByRole('button', { name: 'Simpan tindakan' }).click();
    await expect(timeline(page).first()).toContainText('Problem');

    await page.goto(`/tiket?q=${encodeURIComponent(ticket.number)}`);
    await expect(page.getByRole('row').filter({ hasText: ticket.number })).toContainText('Problem: PIC: modem mati');
  });

  test('pilihan pihak pending menjelaskan kapan memilih TM atau Customer', async ({ page }) => {
    await signInAs(page, 'l1.contoh');
    await openNewTicket(page);
    await page.getByLabel('Ubah status').selectOption({ label: 'Pending' });
    const parties = page.getByRole('group', { name: 'Menunggu pihak' });
    // Nama pilihan tetap singkat; keterangannya dibacakan sebagai deskripsi.
    await expect(parties.getByRole('radio', { name: 'TM', exact: true })).toHaveAccessibleDescription(
      'Problem jaringan (jarkom) di lokasi',
    );
    await expect(parties.getByRole('radio', { name: 'Customer', exact: true })).toHaveAccessibleDescription(
      'Listrik, obstacle, renovasi, atau part ATM belum siap',
    );
  });

  test('tiket aktif yang sudah down 7 hari ditandai di detail dan di daftar; tiket baru tidak', async ({ page }) => {
    await signInAs(page, 'l1.contoh');
    const remote = (await (await page.request.get('/api/remotes?q=MRS-006')).json()).items[0];
    const categories = (await (await page.request.get('/api/master/kategori')).json()).items as Array<{ id: string; code: string }>;
    const create = async (daysAgo: number) => {
      const res = await page.request.post('/api/tickets', {
        data: {
          remoteId: remote.id,
          categoryId: categories.find((c) => c.code === 'RD')!.id,
          occurredAt: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString(),
          problem: `Uji tanda ${daysAgo} hari`,
          confirmOpenTickets: true,
        },
      });
      expect(res.status()).toBe(201);
      return (await res.json()).ticket as { id: string; number: string };
    };
    const old = await create(8);
    const fresh = await create(6);

    await page.goto(`/tiket/${old.id}`);
    await expect(page.getByText('Down ≥ 7 hari')).toBeVisible();
    await page.goto(`/tiket/${fresh.id}`);
    await expect(page.getByTestId('status-tiket')).toBeVisible();
    await expect(page.getByText('Down ≥ 7 hari')).toHaveCount(0);

    await page.goto('/tiket?q=MRS-006');
    await expect(page.getByRole('row').filter({ hasText: old.number })).toContainText('≥ 7 hari');
    await expect(page.getByRole('row').filter({ hasText: fresh.number })).not.toContainText('≥ 7 hari');
  });

  test('ponsel 375 px: detail tiket tanpa gulir samping', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 740 });
    await signInAs(page, 'l1.contoh');
    await openNewTicket(page);
    await expect(page.getByRole('button', { name: 'Simpan tindakan' })).toBeVisible();
    await expectNoPageOverflow(page);
  });
});
