import type { INestApplication } from '@nestjs/common';
import { addDays, type OverviewResponse, type TicketListResponse, wibDate, wibDayStart } from '@tyio/shared';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Tenant } from '../src/modules/tenants/tenant.entity.js';
import { createTestApp } from './create-test-app.js';
import { resetData } from './db.js';
import {
  createRemote,
  createTenant,
  createTicket,
  createTroubleTicket,
  createUser,
  ensureCategory,
  sessionCookieFrom,
  TEST_PASSWORD,
} from './fixtures.js';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// Overview (2.1): setiap angka sama persis dengan jumlah di daftar Tiket yang dituju tautannya,
// dan dibatasi customer seperti daftar.
describe('Overview', () => {
  let app: INestApplication;
  let ds: DataSource;
  let a: Tenant;
  let b: Tenant;
  const cookies: Record<'semua' | 'hanyaA', string> = { semua: '', hanyaA: '' };
  const now = Date.now();
  const ago = (ms: number) => new Date(now - ms);
  const today = wibDate(new Date(now));

  const http = () => request(app.getHttpServer());
  const overview = async (who: keyof typeof cookies = 'semua') =>
    (await http().get('/api/overview').set('Cookie', cookies[who]).expect(200)).body as OverviewResponse;
  const total = async (query: Record<string, string>, who: keyof typeof cookies = 'semua') =>
    ((await http().get('/api/tickets').query(query).set('Cookie', cookies[who]).expect(200)).body as TicketListResponse)
      .total;

  beforeAll(async () => {
    app = await createTestApp();
    ds = app.get(DataSource);
    await resetData(ds);
    a = await createTenant(ds, 'TNA', 'Bank Uji Anggrek');
    b = await createTenant(ds, 'TNB', 'Bank Uji Rahasia');
    const rd = await ensureCategory(ds, 'RD', 'Remote Down');
    const rl = await ensureCategory(ds, 'RL', 'Relokasi');
    const a1 = await createRemote(ds, a, 'TNA-001');
    const a2 = await createRemote(ds, a, 'TNA-002');
    const b1 = await createRemote(ds, b, 'TNB-001');
    let n = 0;
    const ticket = (remote: typeof a1, overrides: Parameters<typeof createTicket>[3]) =>
      createTicket(ds, remote, `NPR/UJI/${remote.siteId}/${++n}`, { categoryId: rd.id, ...overrides });

    await ticket(a1, { occurredAt: ago(HOUR) });
    await ticket(a1, { status: 'dikerjakan', occurredAt: ago(2 * DAY) });
    await ticket(a2, { status: 'pending', pendingParty: 'tm', pendingReason: 'Menunggu teknisi', occurredAt: ago(8 * DAY) });
    const withTt = await ticket(a2, { status: 'eskalasi', categoryId: rl.id, occurredAt: ago(10 * DAY) });
    await createTroubleTicket(ds, withTt, 'TT/UJI/TNA/1');
    await ticket(a1, { status: 'selesai', occurredAt: ago(3 * DAY), closedAt: ago(2 * DAY) });
    await ticket(a1, { status: 'selesai', occurredAt: ago(40 * DAY), closedAt: ago(39 * DAY) });
    await ticket(a1, { occurredAt: ago(20 * DAY) });
    // Tepat lewat 7 hari: sudah "Down ≥ 7 hari"; membuat TNA-002 sama banyak dengan TNA-001.
    await ticket(a2, { status: 'dikerjakan', occurredAt: ago(7 * DAY + HOUR) });
    await ticket(b1, { occurredAt: ago(DAY) });
    // Batas hari WIB: 23.59.59 kemarin dan 00.00 hari ini.
    const midnight = wibDayStart(today);
    await ticket(a2, { status: 'selesai', occurredAt: new Date(midnight.getTime() - 1000), closedAt: midnight });

    await createUser(ds, { username: 'helpdesk.semua', allTenants: true });
    await createUser(ds, { username: 'helpdesk.a', allTenants: false, tenants: [a] });
    for (const [key, username] of [
      ['semua', 'helpdesk.semua'],
      ['hanyaA', 'helpdesk.a'],
    ] as const) {
      const res = await http().post('/api/auth/login').send({ username, password: TEST_PASSWORD }).expect(200);
      cookies[key] = sessionCookieFrom(res.headers['set-cookie']);
    }
  });

  afterAll(async () => {
    await app.close();
  });

  it('angka tiket aktif: per status, TT aktif, dan Down ≥ 7 hari', async () => {
    const o = await overview();

    expect(o.today).toBe(today);
    expect(o.active).toEqual({
      total: 7,
      byStatus: { terbuka: 3, dikerjakan: 2, pending: 1, eskalasi: 1 },
      tt: 1,
      flagged: 4,
    });
    expect(o.byCategory.map((x) => [x.category.code, x.count])).toEqual([
      ['RD', 6],
      ['RL', 1],
    ]);
    expect(o.byCustomer.map((x) => [x.tenant.code, x.count])).toEqual([
      ['TNA', 6],
      ['TNB', 1],
    ]);
  });

  it('setiap angka sama persis dengan total daftar Tiket yang dituju tautannya', async () => {
    const o = await overview();
    const pairs: Array<[number, Record<string, string>]> = [
      [o.active.total, { view: 'aktif' }],
      [o.active.byStatus.terbuka, { view: 'aktif', status: 'terbuka' }],
      [o.active.byStatus.dikerjakan, { view: 'aktif', status: 'dikerjakan' }],
      [o.active.byStatus.pending, { view: 'pending' }],
      [o.active.byStatus.eskalasi, { view: 'eskalasi' }],
      [o.active.tt, { view: 'tt' }],
      [o.active.flagged, { view: 'aktif', flagged: 'true' }],
      // "Down ≥ 7 hari" hanya tiket aktif, juga di tampilan Semua.
      [o.active.flagged, { view: 'semua', flagged: 'true' }],
      ...o.byCategory.map((x): [number, Record<string, string>] => [x.count, { view: 'aktif', categoryId: x.category.id }]),
      ...o.byCustomer.map((x): [number, Record<string, string>] => [x.count, { view: 'aktif', tenantId: x.tenant.id }]),
      ...o.trend.flatMap((d): Array<[number, Record<string, string>]> => [
        [d.opened, { view: 'semua', occurredFrom: d.date, occurredTo: d.date }],
        [d.closed, { view: 'selesai', closedFrom: d.date, closedTo: d.date }],
      ]),
      ...o.topRemotes.items.map((x): [number, Record<string, string>] => [
        x.count,
        { view: 'semua', remoteId: x.remote.id, occurredFrom: o.topRemotes.from, occurredTo: o.topRemotes.to },
      ]),
    ];
    for (const [count, query] of pairs) expect(await total(query), JSON.stringify(query)).toBe(count);
  });

  it('tren 14 hari menurut hari WIB (hari kosong ikut) dan remote dengan NPR terbanyak 30 hari', async () => {
    const o = await overview();

    expect(o.trend).toHaveLength(14);
    expect(o.trend[0]!.date).toBe(addDays(today, -13));
    expect(o.trend[13]!.date).toBe(today);
    const at = (date: string) => o.trend.find((d) => d.date === date)!;
    // 23.59.59 WIB kemarin dihitung kemarin; online kembali 00.00 WIB dihitung hari ini.
    expect(at(addDays(today, -1)).opened).toBeGreaterThanOrEqual(1);
    expect(at(today).closed).toBe(1);
    expect(o.trend.reduce((sum, d) => sum + d.opened, 0)).toBe(8);
    expect(o.trend.reduce((sum, d) => sum + d.closed, 0)).toBe(2);
    expect(o.topRemotes).toMatchObject({ from: addDays(today, -29), to: today });
    // Jumlah sama: urut Site ID.
    expect(o.topRemotes.items.map((x) => [x.remote.siteId, x.tenant.code, x.count])).toEqual([
      ['TNA-001', 'TNA', 4],
      ['TNA-002', 'TNA', 4],
      ['TNB-001', 'TNB', 1],
    ]);
  });

  it('pengguna yang dibatasi ke satu customer hanya melihat angka customernya', async () => {
    const o = await overview('hanyaA');

    expect(o.active.total).toBe(6);
    expect(o.byCustomer.map((x) => x.tenant.code)).toEqual(['TNA']);
    expect(o.topRemotes.items.map((x) => x.remote.siteId)).toEqual(['TNA-001', 'TNA-002']);
    const body = JSON.stringify(o);
    for (const marker of [b.id, b.code, b.name, 'TNB-001']) expect(body).not.toContain(marker);
    expect(await total({ view: 'aktif' }, 'hanyaA')).toBe(6);
  });

  it('saringan daftar yang salah dijawab 400 dengan pesan jelas', async () => {
    const bad: Array<[Record<string, string>, RegExp]> = [
      [{ status: 'tutup' }, /Status harus salah satu dari/],
      [{ occurredFrom: '2026-02-30' }, /Tanggal kejadian harus berbentuk/],
      [{ closedTo: '18-11-2026' }, /Tanggal online kembali harus berbentuk/],
      [{ occurredFrom: '2026-11-18', occurredTo: '2026-11-17' }, /"dari" tidak boleh setelah "sampai"/],
      [{ flagged: '1' }, /flagged hanya boleh "true"/],
    ];
    for (const [query, message] of bad) {
      const res = await http().get('/api/tickets').query(query).set('Cookie', cookies.semua);
      expect(res.status, JSON.stringify(query)).toBe(400);
      expect(res.body.message).toMatch(message);
    }
    expect((await http().get('/api/overview?x=1').set('Cookie', cookies.semua).expect(400)).body.message).toBe(
      'Parameter tidak dikenal: x.',
    );
    await http().get('/api/overview').expect(401);
  });
});
