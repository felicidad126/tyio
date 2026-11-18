import type { INestApplication } from '@nestjs/common';
import type {
  SearchResponse,
  TicketActionsResponse,
  TicketDetail,
  TicketListResponse,
  TicketResponse,
  TroubleTicketSummaryResponse,
} from '@tyio/shared';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AuditEntryEntity } from '../src/common/audit/audit-entry.entity.js';
import type { Remote } from '../src/modules/remotes/remote.entity.js';
import type { Tenant } from '../src/modules/tenants/tenant.entity.js';
import { ticketPeriod } from '../src/modules/tickets/ticket-number.js';
import { TroubleTicketEntity } from '../src/modules/trouble-tickets/trouble-ticket.entity.js';
import { troubleTicketSummary } from '../src/modules/trouble-tickets/tt-summary.js';
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
  TINY_PNG,
} from './fixtures.js';

describe('Trouble Ticket (Eskalasi To SD)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let a: Tenant;
  let remote: Remote;
  let categoryId: string;
  let cookie: string;
  let other: string;

  const http = () => request(app.getHttpServer());
  const login = async (username: string) =>
    sessionCookieFrom(
      (await http().post('/api/auth/login').send({ username, password: TEST_PASSWORD }).expect(200)).headers['set-cookie'],
    );
  const newTicket = async (): Promise<TicketDetail> =>
    (
      (
        await http()
          .post('/api/tickets')
          .set('Cookie', cookie)
          .send({
            remoteId: remote.id,
            categoryId,
            occurredAt: new Date().toISOString(),
            problem: 'Remote down',
            confirmOpenTickets: true,
          })
          .expect(201)
      ).body as TicketResponse
    ).ticket;
  const openTt = (ticket: { id: string }, body: Record<string, unknown>, who = cookie) =>
    http().post(`/api/tickets/${ticket.id}/tt`).set('Cookie', who).send(body);
  const timeline = async (id: string) =>
    ((await http().get(`/api/tickets/${id}/actions`).set('Cookie', cookie).expect(200)).body as TicketActionsResponse)
      .actions;
  const period = () => ticketPeriod(new Date()).replace('-', '/');
  const PROBLEM = 'Modem VSAT mati, perlu cek BUC dan LNB';

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
    await ensureJarkom(ds, 'VSAT', 'VSAT');
    const vsat = await ensureJarkom(ds, 'VSAT');
    remote = await createRemote(ds, a, 'TNA-001', {
      name: 'ATM Pasar Raya',
      jarkomId: vsat.id,
      address: 'Jl. Merdeka 1',
      city: 'Ambon',
      province: 'Maluku',
      timeZone: 'Asia/Jayapura',
      ipSnmp: '10.1.2.3',
      contacts: [{ name: 'Pak Budi', role: 'Pengelola', phone: '0812000111', email: null }],
    });
    categoryId = (await ensureCategory(ds)).id;
    await createUser(ds, { username: 'helpdesk.uji', displayName: 'Helpdesk Uji' });
    await createUser(ds, { username: 'helpdesk.lain', displayName: 'Helpdesk Lain' });
    cookie = await login('helpdesk.uji');
    other = await login('helpdesk.lain');
  });

  it('membuka TT bernomor TT/<jarkom>/<customer>/<tahun>/<bulan>/0001; status menjadi Eskalasi dan tercatat', async () => {
    const npr = await newTicket();

    const res = await openTt(npr, { problem: `  ${PROBLEM}  `, expectedStatus: 'terbuka' }).expect(201);
    const ticket = (res.body as TicketResponse).ticket;

    expect(ticket.status).toBe('eskalasi');
    expect(ticket.tt).toEqual({
      id: expect.any(String),
      number: `TT/VSAT/TNA/${period()}/0001`,
      problem: PROBLEM,
      createdAt: expect.any(String),
      createdBy: { id: expect.any(String), displayName: 'Helpdesk Uji' },
      closedAt: null,
    });
    const [entry] = await timeline(npr.id);
    expect(entry).toMatchObject({
      type: 'eskalasi_sd',
      statusFrom: 'terbuka',
      statusTo: 'eskalasi',
      note: `TT/VSAT/TNA/${period()}/0001: ${PROBLEM}`,
      createdBy: { displayName: 'Helpdesk Uji' },
    });
    // Audit log tidak dikosongkan antarberkas uji: cari baris untuk TT ini saja.
    const audit = await ds
      .getRepository(AuditEntryEntity)
      .findOneByOrFail({ tableName: 'trouble_tickets', action: 'insert', rowId: ticket.tt!.id });
    expect(audit.actor).toBe('pengguna:helpdesk.uji');
  });

  it('nomor TT urut sendiri, terpisah dari nomor NPR', async () => {
    const first = await newTicket();
    const second = await newTicket();
    await openTt(first, { problem: PROBLEM, expectedStatus: 'terbuka' }).expect(201);
    const tt2 = ((await openTt(second, { problem: PROBLEM, expectedStatus: 'terbuka' }).expect(201)).body as TicketResponse)
      .ticket.tt;

    expect(tt2?.number).toBe(`TT/VSAT/TNA/${period()}/0002`);
    expect((await newTicket()).number).toBe(`NPR/VSAT/TNA/${period()}/0003`);
  });

  it('satu NPR paling banyak satu TT: TT kedua ditolak 409 tanpa mengubah apa pun', async () => {
    const npr = await newTicket();
    await openTt(npr, { problem: PROBLEM, expectedStatus: 'terbuka' }).expect(201);
    const before = await timeline(npr.id);

    const res = await openTt(npr, { problem: 'Lagi', expectedStatus: 'eskalasi' }).expect(409);

    expect(res.body.message).toBe(`NPR ini sudah punya TT TT/VSAT/TNA/${period()}/0001. Satu NPR paling banyak satu TT.`);
    expect(await ds.getRepository(TroubleTicketEntity).count()).toBe(1);
    expect(await timeline(npr.id)).toHaveLength(before.length);
  });

  it('dua Helpdesk membuka TT bersamaan untuk NPR yang sama: satu 201, satu 409', async () => {
    const npr = await newTicket();

    const results = await Promise.all([
      openTt(npr, { problem: PROBLEM, expectedStatus: 'terbuka' }),
      openTt(npr, { problem: 'Dari rekan', expectedStatus: 'terbuka' }, other),
    ]);

    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await ds.getRepository(TroubleTicketEntity).count()).toBe(1);
    expect((await timeline(npr.id)).filter((x) => x.type === 'eskalasi_sd')).toHaveLength(1);
  });

  it('status yang dilihat sudah berubah: 409; tiket Selesai: 400; isian salah: 400 per kolom', async () => {
    const npr = await newTicket();
    expect((await openTt(npr, { problem: PROBLEM, expectedStatus: 'dikerjakan' }).expect(409)).body.message).toMatch(
      /Status tiket sudah berubah menjadi Terbuka/,
    );

    await http()
      .post(`/api/tickets/${npr.id}/actions`)
      .set('Cookie', cookie)
      .send({ type: 'close', occurredAt: new Date().toISOString(), note: 'Listrik pulih, online', statusTo: 'selesai', expectedStatus: 'terbuka' })
      .expect(201);
    expect((await openTt(npr, { problem: PROBLEM, expectedStatus: 'selesai' }).expect(400)).body).toMatchObject({
      field: 'expectedStatus',
      message: expect.stringMatching(/Tiket sudah Selesai/),
    });

    for (const [body, field] of [
      [{ problem: 'x', expectedStatus: 'terbuka' }, 'problem'],
      [{ problem: 'y'.repeat(2001), expectedStatus: 'terbuka' }, 'problem'],
      [{ problem: PROBLEM, expectedStatus: 'tutup' }, 'expectedStatus'],
      [{ problem: PROBLEM, expectedStatus: 'terbuka', nomor: 'TT/1' }, 'nomor'],
    ] as const) {
      expect((await openTt(npr, body).expect(400)).body).toMatchObject({ field });
    }
    expect(await ds.getRepository(TroubleTicketEntity).count()).toBe(0);
  });

  it('dari Pending: TT dibuka dan pihak pending dikosongkan', async () => {
    const npr = await newTicket();
    await http()
      .post(`/api/tickets/${npr.id}/actions`)
      .set('Cookie', cookie)
      .send({
        occurredAt: new Date().toISOString(),
        statusTo: 'pending',
        expectedStatus: 'terbuka',
        pendingParty: 'tm',
        pendingReason: 'Menunggu jadwal teknisi',
      })
      .expect(201);

    const ticket = ((await openTt(npr, { problem: PROBLEM, expectedStatus: 'pending' }).expect(201)).body as TicketResponse)
      .ticket;

    expect(ticket).toMatchObject({ status: 'eskalasi', pending: null });
  });

  it('Eskalasi tidak bisa dipilih manual; setelah kunjungan bisa ke Pending, Dikerjakan, atau Selesai', async () => {
    const npr = await newTicket();
    const add = (body: Record<string, unknown>) =>
      http()
        .post(`/api/tickets/${npr.id}/actions`)
        .set('Cookie', cookie)
        .send({ occurredAt: new Date().toISOString(), ...body });

    expect((await add({ statusTo: 'eskalasi', expectedStatus: 'terbuka' }).expect(400)).body).toMatchObject({
      field: 'statusTo',
    });
    expect((await add({ type: 'eskalasi_sd', note: 'TT manual' }).expect(400)).body).toMatchObject({ field: 'type' });

    await openTt(npr, { problem: PROBLEM, expectedStatus: 'terbuka' }).expect(201);
    // Kunjungan tidak menyelesaikan karena part ATM: pending customer (K27).
    const res = await add({
      note: 'Teknisi: part ATM belum siap',
      statusTo: 'pending',
      expectedStatus: 'eskalasi',
      pendingParty: 'customer',
      pendingReason: 'Part ATM belum siap',
    }).expect(201);
    expect(res.body.ticket.status).toBe('pending');
  });

  it('tiket Eskalasi lama tanpa TT: TT dibuka tanpa entri perubahan status', async () => {
    const legacy = await createTicket(ds, remote, 'NPR/VSAT/TNA/2026/10/0099', { status: 'eskalasi' });

    await openTt(legacy, { problem: PROBLEM, expectedStatus: 'eskalasi' }).expect(201);

    const [entry] = await timeline(legacy.id);
    expect(entry).toMatchObject({ type: 'eskalasi_sd', statusFrom: null, statusTo: null });
  });

  it('ringkasan TT siap tempel untuk SD; setiap penyalinan tercatat di linimasa', async () => {
    const npr = await newTicket();
    await http().post(`/api/tickets/${npr.id}/tt/salin`).set('Cookie', cookie).expect(404);
    await http().patch(`/api/tickets/${npr.id}`).set('Cookie', cookie).send({ customerTicketNumber: 'INC-42' }).expect(200);
    await openTt(npr, { problem: PROBLEM, expectedStatus: 'terbuka' }).expect(201);

    const copy = async () =>
      ((await http().post(`/api/tickets/${npr.id}/tt/salin`).set('Cookie', cookie).expect(200)).body as TroubleTicketSummaryResponse)
        .text;
    const text = await copy();

    expect(text.split('\n')).toEqual([
      `TT/VSAT/TNA/${period()}/0001 (NPR ${npr.number})`,
      'Customer: Bank Uji Anggrek · No. tiket customer INC-42',
      'Remote: ATM Pasar Raya (TNA-001)',
      'Lokasi: Jl. Merdeka 1, Ambon, Maluku',
      'Jarkom: VSAT · IP SNMP 10.1.2.3',
      `Problem: ${PROBLEM}`,
      'Kontak: Pak Budi (Pengelola) 0812000111',
      expect.stringMatching(/^Dibuka: \d{1,2} \w{3} \d{4}, \d{2}\.\d{2} WIT oleh Helpdesk Uji$/),
    ]);
    await copy();
    const copies = (await timeline(npr.id)).filter((x) => x.note === `Ringkasan TT/VSAT/TNA/${period()}/0001 disalin untuk dikirim ke SD.`);
    expect(copies).toHaveLength(2);
  });

  it('daftar: tab TT aktif dan nomor TT di baris; no. TT ditemukan di daftar dan pencarian global', async () => {
    const withTt = await newTicket();
    await newTicket();
    await openTt(withTt, { problem: PROBLEM, expectedStatus: 'terbuka' }).expect(201);
    const number = `TT/VSAT/TNA/${period()}/0001`;
    // TT yang NPR-nya sudah Selesai tidak lagi aktif.
    const done = await newTicket();
    await openTt(done, { problem: PROBLEM, expectedStatus: 'terbuka' }).expect(201);
    await http()
      .post(`/api/tickets/${done.id}/actions`)
      .set('Cookie', cookie)
      .field(
        'data',
        JSON.stringify({
          type: 'close',
          occurredAt: new Date().toISOString(),
          note: 'Teknisi ganti modem, online',
          statusTo: 'selesai',
          expectedStatus: 'eskalasi',
          replacedParts: ['modem'],
        }),
      )
      .attach('lampiran', TINY_PNG, 'laporan-teknisi.png')
      .expect(201);

    const list = (await http().get('/api/tickets?view=tt').set('Cookie', cookie).expect(200)).body as TicketListResponse;
    expect(list.items.map((i) => i.id)).toEqual([withTt.id]);
    expect(list.items[0]?.tt).toEqual({ number });
    expect(list.counts.tt).toBe(1);

    const found = (await http().get('/api/tickets').query({ view: 'semua', q: '0001' }).set('Cookie', cookie).expect(200))
      .body as TicketListResponse;
    expect(found.items.map((i) => i.id)).toContain(withTt.id);
    const byTt = (await http().get('/api/search').query({ q: number.toLowerCase() }).set('Cookie', cookie).expect(200))
      .body as SearchResponse;
    expect(byTt.tickets.map((t) => t.id)).toEqual([withTt.id]);
  });

  it('database: satu TT per NPR, dan TT tidak bisa milik customer lain dari NPR-nya', async () => {
    const npr = await newTicket();
    await openTt(npr, { problem: PROBLEM, expectedStatus: 'terbuka' }).expect(201);
    const b = await createTenant(ds, 'TNB');
    const insert = (tenantId: string, number: string) =>
      asTester(ds, (m) =>
        m.query(
          `INSERT INTO trouble_tickets (tenant_id, ticket_id, number, problem, created_by)
           SELECT $1, id, $2, 'Uji langsung', created_by FROM tickets WHERE id = $3`,
          [tenantId, number, npr.id],
        ),
      );

    await expect(insert(a.id, 'TT/LAIN/1')).rejects.toThrow(/trouble_tickets_ticket_key/);
    await expect(insert(b.id, 'TT/LAIN/2')).rejects.toThrow(/trouble_tickets_ticket_fkey|trouble_tickets_ticket_key/);
  });

  it('ringkasan melewati data yang kosong', () => {
    const text = troubleTicketSummary({
      ttNumber: 'TT/VSAT/TNA/2026/11/0007',
      ticketNumber: 'NPR/VSAT/TNA/2026/11/0010',
      customerTicketNumber: null,
      tenantName: 'Bank Uji',
      remote: {
        siteId: 'S-1',
        name: 'ATM Uji',
        address: null,
        city: 'Kota',
        province: 'Bali',
        timeZone: 'Asia/Makassar',
        ipSnmp: null,
        ipLan: null,
        contacts: [],
      },
      jarkomName: 'VSAT',
      problem: 'Uji',
      openedAt: new Date('2026-11-18T01:00:00Z'),
      openedBy: 'Helpdesk',
    });
    expect(text).toBe(
      [
        'TT/VSAT/TNA/2026/11/0007 (NPR NPR/VSAT/TNA/2026/11/0010)',
        'Customer: Bank Uji',
        'Remote: ATM Uji (S-1)',
        'Lokasi: Kota, Bali',
        'Jarkom: VSAT',
        'Problem: Uji',
        'Kontak: -',
        'Dibuka: 18 Nov 2026, 09.00 WITA oleh Helpdesk',
      ].join('\n'),
    );
  });
});
