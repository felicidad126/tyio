import type { INestApplication } from '@nestjs/common';
import type { TicketListResponse, TicketStatus, TicketView } from '@tyio/shared';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SystemEntity } from '../src/modules/master/master.entities.js';
import type { Remote } from '../src/modules/remotes/remote.entity.js';
import type { Tenant } from '../src/modules/tenants/tenant.entity.js';
import { TicketActionEntity } from '../src/modules/tickets/ticket-action.entity.js';
import type { Ticket } from '../src/modules/tickets/ticket.entity.js';
import type { User } from '../src/modules/users/user.entity.js';
import { createTestApp } from './create-test-app.js';
import { resetData } from './db.js';
import {
  asTester,
  createRemote,
  createTenant,
  createTicket,
  createUser,
  ensureCategory,
  ensureJarkom,
  sessionCookieFrom,
  TEST_PASSWORD,
} from './fixtures.js';

describe('daftar tiket', () => {
  let app: INestApplication;
  let ds: DataSource;
  let a: Tenant;
  let b: Tenant;
  let me: User;
  let other: User;
  let cookie: string;
  let cookieA: string;
  let systemId: string;
  let otherCategoryId: string;
  let otherJarkomId: string;
  const t: Record<string, Ticket> = {};

  const at = (day: number) => new Date(Date.UTC(2026, 10, day, 1, 0));
  const http = () => request(app.getHttpServer());
  const list = (query: Record<string, string> = {}, who = cookie) =>
    http().get('/api/tickets').query(query).set('Cookie', who);
  const numbers = (res: request.Response) => (res.body as TicketListResponse).items.map((i) => i.number);

  async function action(ticket: Ticket, by: User, occurredAt: Date, note: string | null, statusTo?: TicketStatus) {
    await asTester(ds, (m) =>
      m.getRepository(TicketActionEntity).save({
        tenantId: ticket.tenantId,
        ticketId: ticket.id,
        occurredAt,
        note,
        statusTo: statusTo ?? null,
        createdById: by.id,
      }),
    );
  }

  beforeAll(async () => {
    app = await createTestApp();
    ds = app.get(DataSource);
    await resetData(ds);

    a = await createTenant(ds, 'TNA', 'Bank Uji Anggrek');
    b = await createTenant(ds, 'TNB', 'Bank Uji Bakung');
    me = await createUser(ds, { username: 'l1.saya', displayName: 'Operator Saya' });
    other = await createUser(ds, { username: 'l1.rekan', displayName: 'Operator Rekan' });
    await createUser(ds, { username: 'l1.hanya-a', allTenants: false, tenants: [a] });
    cookie = sessionCookieFrom(
      (await http().post('/api/auth/login').send({ username: 'l1.saya', password: TEST_PASSWORD }).expect(200)).headers[
        'set-cookie'
      ],
    );
    cookieA = sessionCookieFrom(
      (await http().post('/api/auth/login').send({ username: 'l1.hanya-a', password: TEST_PASSWORD }).expect(200))
        .headers['set-cookie'],
    );

    await ensureCategory(ds);
    otherCategoryId = (await ensureCategory(ds, 'CM', 'Corrective Maintenance')).id;
    otherJarkomId = (await ensureJarkom(ds, 'VSAT', 'VSAT')).id;
    systemId = (await asTester(ds, (m) => m.getRepository(SystemEntity).save({ code: 'SYS', name: 'Sistem Uji' }))).id;

    const pasar: Remote = await createRemote(ds, a, 'ANG-001', { name: 'ATM Pasar Raya', city: 'Ambon' });
    const kantor: Remote = await createRemote(ds, a, 'ANG-002', { name: 'Kantor Kas 50%_Diskon', jarkomId: otherJarkomId });
    const bakung: Remote = await createRemote(ds, b, 'BKG-001', { name: 'ATM Bakung Timur' });

    // Waktu kejadian berbeda agar urutan bisa diperiksa: hari lebih besar = lebih baru.
    t.terbuka = await createTicket(ds, pasar, 'NPR/UJI/TNA/2026/11/0001', { occurredAt: at(1), createdById: me.id });
    t.dikerjakan = await createTicket(ds, kantor, 'NPR/UJI/TNA/2026/11/0002', {
      occurredAt: at(2),
      status: 'dikerjakan',
      createdById: other.id,
      customerTicketNumber: 'INC-778899',
    });
    t.pending = await createTicket(ds, pasar, 'NPR/UJI/TNA/2026/11/0003', {
      occurredAt: at(3),
      status: 'pending',
      pendingParty: 'customer',
      pendingReason: 'Menunggu PLN',
      createdById: other.id,
      categoryId: otherCategoryId,
    });
    t.eskalasi = await createTicket(ds, pasar, 'NPR/UJI/TNA/2026/11/0004', {
      occurredAt: at(4),
      status: 'eskalasi',
      createdById: other.id,
      systemId,
    });
    t.selesai = await createTicket(ds, pasar, 'NPR/UJI/TNA/2026/11/0005', {
      occurredAt: at(5),
      status: 'selesai',
      createdById: me.id,
    });
    t.bakung = await createTicket(ds, bakung, 'NPR/UJI/TNB/2026/11/0001', { occurredAt: at(6), createdById: other.id });

    // Saya memberi tindakan pada tiket rekan yang masih dikerjakan: masuk "Milik saya".
    await action(t.dikerjakan, other, at(2), null, 'dikerjakan');
    await action(t.dikerjakan, me, new Date(Date.UTC(2026, 10, 2, 3, 0)), `Cek lokasi. ${'x'.repeat(200)}`);
    // Tindakan saya pada tiket yang sudah selesai tidak membuatnya masuk "Milik saya".
    await action(t.selesai, me, at(5), 'Sudah normal', 'selesai');
  });

  afterAll(async () => {
    await app.close();
  });

  it('tanpa parameter = tampilan Aktif, terbaru menurut waktu kejadian, dengan jumlah per tampilan', async () => {
    const res = await list().expect(200);
    const body = res.body as TicketListResponse;

    expect(numbers(res)).toEqual([
      'NPR/UJI/TNB/2026/11/0001',
      'NPR/UJI/TNA/2026/11/0004',
      'NPR/UJI/TNA/2026/11/0003',
      'NPR/UJI/TNA/2026/11/0002',
      'NPR/UJI/TNA/2026/11/0001',
    ]);
    expect(body.total).toBe(5);
    expect(body.pageSize).toBe(50);
    // Jumlah hanya untuk tampilan antrean; riwayat (Selesai, Semua) dihitung saat dibuka.
    expect(body.counts).toEqual({ aktif: 5, saya: 2, pending: 1, eskalasi: 1 });
  });

  it('setiap baris memuat remote, customer, pending, pembuat, dan tindakan terakhir dengan catatan dipotong', async () => {
    const body = (await list({ view: 'semua' }).expect(200)).body as TicketListResponse;
    const byNumber = new Map(body.items.map((i) => [i.number, i]));

    const pending = byNumber.get('NPR/UJI/TNA/2026/11/0003')!;
    expect(pending.status).toBe('pending');
    expect(pending.pending).toEqual({ party: 'customer', reason: 'Menunggu PLN' });
    expect(pending.remote).toMatchObject({ siteId: 'ANG-001', name: 'ATM Pasar Raya', city: 'Ambon' });
    expect(pending.tenant).toMatchObject({ code: 'TNA', name: 'Bank Uji Anggrek' });
    expect(pending.category.code).toBe('CM');
    expect(pending.createdBy.displayName).toBe('Operator Rekan');
    expect(pending.lastAction).toBeNull();

    expect(byNumber.get('NPR/UJI/TNA/2026/11/0004')!.system).toMatchObject({ code: 'SYS' });
    const worked = byNumber.get('NPR/UJI/TNA/2026/11/0002')!;
    expect(worked.customerTicketNumber).toBe('INC-778899');
    expect(worked.lastAction).toMatchObject({
      occurredAt: '2026-11-02T03:00:00.000Z',
      createdBy: { displayName: 'Operator Saya' },
      statusTo: null,
    });
    expect(worked.lastAction!.note).toHaveLength(140);
    expect(worked.lastAction!.note!.startsWith('Cek lokasi.')).toBe(true);
  });

  it.each<[TicketView, string[]]>([
    ['pending', ['NPR/UJI/TNA/2026/11/0003']],
    ['eskalasi', ['NPR/UJI/TNA/2026/11/0004']],
    ['selesai', ['NPR/UJI/TNA/2026/11/0005']],
    // Tiket aktif yang saya buat atau pernah saya beri tindakan; yang selesai tidak.
    ['saya', ['NPR/UJI/TNA/2026/11/0002', 'NPR/UJI/TNA/2026/11/0001']],
  ])('tampilan %s', async (view, expected) => {
    const res = await list({ view }).expect(200);
    expect(numbers(res)).toEqual(expected);
    expect((res.body as TicketListResponse).total).toBe(expected.length);
  });

  it('tampilan Semua memuat semua status, dengan total sendiri', async () => {
    const res = await list({ view: 'semua' }).expect(200);
    expect(numbers(res)).toHaveLength(6);
    expect((res.body as TicketListResponse).total).toBe(6);
    expect((res.body as TicketListResponse).counts).toEqual({ aktif: 5, saya: 2, pending: 1, eskalasi: 1 });
  });

  it('saringan customer, kategori, system, dan jarkom; jumlah per tampilan ikut saringan', async () => {
    const byTenant = (await list({ view: 'semua', tenantId: b.id }).expect(200)).body as TicketListResponse;
    expect(byTenant.items.map((i) => i.number)).toEqual(['NPR/UJI/TNB/2026/11/0001']);
    expect(byTenant.total).toBe(1);
    expect(byTenant.counts).toEqual({ aktif: 1, saya: 0, pending: 0, eskalasi: 0 });

    expect(numbers(await list({ view: 'semua', categoryId: otherCategoryId }).expect(200))).toEqual([
      'NPR/UJI/TNA/2026/11/0003',
    ]);
    expect(numbers(await list({ view: 'semua', systemId }).expect(200))).toEqual(['NPR/UJI/TNA/2026/11/0004']);
    expect(numbers(await list({ view: 'semua', jarkomId: otherJarkomId }).expect(200))).toEqual([
      'NPR/UJI/TNA/2026/11/0002',
    ]);
  });

  it.each([
    ['potongan nomor NPR', '11/0004', ['NPR/UJI/TNA/2026/11/0004']],
    ['nomor NPR lengkap', 'NPR/UJI/TNB/2026/11/0001', ['NPR/UJI/TNB/2026/11/0001']],
    ['nomor tiket customer, huruf kecil', 'inc-7788', ['NPR/UJI/TNA/2026/11/0002']],
    ['Site ID remote', 'ANG-002', ['NPR/UJI/TNA/2026/11/0002']],
    ['nama remote', 'pasar raya', ['NPR/UJI/TNA/2026/11/0005', 'NPR/UJI/TNA/2026/11/0004', 'NPR/UJI/TNA/2026/11/0003', 'NPR/UJI/TNA/2026/11/0001']],
    ['kota remote', 'ambon', ['NPR/UJI/TNA/2026/11/0005', 'NPR/UJI/TNA/2026/11/0004', 'NPR/UJI/TNA/2026/11/0003', 'NPR/UJI/TNA/2026/11/0001']],
    // % dan _ dicari apa adanya, bukan sebagai wildcard.
    ['tanda % dan _ apa adanya', '50%_', ['NPR/UJI/TNA/2026/11/0002']],
    ['_ tidak cocok dengan sembarang karakter', 'ANG_00', []],
  ])('cari: %s', async (_, q, expected) => {
    expect(numbers(await list({ view: 'semua', q }).expect(200))).toEqual(expected);
  });

  it('pencarian ikut membatasi jumlah per tampilan', async () => {
    const body = (await list({ q: 'pasar raya' }).expect(200)).body as TicketListResponse;
    expect(body.counts).toEqual({ aktif: 3, saya: 1, pending: 1, eskalasi: 1 });
    expect(((await list({ q: 'pasar raya', view: 'selesai' }).expect(200)).body as TicketListResponse).total).toBe(1);
    expect(((await list({ q: 'pasar raya', view: 'semua' }).expect(200)).body as TicketListResponse).total).toBe(4);
  });

  it('pengguna yang dibatasi ke satu customer hanya melihat tiket dan jumlah customer itu', async () => {
    const body = (await list({ view: 'semua' }, cookieA).expect(200)).body as TicketListResponse;
    expect(body.items.every((i) => i.tenant.id === a.id)).toBe(true);
    expect(body.total).toBe(5);
    expect(body.counts.aktif).toBe(4);
    const other = (await list({ view: 'semua', tenantId: b.id }, cookieA).expect(200)).body as TicketListResponse;
    expect(other.items).toEqual([]);
    expect(other.total).toBe(0);
    expect(other.counts.aktif).toBe(0);
  });

  it('50 per halaman dengan total; halaman berikutnya melanjutkan tanpa tumpang tindih', async () => {
    const remote = await createRemote(ds, a, 'ANG-100', { name: 'Remote Banyak' });
    for (let i = 1; i <= 55; i++) {
      // Waktu kejadian sama untuk semua: urutan tetap stabil (id sebagai penentu).
      await createTicket(ds, remote, `NPR/UJI/TNA/2026/10/${String(i).padStart(4, '0')}`, { occurredAt: at(20) });
    }
    const first = (await list({ q: 'Remote Banyak' }).expect(200)).body as TicketListResponse;
    const second = (await list({ q: 'Remote Banyak', page: '2' }).expect(200)).body as TicketListResponse;

    expect(first.total).toBe(55);
    expect(first.items).toHaveLength(50);
    expect(second.items).toHaveLength(5);
    expect(second.page).toBe(2);
    const all = [...first.items, ...second.items].map((i) => i.id);
    expect(new Set(all).size).toBe(55);
    // Waktu kejadian sama: yang terakhir dicatat lebih dulu (id uuidv7 urut waktu), sehingga
    // urutan tidak berubah antarpermintaan dan antarhalaman.
    expect(all).toEqual([...all].sort().reverse());
  });

  it.each([
    [{ view: 'tutup' }, /Tampilan harus salah satu dari/],
    [{ page: '0' }, /Halaman harus bilangan bulat/],
    [{ page: 'dua' }, /Halaman harus bilangan bulat/],
    [{ tenantId: 'bukan-uuid' }, /Customer tidak sah/],
    [{ categoryId: '123' }, /Kategori tidak sah/],
    [{ urut: 'lama' }, /Parameter tidak dikenal: urut/],
    [{ q: 'x'.repeat(101) }, /paling banyak 100/],
  ])('parameter salah %j dijawab 400', async (query, message) => {
    const res = await list(query as Record<string, string>).expect(400);
    expect(res.body.message).toMatch(message);
  });

  it('parameter yang diulang dijawab 400', async () => {
    const res = await http().get('/api/tickets?view=aktif&view=semua').set('Cookie', cookie).expect(400);
    expect(res.body.message).toMatch(/hanya boleh satu nilai/);
  });
});
