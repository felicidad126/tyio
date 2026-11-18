import { request as httpRequest, type IncomingHttpHeaders } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { TicketResponse } from '@tyio/shared';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Remote } from '../src/modules/remotes/remote.entity.js';
import { parseChange } from '../src/modules/stream/change-feed.service.js';
import { createTestApp } from './create-test-app.js';
import { resetData } from './db.js';
import { createRemote, createTenant, createUser, ensureCategory, sessionCookieFrom, TEST_PASSWORD } from './fixtures.js';
import { testConfig } from './test-config.js';

interface Sse {
  status: number;
  headers: IncomingHttpHeaders;
  events: Array<{ event: string; data: Record<string, unknown> }>;
  ended: Promise<void>;
  close: () => void;
}

/** Membuka `/api/stream` sungguhan (bukan supertest, yang menunggu jawaban selesai). */
function openStream(port: number, cookie?: string): Promise<Sse> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      { port, path: '/api/stream', headers: { Accept: 'text/event-stream', ...(cookie ? { Cookie: cookie } : {}) } },
      (res) => {
        const sse: Sse = {
          status: res.statusCode ?? 0,
          headers: res.headers,
          events: [],
          ended: new Promise((done) => res.on('close', () => done())),
          close: () => req.destroy(),
        };
        let buffer = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => {
          buffer += chunk;
          let end: number;
          while ((end = buffer.indexOf('\n\n')) >= 0) {
            const block = buffer.slice(0, end);
            buffer = buffer.slice(end + 2);
            const event = /^event: (.+)$/m.exec(block)?.[1];
            const data = /^data: (.+)$/m.exec(block)?.[1];
            if (event && data) sse.events.push({ event, data: JSON.parse(data) as Record<string, unknown> });
          }
        });
        resolve(sse);
      },
    );
    req.on('error', reject);
    req.end();
  });
}

const until = async (check: () => boolean, ms = 3000) => {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > ms) throw new Error('waktu habis menunggu kabar');
    await new Promise((r) => setTimeout(r, 20));
  }
};
const changes = (sse: Sse) => sse.events.filter((e) => e.event === 'change').map((e) => e.data);

