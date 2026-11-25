import type { NestExpressApplication } from '@nestjs/platform-express';
import { STREAM_EVENTS, type StreamHello, type TicketChangeEvent, type TicketDetail } from '@npr/shared';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TicketChangesService } from '../src/modules/stream/ticket-changes.service.js';
import { createTestApp } from './create-test-app.js';
import {
  asOperator,
  insertMasterValue,
  insertRemote,
  insertTenant,
  insertTicket,
  insertUser,
  operatorQuery,
  TEST_PASSWORD,
} from './fixtures.js';
import { openStream, sessionCookie, type SseStream } from './sse.js';
import { testConfig } from './test-config.js';

// Pembaruan langsung (langkah 2.2): GET /api/stream mengirim pemberitahuan setiap entri
// linimasa baru di NPR customer dalam cakupan pengguna (T128–T130), dari jalur tulis mana pun.
// Detak dipercepat (200 ms) agar pemeriksaan ulang sesi teruji cepat.

const HEARTBEAT_MS = 200;

describe('aliran pembaruan langsung', () => {
  let app: NestExpressApplication;
  let dataSource: DataSource;
  let tenantA: { id: string; code: string };
  let tenantB: { id: string; code: string };
  /** L1 yang hanya melihat customer A. */
  let emailA: string;
  const streams: SseStream[] = [];

  const open = async (cookie?: string) => {
    const stream = await openStream(app.getHttpServer(), cookie);
    streams.push(stream);
    return stream;
  };
  const isTicket = (ticketId: string) => (data: unknown) => (data as TicketChangeEvent).ticketId === ticketId;

  beforeAll(async () => {
    app = await createTestApp(testConfig({ stream: { heartbeatMs: HEARTBEAT_MS } }));
    dataSource = app.get(DataSource);
    tenantA = await insertTenant(dataSource, 'Bank Aliran A');
    tenantB = await insertTenant(dataSource, 'Bank Aliran B');
    emailA = (await insertUser(dataSource, { role: 'l1', tenantCodes: [tenantA.code] })).email;
  });

  afterAll(async () => {
    for (const stream of streams) stream.close();
    await app.close();
  });

  it('tanpa sesi ditolak 401', async () => {
    const stream = await open();
    expect(stream.status).toBe(401);
  });

  it('tersambung lalu berdetak; jeda detak diberitahukan', async () => {
    const stream = await open(await sessionCookie(app.getHttpServer(), emailA));
    expect(stream.status).toBe(200);
    expect(stream.headers['content-type']).toMatch(/^text\/event-stream/);
    // nginx di depan aplikasi (T167) tidak menahan pesan di buffer (NestJS mengirim header ini).
    expect(stream.headers['x-accel-buffering']).toBe('no');
    const hello = await stream.next(STREAM_EVENTS.hello);
    expect((hello.data as StreamHello).heartbeatMs).toBe(HEARTBEAT_MS);
    await stream.next(STREAM_EVENTS.beat);
    await stream.next(STREAM_EVENTS.beat);
  });

  it('NPR baru lewat API: pemberitahuan berisi customer, NPR, dan jenis entri', async () => {
    const stream = await open(await sessionCookie(app.getHttpServer(), emailA));
    await stream.next(STREAM_EVENTS.hello);
    const admin = request.agent(app.getHttpServer());
    const adminUser = await insertUser(dataSource, { role: 'admin' });
    await admin.post('/api/auth/login').send({ email: adminUser.email, password: TEST_PASSWORD }).expect(200);
    const remote = await insertRemote(dataSource, tenantA.id);
    const category = await insertMasterValue(dataSource, 'kategori', tenantA.id);
    const system = await insertMasterValue(dataSource, 'system', tenantA.id);
    const created = (
      await admin
        .post('/api/tickets')
        .send({ remoteId: remote.id, categoryId: category.id, systemId: system.id, description: 'Ping gagal' })
        .expect(201)
    ).body as TicketDetail;

    const event = await stream.next(STREAM_EVENTS.ticket, isTicket(created.id));
    expect(event.data).toEqual({ tenantId: tenantA.id, ticketId: created.id, kind: 'dibuat' });

    // Tindakan berikutnya (Ambil) juga memberi tahu.
    await admin.post(`/api/tickets/${created.id}/take`).send({ expectedAssigneeId: null }).expect(201);
    expect((await stream.next(STREAM_EVENTS.ticket, isTicket(created.id))).data).toMatchObject({ kind: 'ambil' });
  });

  it('tulisan langsung di database (perbaikan manual) juga memberi tahu; transaksi batal tidak', async () => {
    const stream = await open(await sessionCookie(app.getHttpServer(), emailA));
    await stream.next(STREAM_EVENTS.hello);
    const remote = await insertRemote(dataSource, tenantA.id);
    await expect(
      asOperator(dataSource, async (manager) => {
        await manager.query(
          `INSERT INTO ticket_actions (tenant_id, ticket_id, kind, note, occurred_at, created_by)
           SELECT tenant_id, id, 'catatan', 'Batal', now(), created_by FROM tickets WHERE tenant_id = $1 LIMIT 1`,
          [tenantA.id],
        );
        throw new Error('batal');
      }),
    ).rejects.toThrow('batal');
    const ticket = await insertTicket(dataSource, tenantA.id, { remoteId: remote.id });
    // Pemberitahuan NPR pertama yang datang sesudahnya adalah NPR ini, bukan entri yang batal.
    const first = await stream.next(STREAM_EVENTS.ticket, (data) => (data as TicketChangeEvent).kind === 'catatan' || isTicket(ticket.id)(data));
    expect(first.data).toEqual({ tenantId: tenantA.id, ticketId: ticket.id, kind: 'dibuat' });
  });

  it('hanya customer dalam cakupan pengguna (T9)', async () => {
    const stream = await open(await sessionCookie(app.getHttpServer(), emailA));
    await stream.next(STREAM_EVENTS.hello);
    const other = await insertTicket(dataSource, tenantB.id);
    const own = await insertTicket(dataSource, tenantA.id);
    await stream.next(STREAM_EVENTS.ticket, isTicket(own.id));
    expect(stream.events.some((event) => (event.data as TicketChangeEvent).ticketId === other.id)).toBe(false);
    expect(
      stream.events
        .filter((event) => event.type === STREAM_EVENTS.ticket)
        .every((event) => (event.data as TicketChangeEvent).tenantId === tenantA.id),
    ).toBe(true);
  });

  it('aliran tidak memperpanjang sesi; sesi yang dicabut (keluar) menutup aliran', async () => {
    const cookie = await sessionCookie(app.getHttpServer(), emailA);
    const stream = await open(cookie);
    await stream.next(STREAM_EVENTS.hello);
    const lastSeen = async () =>
      ((await dataSource.query(
        `SELECT last_seen_at FROM sessions s JOIN users u ON u.id = s.user_id
          WHERE u.email = $1 ORDER BY s.created_at DESC LIMIT 1`,
        [emailA],
      )) as Array<{ last_seen_at: Date }>)[0]?.last_seen_at.getTime();
    const before = await lastSeen();
    await stream.next(STREAM_EVENTS.beat);
    await stream.next(STREAM_EVENTS.beat);
    expect(await lastSeen()).toBe(before);

    await request(app.getHttpServer()).post('/api/auth/logout').set('Cookie', cookie).expect(204);
    await Promise.race([
      stream.ended,
      new Promise((_, reject) => setTimeout(() => reject(new Error('aliran tidak ditutup')), HEARTBEAT_MS * 10)),
    ]);
  });

  it('pengguna yang dinonaktifkan: aliran ditutup pada detak berikutnya', async () => {
    const user = await insertUser(dataSource, { role: 'l1', tenantCodes: [tenantA.code] });
    const stream = await open(await sessionCookie(app.getHttpServer(), user.email));
    await stream.next(STREAM_EVENTS.hello);
    await operatorQuery(dataSource, 'UPDATE users SET active = false WHERE id = $1', [user.id]);
    await Promise.race([
      stream.ended,
      new Promise((_, reject) => setTimeout(() => reject(new Error('aliran tidak ditutup')), HEARTBEAT_MS * 10)),
    ]);
  });

  it('sambungan ke database putus: disambung ulang, "segarkan" dikirim, perubahan berikutnya tetap sampai', async () => {
    const stream = await open(await sessionCookie(app.getHttpServer(), emailA));
    await stream.next(STREAM_EVENTS.hello);
    const listener = app.get(TicketChangesService).listenerName;
    const [killed] = (await dataSource.query(
      'SELECT count(pg_terminate_backend(pid))::int AS n FROM pg_stat_activity WHERE application_name = $1',
      [listener],
    )) as Array<{ n: number }>;
    expect(killed?.n).toBe(1);
    await stream.next(STREAM_EVENTS.resync, () => true, 8_000);
    const ticket = await insertTicket(dataSource, tenantA.id);
    await stream.next(STREAM_EVENTS.ticket, isTicket(ticket.id));
  });
});
