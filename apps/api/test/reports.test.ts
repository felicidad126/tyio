import type { INestApplication } from '@nestjs/common';
import { type NprReportResponse, REPORT_EXPORT_MAX_ROWS, type TicketListResponse } from '@tyio/shared';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ReportsService } from '../src/modules/reports/reports.service.js';
import type { Tenant } from '../src/modules/tenants/tenant.entity.js';
import { createTestApp } from './create-test-app.js';
import { resetData } from './db.js';
import {
  asTester,
  createRemote,
  createTenant,
  createTicket,
  createTroubleTicket,
  createUser,
  ensureCategory,
  ensureJarkom,
  sessionCookieFrom,
  TEST_PASSWORD,
} from './fixtures.js';
import { binaryParser, readXlsx } from './xlsx-read.js';

/** Waktu WIB dalam teks, mis. "2026-10-01T00:30" → Date. */
const wib = (local: string) => new Date(`${local}+07:00`);
const OKTOBER = { from: '2026-10-01', to: '2026-10-31' };

/** Teks sel inline dalam satu baris lembar. */
const rowTexts = (sheet: string, row: number) => {
  const xml = sheet.match(new RegExp(`<row r="${row}">(.*?)</row>`))?.[1] ?? '';
  return [...xml.matchAll(/<c r="([A-Z]+)\d+"[^>]*>(?:<is><t[^>]*>(.*?)<\/t><\/is>|<v>(.*?)<\/v>)<\/c>/g)].map(
    (m) => [m[1]!, m[2] ?? m[3]!] as const,
  );
};