// Pembaruan langsung (2.2): kabar perubahan tiket lewat Server-Sent Events, dibatasi customer.
describe('pembaruan langsung (/api/stream)', () => {
  let app: NestExpressApplication;
  let ds: DataSource;
  let port: number;
  let remoteA: Remote;
  let remoteB: Remote;
  let categoryId: string;
  const cookies = { semua: '', hanyaA: '' };
  const open: Sse[] = [];
  const stream = async (cookie?: string) => {
    const sse = await openStream(port, cookie);
    open.push(sse);
    return sse;
  };
  const createTicket = async (remote: Remote) =>
    (
      (
        await request(app.getHttpServer())
          .post('/api/tickets')
          .set('Cookie', cookies.semua)
          .send({ remoteId: remote.id, categoryId, occurredAt: new Date().toISOString(), problem: 'Remote down', confirmOpenTickets: true })
          .expect(201)
      ).body as TicketResponse
    ).ticket;

  beforeAll(async () => {
    app = await createTestApp(testConfig({ streamHeartbeatMs: 150, streamMaxMs: 3000 }));
    await app.listen(0);
    port = (app.getHttpServer().address() as AddressInfo).port;
    ds = app.get(DataSource);
    await resetData(ds);
    const a = await createTenant(ds, 'TNA', 'Bank Uji Anggrek');
    const b = await createTenant(ds, 'TNB', 'Bank Uji Rahasia');
    remoteA = await createRemote(ds, a, 'TNA-001');
    remoteB = await createRemote(ds, b, 'TNB-001');
    categoryId = (await ensureCategory(ds)).id;
    await createUser(ds, { username: 'helpdesk.semua', allTenants: true });
    await createUser(ds, { username: 'helpdesk.a', allTenants: false, tenants: [a] });
    for (const [key, username] of [
      ['semua', 'helpdesk.semua'],
      ['hanyaA', 'helpdesk.a'],
    ] as const) {
      const res = await request(app.getHttpServer()).post('/api/auth/login').send({ username, password: TEST_PASSWORD }).expect(200);
      cookies[key] = sessionCookieFrom(res.headers['set-cookie']);
    }
  });

  afterAll(async () => {
    for (const sse of open) sse.close();
    await app.close();
  });

  it('tanpa login: 401, bukan koneksi terbuka', async () => {
    const sse = await stream();
    expect(sse.status).toBe(401);
    await sse.ended;
  });

  it('tersambung: header SSE yang tidak ditahan proxy, lalu event ready dengan jarak detak', async () => {
    const sse = await stream(cookies.semua);
    expect(sse.status).toBe(200);
    expect(sse.headers['content-type']).toMatch(/^text\/event-stream/);
    expect(sse.headers['x-accel-buffering']).toBe('no');
    expect(sse.headers['cache-control']).toMatch(/no-cache/);
    await until(() => sse.events.length > 0);
    expect(sse.events[0]).toMatchObject({ event: 'ready', data: { heartbeatMs: 150 } });
    sse.close();
  });

  it('tiket baru, tindakan, dan TT dikabarkan; pengguna satu customer tidak menerima kabar customer lain', async () => {
    const all = await stream(cookies.semua);
    const onlyA = await stream(cookies.hanyaA);
    await until(() => all.events.length > 0 && onlyA.events.length > 0);

    const ticketA = await createTicket(remoteA);
    const ticketB = await createTicket(remoteB);
    await request(app.getHttpServer())
      .post(`/api/tickets/${ticketA.id}/actions`)
      .set('Cookie', cookies.semua)
      .send({ occurredAt: new Date().toISOString(), note: 'Cek lokasi' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/tickets/${ticketA.id}/tt`)
      .set('Cookie', cookies.semua)
      .send({ problem: 'Modem mati', expectedStatus: 'terbuka' })
      .expect(201);

    await until(() => changes(all).some((c) => c.ticketId === ticketB.id && c.kind === 'tickets'));
    await until(() => changes(onlyA).some((c) => c.kind === 'trouble_tickets'));
    for (const kind of ['tickets', 'ticket_actions', 'trouble_tickets']) {
      expect(changes(onlyA)).toContainEqual({ ticketId: ticketA.id, kind });
    }
    expect(changes(onlyA).every((c) => c.ticketId === ticketA.id)).toBe(true);
    expect(JSON.stringify(onlyA.events)).not.toContain(ticketB.id);
    all.close();
    onlyA.close();
  });

  it('perubahan yang dibatalkan (rollback) tidak dikabarkan', async () => {
    const ticket = await createTicket(remoteA);
    const sse = await stream(cookies.semua);
    await until(() => sse.events.length > 0);

    await expect(
      ds.transaction(async (m) => {
        await m.query(`SELECT set_config('tyio.actor', 'uji', true)`);
        await m.query(`UPDATE tickets SET customer_ticket_number = 'X' WHERE id = $1`, [ticket.id]);
        throw new Error('batal');
      }),
    ).rejects.toThrow('batal');
    await new Promise((r) => setTimeout(r, 300));

    expect(changes(sse)).toEqual([]);
    sse.close();
  });

  it('detak berkala; setelah umur koneksi habis server mengirim bye lalu menutup koneksi', async () => {
    const sse = await stream(cookies.semua);
    await sse.ended;
    expect(sse.events.filter((e) => e.event === 'ping').length).toBeGreaterThanOrEqual(10);
    expect(sse.events.at(-1)?.event).toBe('bye');
  });

  it('koneksi database pendengar diputus: tersambung lagi, mengirim resync, lalu kabar berjalan lagi', async () => {
    const sse = await stream(cookies.semua);
    await until(() => sse.events.length > 0);

    const killed: Array<{ ok: boolean }> = await ds.query(
      `SELECT pg_terminate_backend(pid) AS ok FROM pg_stat_activity WHERE query = 'LISTEN tyio_changes' AND pid <> pg_backend_pid()`,
    );
    expect(killed.length).toBeGreaterThan(0);

    await until(() => sse.events.some((e) => e.event === 'resync'), 2500);
    const ticket = await createTicket(remoteA);
    await until(() => changes(sse).some((c) => c.ticketId === ticket.id));
    sse.close();
  });

  it('isi NOTIFY yang tidak dikenal diabaikan', () => {
    expect(parseChange('bukan json')).toBeNull();
    expect(parseChange(JSON.stringify({ tenantId: 'a', ticketId: 'b', kind: 'users' }))).toBeNull();
    expect(parseChange(JSON.stringify({ tenantId: 'a', ticketId: 'b', kind: 'tickets' }))).toEqual({
      type: 'change',
      tenantId: 'a',
      ticketId: 'b',
      kind: 'tickets',
    });
  });
});
