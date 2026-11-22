import { type Browser, expect, type Page, test } from '@playwright/test';
import writeXlsxFile from 'write-excel-file/node';
import { ACCOUNTS, loginAs } from './accounts';

// Antrean NPR dan pencarian global (langkah 1.5): tampilan bawaan dengan jumlah (T82),
// saringan di alamat dan diingat saat kembali, "Ambil" dan "Ambil alih" (T81), pencarian di
// bilah atas (T84). Setiap uji memakai remote baru (kode unik per run) lewat API.

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const run = Math.random().toString(36).slice(2, 7).toUpperCase();

interface Created {
  id: string;
  number: string;
  code: string;
}

/** NPR baru di remote uji baru (Bank Nusa), dibuat admin lewat API. */
async function newTicket(
  browser: Browser,
  suffix: string,
  pendingReason?: string,
  takenByAdmin = false,
): Promise<Created> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await loginAs(page, ACCOUNTS.admin);
  const tenants = (await (await page.request.get('/api/tenants')).json()) as Array<{ id: string; code: string }>;
  const bna = tenants.find((tenant) => tenant.code === 'BNA');
  if (!bna) throw new Error('Customer BNA dari seed tidak ada.');
  const code = `E2E-ANT-${run}-${suffix}`;
  const file = await writeXlsxFile([
    ['Kode remote', 'Nama remote', 'Jarkom', 'Zona waktu', 'Kota'],
    [code, `ATM Uji Antrean ${run} ${suffix}`, 'VSAT', 'WITA', 'Kolaka'],
  ]).toBuffer();
  const imported = await page.request.post(`/api/remote-import?tenantId=${bna.id}&mode=save`, {
    headers: { 'Content-Type': XLSX },
    data: file,
  });
  expect((await imported.json()).created).toBe(1);
  const found = (await (await page.request.get(`/api/remotes?q=${code}`)).json()) as { items: Array<{ id: string }> };
  const pick = async (kind: string, name: string) => {
    const values = (await (await page.request.get(`/api/master/${kind}?tenantId=${bna.id}`)).json()) as Array<{
      id: string;
      name: string;
    }>;
    return values.find((value) => value.name === name)?.id;
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
  if (pendingReason) {
    const res = await page.request.post(`/api/tickets/${ticket.id}/actions`, {
      data: { kind: 'hubungi_customer', note: 'Minta cek', statusFrom: 'terbuka', statusTo: 'pending_customer', pendingReason },
    });
    expect(res.status()).toBe(201);
  }
  if (takenByAdmin) {
    const res = await page.request.post(`/api/tickets/${ticket.id}/take`, { data: { expectedAssigneeId: null } });
    expect(res.status()).toBe(201);
  }
  await context.close();
  return { id: ticket.id, number: ticket.number, code };
}

const views = (page: Page) => page.getByRole('navigation', { name: 'Tampilan antrean' });
const row = (page: Page, number: string) => page.getByRole('row').filter({ hasText: number });

test('L1 menemukan NPR di antrean, menekan Ambil, lalu NPR ada di Milik saya', async ({ page, browser }) => {
  const ticket = await newTicket(browser, 'A');
  await loginAs(page, ACCOUNTS.l1);
  await page.goto('/tiket');
  await page.getByLabel('Cari di antrean').fill(ticket.code);
  await expect(page).toHaveURL(new RegExp(`q=${ticket.code}`));
  const line = row(page, ticket.number);
  await expect(line).toContainText('ATM Uji Antrean');
  await expect(line).toContainText('Terbuka');
  await expect(views(page).getByRole('link', { name: /^Semua terbuka/ })).toHaveAttribute('aria-current', 'page');

  await line.getByRole('button', { name: `Ambil ${ticket.number}` }).click();
  await expect(page.getByRole('status').filter({ hasText: `${ticket.number} sekarang Anda tangani.` })).toBeVisible();
  await expect(line).toContainText('Dewi A.');
  await expect(line).toContainText('Dikerjakan');

  await views(page).getByRole('link', { name: /^Milik saya/ }).click();
  await expect(page).toHaveURL(/view=saya/);
  await expect(row(page, ticket.number)).toBeVisible();

  await row(page, ticket.number).getByRole('link', { name: ticket.number }).click();
  await expect(page.getByRole('heading', { name: ticket.number })).toBeVisible();
  const summary = page.getByRole('region', { name: 'Gangguan' });
  await expect(summary).toContainText('Dewi A. · L1 Monitoring');
  await expect(page.getByRole('button', { name: /^Ambil/ })).toHaveCount(0);
  await expect(page.getByRole('region', { name: /^Linimasa/ })).toContainText('Penanggung: Dewi A.');
});

test('saringan tersimpan di alamat dan diingat saat kembali ke Tiket dari menu', async ({ page, browser }) => {
  const ticket = await newTicket(browser, 'B', 'Menunggu PIC tiba di lokasi');
  await loginAs(page, ACCOUNTS.l1);
  await page.goto('/tiket');
  await views(page).getByRole('link', { name: /^Pending/ }).click();
  await page.getByLabel('Cari di antrean').fill(ticket.code);
  await page.getByLabel('Urutan').selectOption('terbaru');
  await expect(page).toHaveURL(/view=pending/);
  await expect(page).toHaveURL(/sort=terbaru/);
  await expect(page).toHaveURL(new RegExp(`q=${ticket.code}`));
  const line = row(page, ticket.number);
  await expect(line).toContainText('Pending · Customer');
  await expect(line).toContainText('Menunggu PIC tiba di lokasi');

  await line.getByRole('link', { name: ticket.number }).click();
  await expect(page.getByRole('heading', { name: ticket.number })).toBeVisible();
  // Lewat menu (alamat tanpa saringan): saringan terakhir dipakai lagi.
  await page.goto('/tiket');
  await expect(page).toHaveURL(new RegExp(`q=${ticket.code}`));
  await expect(page.getByLabel('Cari di antrean')).toHaveValue(ticket.code);
  await expect(views(page).getByRole('link', { name: /^Pending/ })).toHaveAttribute('aria-current', 'page');
  await expect(row(page, ticket.number)).toBeVisible();

  await page.getByLabel('Status').selectOption({ label: 'Ditutup' });
  await expect(page.getByText('Tidak ada NPR yang cocok')).toBeVisible();
  await page.getByRole('button', { name: 'Hapus saringan' }).click();
  await expect(page.getByLabel('Cari di antrean')).toHaveValue('');
});

