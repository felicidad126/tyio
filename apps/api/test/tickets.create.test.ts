import type { INestApplication } from '@nestjs/common';
import type { OpenTicketsResponse, TicketDetail, TicketResponse } from '@tyio/shared';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AuditEntryEntity } from '../src/common/audit/audit-entry.entity.js';
import { SystemEntity, TicketCategoryEntity } from '../src/modules/master/master.entities.js';
import type { Remote } from '../src/modules/remotes/remote.entity.js';
import type { Tenant } from '../src/modules/tenants/tenant.entity.js';
import { ticketPeriod } from '../src/modules/tickets/ticket-number.js';
import { TicketEntity } from '../src/modules/tickets/ticket.entity.js';
import { createTestApp } from './create-test-app.js';
import { resetData } from './db.js';
import {
  asTester,
  createRemote,
  createTenant,
  createUser,
  ensureCategory,
  ensureJarkom,
  sessionCookieFrom,
  TEST_PASSWORD,
} from './fixtures.js';

describe('buat tiket (NPR)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let a: Tenant;
  let b: Tenant;
  let remote: Remote;
  let category: { id: string };
  let cookie: string;

  beforeAll(async () => {
    app = await createTestApp();
    ds = app.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetData(ds);
    a = await createTenant(ds, 'TNA', 'Bank Uji Anggrek');
    b = await createTenant(ds, 'TNB', 'Bank Uji Bakung');
    const vsat = await ensureJarkom(ds, 'VSAT', 'VSAT');
    remote = await createRemote(ds, a, 'TNA-001', {
      name: 'ATM Uji Pantai',
      jarkomId: vsat.id,
      city: 'Makassar',
      province: 'Sulawesi Selatan',
      timeZone: 'Asia/Makassar',
    });
    category = await ensureCategory(ds, 'RD', 'Remote Down');
    await createUser(ds, { username: 'l1.anggrek', displayName: 'Operator Anggrek', allTenants: false, tenants: [a] });
    cookie = await loginAs('l1.anggrek');
  });

  const http = () => request(app.getHttpServer());
  async function loginAs(username: string): Promise<string> {
    const res = await http().post('/api/auth/login').send({ username, password: TEST_PASSWORD }).expect(200);
    return sessionCookieFrom(res.headers['set-cookie']);
  }

  const occurredAt = '2026-11-17T01:15:00.000Z';
  const create = (body: Record<string, unknown> = {}, who = cookie) =>
    http()
      .post('/api/tickets')
      .set('Cookie', who)
      .send({ remoteId: remote.id, categoryId: category.id, occurredAt, problem: 'Remote down sejak pagi', ...body });
  const createOk = async (body: Record<string, unknown> = {}) =>
    ((await create(body).expect(201)).body as TicketResponse).ticket;
  const period = () => ticketPeriod(new Date()).replace('-', '/');

  it('membuat tiket bernomor NPR/<jarkom>/<customer>/<tahun>/<bulan>/0001 dengan data remote', async () => {
    const ticket = await createOk();

    expect(ticket).toEqual<TicketDetail>({
      id: expect.any(String),
      number: `NPR/VSAT/TNA/${period()}/0001`,
      status: 'terbuka',
      tenant: { id: a.id, code: 'TNA', name: 'Bank Uji Anggrek' },
      remote: {
        id: remote.id,
        siteId: 'TNA-001',
        name: 'ATM Uji Pantai',
        city: 'Makassar',
        province: 'Sulawesi Selatan',
        timeZone: 'Asia/Makassar',
        status: 'aktif',
      },
      jarkom: { id: expect.any(String), code: 'VSAT', name: 'VSAT' },
      category: { id: category.id, code: 'RD', name: 'Remote Down' },
      system: null,
      occurredAt,
      problem: 'Remote down sejak pagi',
      createdBy: { id: expect.any(String), displayName: 'Operator Anggrek' },
      createdAt: expect.any(String),
      customerTicketNumber: null,
      pending: null,
    });
    const detail = await http().get(`/api/tickets/${ticket.id}`).set('Cookie', cookie).expect(200);
    expect((detail.body as TicketResponse).ticket).toEqual(ticket);
  });

  it('nomor urut per customer, jarkom, dan bulan', async () => {
    const other = await createRemote(ds, a, 'TNA-002', { jarkomId: remote.jarkomId });
    const lain = await ensureJarkom(ds, 'LAIN', 'Jarkom Lain');
    const otherJarkom = await createRemote(ds, a, 'TNA-003', { jarkomId: lain.id });
    const remoteB = await createRemote(ds, b, 'TNB-001', { jarkomId: remote.jarkomId });
    const l2 = await (async () => {
      await createUser(ds, { username: 'l2.uji', role: 'L2' });
      return loginAs('l2.uji');
    })();

    await createOk();
    const second = await createOk({ remoteId: other.id });
    const third = (await create({ remoteId: otherJarkom.id }).expect(201)).body.ticket;
    const forB = (await create({ remoteId: remoteB.id }, l2).expect(201)).body.ticket;

    expect(second.number).toBe(`NPR/VSAT/TNA/${period()}/0002`);
    expect(third.number).toBe(`NPR/LAIN/TNA/${period()}/0001`);
    expect(forB.number).toBe(`NPR/VSAT/TNB/${period()}/0001`);
  });

  it('bulan nomor mengikuti WIB saat tiket dibuat', () => {
    expect(ticketPeriod(new Date('2026-11-30T16:59:59Z'))).toBe('2026-11');
    expect(ticketPeriod(new Date('2026-11-30T17:00:00Z'))).toBe('2026-12');
    expect(ticketPeriod(new Date('2026-12-31T17:00:00Z'))).toBe('2027-01');
  });

  it('dua puluh operator menyimpan bersamaan: nomor unik, berurutan, tanpa celah', async () => {
    const remotes = await Promise.all(
      Array.from({ length: 20 }, (_, i) => createRemote(ds, a, `TNA-P${String(i).padStart(2, '0')}`, { jarkomId: remote.jarkomId })),
    );

    const results = await Promise.all(remotes.map((r) => create({ remoteId: r.id })));

    expect(results.map((r) => r.status)).toEqual(Array(20).fill(201));
    const numbers = results.map((r) => (r.body as TicketResponse).ticket.number).sort();
    expect(numbers).toEqual(
      Array.from({ length: 20 }, (_, i) => `NPR/VSAT/TNA/${period()}/${String(i + 1).padStart(4, '0')}`),
    );
  });

  it('remote dengan tiket terbuka: 409 berisi tiket itu; setelah dikonfirmasi, tiket dibuat tanpa celah nomor', async () => {
    const first = await createOk();

    const warned = await create().expect(409);
    expect(warned.body).toMatchObject({
      message: 'Remote ini masih punya 1 tiket terbuka. Periksa dulu, atau konfirmasi untuk tetap membuat tiket baru.',
      openTickets: [{ id: first.id, number: first.number }],
    });

    const second = await createOk({ confirmOpenTickets: true });
    expect(second.number).toBe(`NPR/VSAT/TNA/${period()}/0002`);
  });

  it('dua operator bersamaan untuk remote yang sama tanpa konfirmasi: satu dibuat, satu diperingatkan', async () => {
    const results = await Promise.all([create(), create()]);

    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await ds.getRepository(TicketEntity).count()).toBe(1);
  });

  it('daftar tiket terbuka per remote, untuk peringatan di form', async () => {
    const ticket = await createOk();

    const res = await http().get(`/api/remotes/${remote.id}/open-tickets`).set('Cookie', cookie).expect(200);

    expect((res.body as OpenTicketsResponse).tickets).toEqual([
      {
        id: ticket.id,
        number: ticket.number,
        status: 'terbuka',
        tenant: ticket.tenant,
        category: ticket.category,
        occurredAt,
        createdAt: ticket.createdAt,
      },
    ]);
  });

  it('system opsional: disimpan bila dipilih', async () => {
    const system = await asTester(ds, (m) => m.getRepository(SystemEntity).save({ code: 'SYA', name: 'System A' }));

    const ticket = await createOk({ systemId: system.id });

    expect(ticket.system).toEqual({ id: system.id, code: 'SYA', name: 'System A' });
  });

  describe('isian ditolak', () => {
    it.each<[Record<string, unknown>, string, RegExp]>([
      [{ remoteId: undefined }, 'remoteId', /Pilih remote/],
      [{ categoryId: 'bukan-uuid' }, 'categoryId', /Pilih kategori/],
      [{ categoryId: '01900000-0000-7000-8000-0000000000aa' }, 'categoryId', /Kategori tidak ditemukan/],
      [{ systemId: '01900000-0000-7000-8000-0000000000aa' }, 'systemId', /System tidak ditemukan/],
      [{ occurredAt: 'kemarin' }, 'occurredAt', /Isi waktu kejadian/],
      [{ occurredAt: new Date(Date.now() + 60 * 60_000).toISOString() }, 'occurredAt', /masa depan/],
      [{ occurredAt: '2019-12-31T00:00:00Z' }, 'occurredAt', /terlalu lama/],
      [{ problem: ' a ' }, 'problem', /Keterangan 3–4.000 karakter/],
      [{ problem: 'x'.repeat(4001) }, 'problem', /Keterangan 3–4.000 karakter/],
      [{ prioritas: 'tinggi' }, 'prioritas', /Kolom tidak dikenal: prioritas/],
      [{ confirmOpenTickets: 'ya' }, 'confirmOpenTickets', /true atau false/],
    ])('%o → kolom %s', async (body, field, message) => {
      const res = await create(body).expect(400);

      expect(res.body).toMatchObject({ field, message: expect.stringMatching(message) });
      expect(await ds.getRepository(TicketEntity).count()).toBe(0);
    });

    it('kategori nonaktif ditolak', async () => {
      await asTester(ds, (m) => m.getRepository(TicketCategoryEntity).update(category.id, { active: false }));
      expect((await create().expect(400)).body).toMatchObject({ field: 'categoryId', message: 'Kategori RD nonaktif.' });
    });

    it('remote yang dibongkar dan customer nonaktif tidak bisa dibuatkan tiket', async () => {
      const gone = await createRemote(ds, a, 'TNA-OLD', { status: 'dibongkar' });
      expect((await create({ remoteId: gone.id }).expect(400)).body.message).toBe(
        'Remote TNA-OLD sudah dibongkar; tiket tidak bisa dibuat.',
      );

      // Pengguna yang dibatasi ke customer itu tidak lagi melihatnya; pengguna semua customer
      // masih melihat remote-nya, tetapi tidak bisa membuat tiket baru.
      await asTester(ds, (m) => m.getRepository('Tenant').update(a.id, { active: false }));
      await create().expect(404);
      await createUser(ds, { username: 'l2.uji', role: 'L2' });
      expect((await create({}, await loginAs('l2.uji')).expect(400)).body.message).toBe(
        'Customer Bank Uji Anggrek nonaktif; tiket tidak bisa dibuat.',
      );
      expect(await ds.getRepository(TicketEntity).count()).toBe(0);
    });

    it('remote customer lain dijawab 404 dan tidak ada tiket yang dibuat', async () => {
      const remoteB = await createRemote(ds, b, 'TNB-001');

      await create({ remoteId: remoteB.id }).expect(404);

      expect(await ds.getRepository(TicketEntity).count()).toBe(0);
    });
  });

  it('pembuatan tiket tercatat di audit log atas nama operator', async () => {
    const ticket = await createOk();

    const rows = await ds.getRepository(AuditEntryEntity).findBy({ tableName: 'tickets', rowId: ticket.id });
    expect(rows.map((r) => [r.action, r.actor, r.tenantId])).toEqual([['insert', 'pengguna:l1.anggrek', a.id]]);
  });
});
