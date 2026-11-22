import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { GlobalSearchResult } from '@tyio/shared';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from './create-test-app.js';
import { insertRemote, insertTenant, insertTicket, insertUser, operatorQuery, TEST_PASSWORD } from './fixtures.js';

// Pencarian global (langkah 1.5, T84): no. NPR, no. tiket customer, dan kode/nama remote,
// termasuk NPR yang sudah ditutup. Kata kunci unik per uji, karena berkas uji lain menulis ke
// database yang sama. Isolasi antar-customer di tenant-isolation.test.ts.

type Agent = ReturnType<typeof request.agent>;

describe('pencarian global', () => {
  let app: NestExpressApplication;
  let dataSource: DataSource;
  let tenantId: string;
  let l1: Agent;

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
    tenantId = (await insertTenant(dataSource, 'Bank Cari')).id;
    const user = await insertUser(dataSource, { role: 'l1' });
    l1 = request.agent(app.getHttpServer());
    await l1.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD }).expect(200);
  });

  afterAll(async () => {
    await app.close();
  });

  const search = async (q: string) =>
    (await l1.get(`/api/search?q=${encodeURIComponent(q)}`).expect(200)).body as GlobalSearchResult;
  const marker = () => `Q${randomUUID().slice(0, 6).toUpperCase()}`;

  async function close(ticketId: string): Promise<void> {
    for (const [from, to] of [
      ['terbuka', 'pulih'],
      ['pulih', 'ditutup'],
    ]) {
      await operatorQuery(
        dataSource,
        `INSERT INTO ticket_actions (tenant_id, ticket_id, kind, note, occurred_at, status_from, status_to, created_by)
         SELECT tenant_id, id, 'catatan', 'x', now(), $2, $3, created_by FROM tickets WHERE id = $1`,
        [ticketId, from, to],
      );
    }
  }

  it('nama remote: NPR remote itu (yang berjalan dulu, lalu yang ditutup) dan remote-nya', async () => {
    const key = marker();
    const remote = await insertRemote(dataSource, tenantId, { name: `ATM ${key} Sentral`, city: 'Palu' });
    const closed = await insertTicket(dataSource, tenantId, { remoteId: remote.id });
    await close(closed.id);
    const open = await insertTicket(dataSource, tenantId, { remoteId: remote.id });

    const result = await search(key.toLowerCase());
    expect(result.tickets.map((hit) => hit.id)).toEqual([open.id, closed.id]);
    expect(result.tickets[1]).toMatchObject({ status: 'ditutup', customerName: 'Bank Cari', remote: { code: remote.code } });
    expect(result.remotes).toEqual([
      { id: remote.id, code: remote.code, name: `ATM ${key} Sentral`, city: 'Palu', customerName: 'Bank Cari' },
    ]);
  });

  it('nomor NPR utuh atau sebagian; yang cocok persis di atas', async () => {
    const remote = await insertRemote(dataSource, tenantId);
    const ticket = await insertTicket(dataSource, tenantId, { remoteId: remote.id });
    const byFull = await search(ticket.number);
    expect(byFull.tickets[0]?.id).toBe(ticket.id);
    const tail = ticket.number.split('/').slice(1, 3).join('/'); // JARKOM/CUSTOMER
    expect((await search(tail)).tickets.map((hit) => hit.id)).toContain(ticket.id);
  });

  it('nomor tiket customer, tanpa membedakan huruf besar/kecil', async () => {
    const key = marker();
    const ticket = await insertTicket(dataSource, tenantId);
    await operatorQuery(
      dataSource,
      `INSERT INTO ticket_actions (tenant_id, ticket_id, kind, note, occurred_at, customer_ticket_number, created_by)
       SELECT tenant_id, id, 'catatan', 'Nomor customer', now(), $2, created_by FROM tickets WHERE id = $1`,
      [ticket.id, `INC-${key}`],
    );
    const result = await search(`inc-${key.toLowerCase()}`);
    expect(result.tickets).toEqual([expect.objectContaining({ id: ticket.id, customerTicketNumber: `INC-${key}` })]);
  });

  it('kode remote tanpa NPR: hanya remote', async () => {
    const remote = await insertRemote(dataSource, tenantId);
    const result = await search(remote.code);
    expect(result.tickets).toEqual([]);
    expect(result.remotes.map((hit) => hit.id)).toEqual([remote.id]);
  });

  it('paling banyak 8 NPR dan 5 remote', async () => {
    const key = marker();
    for (let index = 0; index < 6; index += 1) {
      const remote = await insertRemote(dataSource, tenantId, { name: `Remote ${key} ${index}` });
      await insertTicket(dataSource, tenantId, { remoteId: remote.id });
      await insertTicket(dataSource, tenantId, { remoteId: remote.id });
    }
    const result = await search(key);
    expect(result.tickets).toHaveLength(8);
    expect(result.remotes).toHaveLength(5);
  });

  it('kurang dari 2 huruf: kosong; lebih dari 100: ditolak; % dan _ bukan pola', async () => {
    expect(await search('A')).toEqual({ tickets: [], remotes: [] });
    expect(await search('   ')).toEqual({ tickets: [], remotes: [] });
    await l1.get(`/api/search`).expect(200);
    const long = await l1.get(`/api/search?q=${'x'.repeat(101)}`).expect(400);
    expect(long.body.message).toBe('Kata kunci paling panjang 100 karakter.');
    expect(await search('%%')).toEqual({ tickets: [], remotes: [] });
    expect(await search('__')).toEqual({ tickets: [], remotes: [] });
  });
});