// Laporan rekap NPR (4.2): NPR per tanggal kejadian WIB, dibatasi customer seperti daftar, dan
// setiap angka sama dengan total daftar Tiket dengan saringan yang sama.
describe('laporan rekap NPR (/api/reports/npr)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let a: Tenant;
  let b: Tenant;
  const ids = { cm: '', j2: '' };
  const cookies = { semua: '', hanyaA: '', kosong: '' };
  const http = () => request(app.getHttpServer());
  const report = async (query: Record<string, string> = OKTOBER, who: keyof typeof cookies = 'semua') =>
    (await http().get('/api/reports/npr').query(query).set('Cookie', cookies[who]).expect(200)).body as NprReportResponse;
  const excel = (query: Record<string, string> = OKTOBER, who: keyof typeof cookies = 'semua') =>
    http()
      .get('/api/reports/npr/excel')
      .query(query)
      .set('Cookie', cookies[who])
      .buffer(true)
      .parse(binaryParser);

  beforeAll(async () => {
    app = await createTestApp();
    ds = app.get(DataSource);
    await resetData(ds);
    a = await createTenant(ds, 'TNA', 'Bank Uji Anggrek');
    b = await createTenant(ds, 'TNB', 'Bank Uji Rahasia');
    const rd = await ensureCategory(ds, 'RD', 'Remote Down');
    const cm = await ensureCategory(ds, 'CM', 'Corrective Maintenance');
    const j2 = await ensureJarkom(ds, 'J2', 'Jarkom Dua');
    Object.assign(ids, { cm: cm.id, j2: j2.id });
    const a1 = await createRemote(ds, a, 'TNA-001', { name: 'ATM Pasar' });
    const a2 = await createRemote(ds, a, 'TNA-002', { jarkomId: j2.id });
    const b1 = await createRemote(ds, b, 'TNB-001');
    let n = 0;
    const ticket = (remote: typeof a1, overrides: Parameters<typeof createTicket>[3]) =>
      createTicket(ds, remote, `NPR/UJI/${remote.siteId}/${++n}`, { categoryId: rd.id, ...overrides });
    const close = (id: string, note: string, parts: string[] | null) =>
      asTester(ds, (m) =>
        m.query(
          `INSERT INTO ticket_actions (tenant_id, ticket_id, action_type, occurred_at, note, status_to, replaced_parts, created_by)
           SELECT tenant_id, id, 'close', closed_at, $2, 'selesai', $3, created_by FROM tickets WHERE id = $1`,
          [id, note, parts],
        ),
      );

    // Detik diabaikan (T78): 00.30 sampai 02.45 = 135 menit.
    const first = await ticket(a1, {
      status: 'selesai',
      occurredAt: wib('2026-10-01T00:30:00'),
      closedAt: wib('2026-10-01T02:45:59'),
      customerTicketNumber: 'INC-77',
    });
    await close(first.id, 'Modem dan adaptor diganti', ['adaptor', 'modem']);
    await ticket(a1, { occurredAt: wib('2026-09-30T23:59:59') }); // September menurut WIB
    const cm1 = await ticket(a1, {
      status: 'selesai',
      categoryId: cm.id,
      occurredAt: wib('2026-10-15T10:00:30'),
      closedAt: wib('2026-10-15T11:00:10'),
    });
    await close(cm1.id, 'Modem diganti', ['modem']);
    const esc = await ticket(a2, { status: 'eskalasi', occurredAt: wib('2026-10-20T08:00:00') });
    await createTroubleTicket(ds, esc, 'TT/UJI/TNA/1');
    // Pernah Close lalu dibuka lagi: catatan Close tidak tampil, part tetap terhitung (sudah diganti).
    const reopened = await ticket(a2, {
      status: 'pending',
      pendingParty: 'customer',
      pendingReason: 'Listrik padam',
      occurredAt: wib('2026-10-31T23:59:59'),
    });
    await asTester(ds, (m) =>
      m.query(
        `INSERT INTO ticket_actions (tenant_id, ticket_id, action_type, occurred_at, note, status_to, replaced_parts, created_by)
         SELECT tenant_id, id, 'close', occurred_at, 'Ditutup terlalu cepat', 'selesai', '{indoor}', created_by FROM tickets WHERE id = $1`,
        [reopened.id],
      ),
    );
    await ticket(a2, { occurredAt: wib('2026-11-01T00:00:00') }); // November menurut WIB
    const other = await ticket(b1, {
      status: 'selesai',
      occurredAt: wib('2026-10-10T09:00:00'),
      closedAt: wib('2026-10-10T13:00:00'),
      problem: '=HYPERLINK("http://contoh.invalid","klik")',
    });
    await createTroubleTicket(ds, other, 'TT/UJI/TNB/1');
    await close(other.id, 'LNB diganti', ['lnb']);

    await createUser(ds, { username: 'helpdesk.semua', allTenants: true });
    await createUser(ds, { username: 'helpdesk.a', allTenants: false, tenants: [a] });
    await createUser(ds, { username: 'helpdesk.kosong', allTenants: false, tenants: [] });
    for (const [key, username] of [
      ['semua', 'helpdesk.semua'],
      ['hanyaA', 'helpdesk.a'],
      ['kosong', 'helpdesk.kosong'],
    ] as const) {
      const res = await http().post('/api/auth/login').send({ username, password: TEST_PASSWORD }).expect(200);
      cookies[key] = sessionCookieFrom(res.headers['set-cookie']);
    }
  });

  afterAll(async () => {
    await app.close();
  });

  it('ringkasan periode menurut hari WIB: jumlah, selesai, aktif, TT, rata-rata dan median lama', async () => {
    const r = await report();

    expect(r).toMatchObject({ ...OKTOBER, page: 1, pageSize: 50 });
    expect(r.summary).toEqual({ total: 5, closed: 3, active: 2, withTt: 2, avgMinutes: 145, medianMinutes: 135 });
    expect(r.byCustomer.map((g) => [g.ref.code, g.total, g.closed, g.active, g.withTt, g.avgMinutes, g.medianMinutes])).toEqual([
      ['TNA', 4, 2, 2, 1, 98, 98],
      ['TNB', 1, 1, 0, 1, 240, 240],
    ]);
    expect(r.byCategory.map((g) => [g.ref.code, g.total, g.closed, g.avgMinutes])).toEqual([
      ['RD', 4, 2, 188],
      ['CM', 1, 1, 60],
    ]);
    expect(r.parts).toEqual([
      { part: 'modem', count: 2 },
      { part: 'adaptor', count: 1 },
      { part: 'indoor', count: 1 },
      { part: 'lnb', count: 1 },
    ]);
    expect(r.topRemotes.map((x) => [x.siteId, x.tenant, x.total])).toEqual([
      ['TNA-001', 'Bank Uji Anggrek', 2],
      ['TNA-002', 'Bank Uji Anggrek', 2],
      ['TNB-001', 'Bank Uji Rahasia', 1],
    ]);
  });

  it('baris rinci: terbaru dulu, dengan TT, lama gangguan, catatan dan part dari Close', async () => {
    const r = await report();

    expect(r.items.map((x) => [x.siteId, x.status, x.ttNumber, x.durationMinutes])).toEqual([
      ['TNA-002', 'pending', null, null],
      ['TNA-002', 'eskalasi', 'TT/UJI/TNA/1', null],
      ['TNA-001', 'selesai', null, 60],
      ['TNB-001', 'selesai', 'TT/UJI/TNB/1', 240],
      ['TNA-001', 'selesai', null, 135],
    ]);
    expect(r.items[4]).toMatchObject({
      customerTicketNumber: 'INC-77',
      tenant: 'Bank Uji Anggrek',
      remote: 'ATM Pasar',
      city: 'Kota Uji',
      category: 'Remote Down',
      jarkom: 'Jarkom UJI',
      occurredAt: wib('2026-10-01T00:30:00').toISOString(),
      closedAt: wib('2026-10-01T02:45:59').toISOString(),
      closeNote: 'Modem dan adaptor diganti',
      replacedParts: ['adaptor', 'modem'],
    });
    expect(r.items[0]).toMatchObject({ closedAt: null, closeNote: null, replacedParts: null });
  });

  it('setiap angka sama dengan total daftar Tiket dengan saringan yang sama', async () => {
    const list = async (query: Record<string, string>) =>
      ((await http().get('/api/tickets').query(query).set('Cookie', cookies.semua).expect(200)).body as TicketListResponse).total;
    const period = { occurredFrom: OKTOBER.from, occurredTo: OKTOBER.to };
    const r = await report();
    const cases: Array<[Record<string, string>, Record<string, string>]> = [
      [{}, { view: 'semua' }],
      [{ status: 'aktif' }, { view: 'aktif' }],
      [{ status: 'selesai' }, { view: 'selesai' }],
      [{ categoryId: ids.cm }, { view: 'semua', categoryId: ids.cm }],
      [{ jarkomId: ids.j2 }, { view: 'semua', jarkomId: ids.j2 }],
      [{ tenantId: b.id, status: 'selesai' }, { view: 'selesai', tenantId: b.id }],
      ...r.byCustomer.map((g): [Record<string, string>, Record<string, string>] => [
        { tenantId: g.ref.id },
        { view: 'semua', tenantId: g.ref.id },
      ]),
    ];
    for (const [filter, listQuery] of cases) {
      const got = await report({ ...OKTOBER, ...filter });
      const expected = await list({ ...listQuery, ...period });
      expect(got.summary.total, JSON.stringify(filter)).toBe(expected);
      expect(got.summary.closed + got.summary.active).toBe(got.summary.total);
    }
    for (const g of r.byCustomer) expect(g.closed).toBe(await list({ view: 'selesai', tenantId: g.ref.id, ...period }));
    for (const x of r.topRemotes) {
      expect(x.total).toBe(await list({ view: 'semua', remoteId: x.id, ...period }));
    }
    expect((await report({ ...OKTOBER, status: 'aktif' })).summary).toMatchObject({ total: 2, closed: 0, avgMinutes: null });
  });

  it('dibatasi customer: pengguna satu customer hanya melihat datanya; tanpa customer kosong', async () => {
    const onlyA = await report(OKTOBER, 'hanyaA');

    expect(onlyA.summary.total).toBe(4);
    expect(onlyA.byCustomer.map((g) => g.ref.code)).toEqual(['TNA']);
    expect(onlyA.parts.map((p) => p.part)).toEqual(['modem', 'adaptor', 'indoor']);
    const body = JSON.stringify(onlyA);
    for (const marker of [b.id, b.name, 'TNB-001', 'TT/UJI/TNB/1', 'LNB diganti']) expect(body).not.toContain(marker);
    // Menyaring customer lain tidak membuka datanya.
    expect((await report({ ...OKTOBER, tenantId: b.id }, 'hanyaA')).summary.total).toBe(0);

    const none = await report(OKTOBER, 'kosong');
    expect(none.summary).toEqual({ total: 0, closed: 0, active: 0, withTt: 0, avgMinutes: null, medianMinutes: null });
    expect([none.byCustomer, none.byCategory, none.parts, none.topRemotes, none.items]).toEqual([[], [], [], [], []]);
  });

  it('halaman: 50 baris per halaman, halaman lewat batas kosong', async () => {
    expect((await report({ ...OKTOBER, page: '2' })).items).toEqual([]);
    expect((await report({ ...OKTOBER, page: '1' })).items).toHaveLength(5);
  });

  it('periode bawaan: tanggal 1 bulan ini sampai hari ini (WIB)', async () => {
    const r = await report({});
    expect(r.from).toMatch(/^\d{4}-\d{2}-01$/);
    expect(r.to >= r.from).toBe(true);
  });

  it('parameter tidak sah dijawab 400 dengan pesan yang jelas', async () => {
    const bad = async (query: Record<string, string>) =>
      (await http().get('/api/reports/npr').query(query).set('Cookie', cookies.semua).expect(400)).body.message;

    expect(await bad({ from: '01-10-2026' })).toBe('Tanggal awal periode harus berbentuk TTTT-BB-HH.');
    expect(await bad({ to: '2026-02-30' })).toBe('Tanggal akhir periode harus berbentuk TTTT-BB-HH.');
    expect(await bad({ from: '2026-10-02', to: '2026-10-01' })).toBe('Tanggal awal periode tidak boleh setelah tanggal akhir.');
    expect(await bad({ from: '2025-01-01', to: '2026-01-02' })).toBe('Periode laporan paling panjang 366 hari.');
    expect(await bad({ status: 'pending' })).toBe('Status harus salah satu dari: semua, aktif, selesai.');
    expect(await bad({ tenantId: 'bukan-id' })).toBe('Customer tidak sah.');
    expect(await bad({ page: '0' })).toBe('Halaman harus bilangan bulat mulai 1.');
    expect(await bad({ view: 'semua' })).toBe('Parameter tidak dikenal: view.');
    // 366 hari termasuk kedua ujungnya masih boleh.
    await report({ from: '2025-10-31', to: '2026-10-31' });
  });

  it('tanpa login 401', async () => {
    await http().get('/api/reports/npr').expect(401);
    await http().get('/api/reports/npr/excel').expect(401);
  });

  describe('unduhan Excel', () => {
    it('berkas .xlsx berisi lembar rekap, per customer, per kategori, part, remote, dan daftar NPR', async () => {
      const res = await excel().expect(200);

      expect(res.headers['content-type']).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      expect(res.headers['content-disposition']).toBe('attachment; filename="rekap-npr-2026-10-01-2026-10-31.xlsx"');
      expect(res.headers['cache-control']).toBe('private, no-store');
      const { names, sheets } = readXlsx(res.body as Buffer);
      expect(names).toEqual(['Rekap', 'Per customer', 'Per kategori', 'Part diganti', 'Remote terbanyak', 'Daftar NPR']);

      const [rekap, , , parts, , list] = sheets as [string, string, string, string, string, string];
      expect(rowTexts(rekap, 2)).toEqual([
        ['A', 'Periode (tanggal kejadian WIB)'],
        ['B', '01/10/2026 – 31/10/2026'],
      ]);
      expect(rowTexts(rekap, 3)).toEqual([
        ['A', 'Customer'],
        ['B', 'Semua customer yang boleh dilihat'],
      ]);
      expect(rowTexts(rekap, 9)).toEqual([
        ['A', 'Jumlah NPR'],
        ['B', '5'],
      ]);
      expect(rowTexts(parts, 2)).toEqual([
        ['A', 'Modem'],
        ['B', '2'],
      ]);

      // Satu baris judul + satu baris per NPR, urutan sama dengan halaman.
      expect([...list.matchAll(/<row /g)]).toHaveLength(6);
      expect(rowTexts(list, 1).map(([, t]) => t)).toContain('Waktu kejadian (WIB)');
      const last = Object.fromEntries(rowTexts(list, 6));
      expect(last).toMatchObject({
        A: 'NPR/UJI/TNA-001/1',
        C: 'INC-77',
        D: 'Bank Uji Anggrek',
        J: 'Selesai',
        M: '135',
        O: 'Modem dan adaptor diganti',
        P: 'Adaptor, Modem',
      });
      // Waktu sebagai tanggal-waktu Excel menurut WIB: 1 Okt 2026 00.30 = 46296 + 30/1440.
      expect(Number(last.K)).toBeCloseTo(46296 + 30 / 1440, 8);
      expect(list).toContain('<autoFilter ref="A1:P6"/>');
    });

    it('teks yang mirip rumus tetap teks (tidak dijalankan Excel)', async () => {
      const { sheets } = readXlsx((await excel().expect(200)).body as Buffer);
      const list = sheets[5]!;
      expect(list).toContain('t="inlineStr"><is><t>=HYPERLINK(&quot;http://contoh.invalid&quot;,&quot;klik&quot;)</t>');
      expect(list).not.toContain('<f>');
    });

    it('dibatasi customer seperti JSON: pengguna satu customer tidak menerima data customer lain', async () => {
      const res = await excel(OKTOBER, 'hanyaA').expect(200);
      const text = readXlsx(res.body as Buffer).sheets.join('');

      expect(text).toContain('Bank Uji Anggrek');
      for (const marker of [b.name, 'TNB-001', 'TT/UJI/TNB/1', 'LNB diganti', '>LNB<']) expect(text).not.toContain(marker);
      const allText = readXlsx((await excel().expect(200)).body as Buffer).sheets.join('');
      expect(allText).toContain(b.name);
    });

    it('saringan dan judul: nama customer di lembar rekap, nama berkas dengan periode', async () => {
      const res = await excel({ from: '2026-10-15', to: '2026-10-15', tenantId: a.id, status: 'selesai' }).expect(200);
      expect(res.headers['content-disposition']).toContain('rekap-npr-2026-10-15-2026-10-15.xlsx');
      const [rekap, , , , , list] = readXlsx(res.body as Buffer).sheets as string[];
      expect(Object.fromEntries(rowTexts(rekap!, 2)).B).toBe('15/10/2026');
      expect(Object.fromEntries(rowTexts(rekap!, 3)).B).toBe('Bank Uji Anggrek');
      expect(Object.fromEntries(rowTexts(rekap!, 6)).B).toBe('Selesai');
      expect([...list!.matchAll(/<row /g)]).toHaveLength(2);
    });

    it('lebih dari batas baris: 400 sebelum berkas dimulai; koneksi dan jatah unduhan dikembalikan', async () => {
      const limits = app.get(ReportsService).exportLimits;
      limits.rows = 4;
      try {
        // Lebih banyak penolakan daripada jatah unduhan bersamaan: jatah tidak bocor.
        for (let i = 0; i < 3; i++) {
          const res = await http().get('/api/reports/npr/excel').query(OKTOBER).set('Cookie', cookies.semua).expect(400);
          expect(res.headers['content-type']).toContain('application/json');
          expect(res.body.message).toBe('Lebih dari 4 NPR dalam satu unduhan; persempit periode atau saringan.');
        }
        await excel({ ...OKTOBER, tenantId: a.id }).expect(200); // tepat 4 masih boleh
      } finally {
        limits.rows = REPORT_EXPORT_MAX_ROWS;
      }
      const idle: Array<{ n: string }> = await ds.query(
        `SELECT count(*) AS n FROM pg_stat_activity WHERE datname = current_database() AND state LIKE 'idle in transaction%'`,
      );
      expect(Number(idle[0]!.n)).toBe(0);
    });

    it('unduhan bersamaan dibatasi: 429 dengan pesan yang jelas', async () => {
      const limits = app.get(ReportsService).exportLimits;
      const before = limits.concurrent;
      limits.concurrent = 0;
      try {
        const res = await http().get('/api/reports/npr/excel').query(OKTOBER).set('Cookie', cookies.semua).expect(429);
        expect(res.body.message).toBe('Unduhan Excel lain sedang berjalan. Coba lagi sebentar lagi.');
      } finally {
        limits.concurrent = before;
      }
      await excel().expect(200);
    });

    it('parameter tidak sah: 400 JSON, bukan berkas', async () => {
      const res = await http().get('/api/reports/npr/excel?from=kemarin').set('Cookie', cookies.semua).expect(400);
      expect(res.body.message).toBe('Tanggal awal periode harus berbentuk TTTT-BB-HH.');
    });
  });
});
