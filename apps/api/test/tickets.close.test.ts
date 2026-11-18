import { readdirSync } from 'node:fs';
import type { INestApplication } from '@nestjs/common';
import type {
  AddTicketActionResponse,
  OpenTicketsResponse,
  TicketActionsResponse,
  TicketDetail,
  TicketListResponse,
  TicketResponse,
} from '@tyio/shared';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AuditEntryEntity } from '../src/common/audit/audit-entry.entity.js';
import type { Remote } from '../src/modules/remotes/remote.entity.js';
import type { Tenant } from '../src/modules/tenants/tenant.entity.js';
import { TicketEntity } from '../src/modules/tickets/ticket.entity.js';
import { createTestApp } from './create-test-app.js';
import { resetData } from './db.js';
import {
  asTester,
  createRemote,
  createTenant,
  createUser,
  ensureCategory,
  sessionCookieFrom,
  TEST_PASSWORD,
  TINY_PNG,
} from './fixtures.js';
import { TEST_ATTACHMENTS_DIR } from './test-config.js';

const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
const HOUR = 60 * 60 * 1000;

// Close (1.6, K32, T74–T78): menutup NPR saat jarkom online kembali; NPR dengan TT (kunjungan
// teknisi) wajib laporan teknisi dan pilihan part, dan TT-nya ikut ditutup.
describe('penutupan NPR (Close)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let a: Tenant;
  let remote: Remote;
  let categoryId: string;
  let cookie: string;
  const occurredAt = () => new Date(Date.now() - 3 * HOUR).toISOString();
  const onlineAt = () => new Date(Date.now() - HOUR).toISOString();

  const http = () => request(app.getHttpServer());
  const newTicket = async (on = remote): Promise<TicketDetail> =>
    (
      (
        await http()
          .post('/api/tickets')
          .set('Cookie', cookie)
          .send({ remoteId: on.id, categoryId, occurredAt: occurredAt(), problem: 'Remote down', confirmOpenTickets: true })
          .expect(201)
      ).body as TicketResponse
    ).ticket;
  const act = (ticket: { id: string }, body: Record<string, unknown>) =>
    http().post(`/api/tickets/${ticket.id}/actions`).set('Cookie', cookie).send(body);
  /** Close lewat multipart, dengan lampiran bila ada. */
  const close = (ticket: { id: string }, body: Record<string, unknown>, files: Array<[Buffer, string]> = []) => {
    let req = http()
      .post(`/api/tickets/${ticket.id}/actions`)
      .set('Cookie', cookie)
      .field(
        'data',
        JSON.stringify({
          type: 'close',
          occurredAt: onlineAt(),
          note: 'Jarkom online kembali',
          statusTo: 'selesai',
          expectedStatus: 'terbuka',
          ...body,
        }),
      );
    for (const [buffer, name] of files) req = req.attach('lampiran', buffer, name);
    return req;
  };
  const openTt = async (ticket: { id: string }) =>
    http()
      .post(`/api/tickets/${ticket.id}/tt`)
      .set('Cookie', cookie)
      .send({ problem: 'Modem mati, perlu teknisi', expectedStatus: 'terbuka' })
      .expect(201);
  const detail = async (ticket: { id: string }) =>
    ((await http().get(`/api/tickets/${ticket.id}`).set('Cookie', cookie).expect(200)).body as TicketResponse).ticket;
  const timeline = async (ticket: { id: string }) =>
    ((await http().get(`/api/tickets/${ticket.id}/actions`).set('Cookie', cookie).expect(200)).body as TicketActionsResponse)
      .actions;
  const list = async (query: Record<string, string>) =>
    (await http().get('/api/tickets').query(query).set('Cookie', cookie).expect(200)).body as TicketListResponse;

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
    remote = await createRemote(ds, a, 'TNA-001', { name: 'ATM Pasar Raya' });
    categoryId = (await ensureCategory(ds)).id;
    await createUser(ds, { username: 'helpdesk.uji', displayName: 'Helpdesk Uji' });
    cookie = sessionCookieFrom(
      (await http().post('/api/auth/login').send({ username: 'helpdesk.uji', password: TEST_PASSWORD }).expect(200))
        .headers['set-cookie'],
    );
  });

  it('NPR tanpa TT: Close mengubah status ke Selesai, menyimpan waktu online kembali, tercatat di linimasa dan audit', async () => {
    const npr = await newTicket();
    const online = onlineAt();

    const res = (await close(npr, { occurredAt: online, note: 'Listrik PLN pulih, jarkom online' }).expect(201))
      .body as AddTicketActionResponse;

    expect(res.ticket).toMatchObject({ status: 'selesai', closedAt: online, pending: null, tt: null });
    expect(res.action).toMatchObject({
      type: 'close',
      occurredAt: online,
      note: 'Listrik PLN pulih, jarkom online',
      statusFrom: 'terbuka',
      statusTo: 'selesai',
      replacedParts: null,
      attachments: [],
    });
    expect((await timeline(npr)).find((x) => x.id === res.action.id)).toMatchObject({ type: 'close', replacedParts: null });
    const audit = await ds
      .getRepository(AuditEntryEntity)
      .findBy({ tableName: 'tickets', action: 'update', rowId: npr.id });
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ actor: 'pengguna:helpdesk.uji' });
    expect(audit[0]!.data).toMatchObject({ status: { lama: 'terbuka', baru: 'selesai' }, closed_at: { lama: null } });

    // Dari Dikerjakan dan Eskalasi juga bisa; dari Pending harus ke Dikerjakan dulu (alur 1.4).
    const worked = await newTicket();
    await act(worked, { occurredAt: onlineAt(), statusTo: 'dikerjakan', expectedStatus: 'terbuka' }).expect(201);
    await close(worked, { expectedStatus: 'dikerjakan' }).expect(201);
    const waiting = await newTicket();
    await act(waiting, {
      occurredAt: onlineAt(),
      statusTo: 'pending',
      expectedStatus: 'terbuka',
      pendingParty: 'customer',
      pendingReason: 'Listrik padam',
    }).expect(201);
    expect((await close(waiting, { expectedStatus: 'pending' }).expect(400)).body).toMatchObject({ field: 'statusTo' });
  });

  it('Selesai hanya lewat Close; isian Close yang salah ditolak per kolom tanpa menyimpan apa pun', async () => {
    const npr = await newTicket();
    const cases: Array<[Record<string, unknown>, string, RegExp]> = [
      [{ type: 'catatan', note: 'Online' }, 'statusTo', /lewat jenis tindakan Close/],
      [{ statusTo: undefined, expectedStatus: undefined }, 'statusTo', /status tujuannya Selesai/],
      [{ statusTo: 'dikerjakan' }, 'statusTo', /status tujuannya Selesai/],
      [{ note: '   ' }, 'note', /catatan penyelesaian/],
      [{ replacedParts: [] }, 'replacedParts', /hanya untuk NPR dengan kunjungan teknisi/],
      [{ replacedParts: ['modem', 'antena'] }, 'replacedParts', /Part yang diganti hanya: Modem, Adaptor/],
      [{ replacedParts: ['modem', 'modem'] }, 'replacedParts', /berulang/],
      [{ replacedParts: 'modem' }, 'replacedParts', /Part yang diganti hanya/],
      [{ occurredAt: new Date(Date.now() - 4 * HOUR).toISOString() }, 'occurredAt', /sebelum waktu kejadian/],
      [{ occurredAt: new Date(Date.now() + HOUR).toISOString() }, 'occurredAt', /masa depan/],
    ];
    for (const [body, field, message] of cases) {
      const res = await close(npr, body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.body, JSON.stringify(body)).toMatchObject({ field, message: expect.stringMatching(message) });
    }
    // Part hanya untuk Close.
    expect(
      (await act(npr, { occurredAt: onlineAt(), note: 'Cek', replacedParts: ['modem'] }).expect(400)).body,
    ).toMatchObject({ field: 'replacedParts' });

    expect(await detail(npr)).toMatchObject({ status: 'terbuka', closedAt: null });
    expect(await timeline(npr)).toHaveLength(1);
  });

  it('NPR dengan TT: wajib pilihan part dan laporan teknisi; TT ikut ditutup dan keluar dari TT aktif', async () => {
    const npr = await newTicket();
    await openTt(npr);
    const filesBefore = readdirSync(TEST_ATTACHMENTS_DIR).length;
    const online = onlineAt();

    expect((await close(npr, { expectedStatus: 'eskalasi' }, [[PDF, 'laporan.pdf']]).expect(400)).body).toMatchObject({
      field: 'replacedParts',
      message: expect.stringMatching(/Pilih part yang diganti teknisi untuk TT\//),
    });
    expect(
      (await close(npr, { expectedStatus: 'eskalasi', replacedParts: ['modem'] }).expect(400)).body,
    ).toMatchObject({ field: 'lampiran', message: expect.stringMatching(/Lampirkan laporan teknisi/) });
    expect(readdirSync(TEST_ATTACHMENTS_DIR).length).toBe(filesBefore);

    const res = (
      await close(
        npr,
        { occurredAt: online, note: 'Teknisi ganti modem dan LNB, online', expectedStatus: 'eskalasi', replacedParts: ['lnb', 'modem'] },
        [[PDF, 'laporan-teknisi.pdf'], [TINY_PNG, 'foto-lokasi.png']],
      ).expect(201)
    ).body as AddTicketActionResponse;

    expect(res.action).toMatchObject({ type: 'close', statusFrom: 'eskalasi', statusTo: 'selesai', replacedParts: ['modem', 'lnb'] });
    expect(res.action.attachments.map((x) => x.fileName)).toEqual(['laporan-teknisi.pdf', 'foto-lokasi.png']);
    expect(res.ticket).toMatchObject({ status: 'selesai', closedAt: online, tt: { closedAt: online } });
    expect((await list({ view: 'tt' })).counts.tt).toBe(0);

    // "Tidak ada part yang diganti" = daftar kosong, tetap wajib laporan.
    const other = await newTicket();
    await openTt(other);
    const none = (
      await close(other, { expectedStatus: 'eskalasi', replacedParts: [] }, [[PDF, 'laporan.pdf']]).expect(201)
    ).body as AddTicketActionResponse;
    expect(none.action.replacedParts).toEqual([]);
  });

  it('dibuka lagi (Selesai → Dikerjakan): waktu tutup NPR dan TT kosong lagi, TT aktif lagi, lalu bisa Close lagi', async () => {
    const npr = await newTicket();
    await openTt(npr);
    await close(npr, { expectedStatus: 'eskalasi', replacedParts: ['adaptor'] }, [[PDF, 'laporan.pdf']]).expect(201);

    const reopened = (
      await act(npr, { occurredAt: onlineAt(), note: 'Down lagi', statusTo: 'dikerjakan', expectedStatus: 'selesai' }).expect(201)
    ).body as AddTicketActionResponse;

    expect(reopened.ticket).toMatchObject({ status: 'dikerjakan', closedAt: null, tt: { closedAt: null } });
    expect((await list({ view: 'tt' })).items.map((i) => i.id)).toEqual([npr.id]);
    const again = (
      await close(npr, { expectedStatus: 'dikerjakan', replacedParts: [] }, [[PDF, 'laporan-2.pdf']]).expect(201)
    ).body as AddTicketActionResponse;
    expect(again.ticket).toMatchObject({ status: 'selesai', closedAt: expect.any(String), tt: { closedAt: expect.any(String) } });
  });

  it('tiket Selesai tidak lagi dihitung tiket terbuka saat membuat tiket baru untuk remote yang sama', async () => {
    const npr = await newTicket();
    const open = async () =>
      ((await http().get(`/api/remotes/${remote.id}/open-tickets`).set('Cookie', cookie).expect(200)).body as OpenTicketsResponse)
        .tickets;
    expect((await open()).map((t) => t.id)).toEqual([npr.id]);

    await close(npr, {}).expect(201);

    expect(await open()).toEqual([]);
    await http()
      .post('/api/tickets')
      .set('Cookie', cookie)
      .send({ remoteId: remote.id, categoryId, occurredAt: occurredAt(), problem: 'Down lagi' })
      .expect(201);
  });

  it('riwayat tiket satu remote: semua NPR-nya termasuk yang Selesai, dengan waktu tutup; remote lain tidak ikut', async () => {
    const other = await createRemote(ds, a, 'TNA-002');
    const first = await newTicket();
    const online = onlineAt();
    await close(first, { occurredAt: online }).expect(201);
    const second = await newTicket();
    await newTicket(other);

    const history = await list({ view: 'semua', remoteId: remote.id });

    expect(history.total).toBe(2);
    expect(history.items.map((i) => [i.id, i.status, i.closedAt])).toEqual([
      [second.id, 'terbuka', null],
      [first.id, 'selesai', online],
    ]);
    expect((await http().get('/api/tickets').query({ remoteId: 'bukan-uuid' }).set('Cookie', cookie).expect(400)).body)
      .toMatchObject({ message: 'Remote tidak sah.' });
  });

  it('database: Selesai wajib punya waktu tutup; Close selalu ke Selesai; part hanya di Close dan dari daftar', async () => {
    const npr = await newTicket();
    await expect(
      asTester(ds, (m) => m.getRepository(TicketEntity).update(npr.id, { status: 'selesai' })),
    ).rejects.toThrow(/tickets_closed/);
    await expect(
      asTester(ds, (m) => m.getRepository(TicketEntity).update(npr.id, { closedAt: new Date() })),
    ).rejects.toThrow(/tickets_closed/);

    const insert = (type: string, statusTo: string | null, parts: string[] | null) =>
      asTester(ds, (m) =>
        m.query(
          `INSERT INTO ticket_actions (tenant_id, ticket_id, action_type, occurred_at, note, status_to, replaced_parts, created_by)
           SELECT tenant_id, id, $2, now(), 'Uji langsung', $3, $4, created_by FROM tickets WHERE id = $1`,
          [npr.id, type, statusTo, parts],
        ),
      );
    await expect(insert('close', null, null)).rejects.toThrow(/ticket_actions_close/);
    await expect(insert('close', 'dikerjakan', null)).rejects.toThrow(/ticket_actions_close/);
    await expect(insert('catatan', null, ['modem'])).rejects.toThrow(/ticket_actions_replaced_parts/);
    await expect(insert('close', 'selesai', ['antena'])).rejects.toThrow(/ticket_actions_replaced_parts/);
    await expect(insert('close', 'selesai', ['modem', null as unknown as string])).rejects.toThrow(
      /ticket_actions_replaced_parts/,
    );
  });
});