test('L2 mengambil alih NPR yang sudah diambil L1; linimasa mencatat dari siapa', async ({ page, browser }) => {
  const ticket = await newTicket(browser, 'C');
  const context = await browser.newContext();
  const l1 = await context.newPage();
  await loginAs(l1, ACCOUNTS.l1);
  expect((await l1.request.post(`/api/tickets/${ticket.id}/take`, { data: { expectedAssigneeId: null } })).status()).toBe(201);
  await context.close();

  await loginAs(page, ACCOUNTS.l2);
  await page.goto(`/tiket/${ticket.id}`);
  await expect(page.getByRole('region', { name: 'Gangguan' })).toContainText('Dewi A.');
  await page.getByRole('button', { name: 'Ambil alih' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Anda sekarang penanggung NPR ini.' })).toBeFocused();
  await expect(page.getByRole('region', { name: 'Gangguan' })).toContainText('Arif S. · L2 NOC');
  await expect(page.getByRole('region', { name: /^Linimasa/ })).toContainText('Penanggung: Dewi A. → Arif S.');
  await expect(page.getByRole('button', { name: 'Ambil alih' })).toHaveCount(0);
});

test('pencarian global: "/" memfokuskan, nomor NPR dan kode remote ditemukan, Enter membuka', async ({ page, browser }) => {
  const ticket = await newTicket(browser, 'D');
  await loginAs(page, ACCOUNTS.l1);
  await page.goto('/remote');
  const box = page.getByRole('combobox', { name: 'Cari di seluruh portal' });
  await page.locator('body').press('/');
  await expect(box).toBeFocused();

  await box.fill(ticket.number);
  const listbox = page.getByRole('listbox', { name: 'Hasil pencarian' });
  await expect(listbox.getByRole('group', { name: 'NPR' }).getByRole('option').first()).toContainText(ticket.number);
  await expect(box).toHaveAttribute('aria-expanded', 'true');
  await box.press('Enter');
  await expect(page).toHaveURL(new RegExp(`/tiket/${ticket.id}$`));
  await expect(box).toHaveValue('');

  await box.fill(ticket.code.toLowerCase());
  await expect(listbox.getByRole('group', { name: 'Remote' }).getByRole('option')).toHaveCount(1);
  await box.press('ArrowDown');
  await box.press('ArrowDown');
  await expect(listbox.getByRole('group', { name: 'Remote' }).getByRole('option')).toHaveAttribute('aria-selected', 'true');
  await box.press('Enter');
  await expect(page).toHaveURL(/\/remote\/[0-9a-f-]{36}$/);

  await box.fill('zz-tidak-ada-' + run);
  await expect(page.getByRole('status').filter({ hasText: 'Tidak ada NPR atau remote yang cocok' })).toBeVisible();
  await box.press('Escape');
  await expect(box).toHaveAttribute('aria-expanded', 'false');
});

test('ponsel 375px: antrean dan pencarian tanpa geser mendatar; Ambil bisa diketuk', async ({ page, browser }) => {
  const ticket = await newTicket(browser, 'E');
  await page.setViewportSize({ width: 375, height: 800 });
  await loginAs(page, ACCOUNTS.l1);
  await page.goto(`/tiket?q=${ticket.code}`);
  const button = row(page, ticket.number).getByRole('button', { name: `Ambil ${ticket.number}` });
  await expect(button).toBeVisible();
  const box = await button.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await page.getByRole('combobox', { name: 'Cari di seluruh portal' }).fill(ticket.code);
  await expect(page.getByRole('listbox', { name: 'Hasil pencarian' }).getByRole('option').first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);

  // Halaman NPR milik orang lain: label status, Ambil alih, dan Tambah tindakan terlipat.
  const taken = await newTicket(browser, 'G', undefined, true);
  await page.goto(`/tiket/${taken.id}`);
  await expect(page.getByRole('button', { name: 'Ambil alih' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});

test('jawaban antrean yang lebih lama tidak menimpa hasil saringan yang lebih baru', async ({ page, browser }) => {
  const ticket = await newTicket(browser, 'F');
  await loginAs(page, ACCOUNTS.l1);
  await page.goto(`/tiket?q=${ticket.code}`);
  await expect(row(page, ticket.number)).toBeVisible();
  // Permintaan tanpa kata kunci (sebelum saringan terakhir dipulihkan) dijawab belakangan.
  await page.route(/\/api\/tickets\?(?!.*q=)/, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1200));
    await route.continue();
  });
  await page.goto('/tiket');
  await expect(page).toHaveURL(new RegExp(`q=${ticket.code}`));
  await expect(row(page, ticket.number)).toBeVisible();
  await page.waitForTimeout(1600);
  await expect(page.getByRole('row')).toHaveCount(2); // judul + satu NPR
  await expect(row(page, ticket.number)).toBeVisible();
});
