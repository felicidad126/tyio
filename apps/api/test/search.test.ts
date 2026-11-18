import type { INestApplication } from '@nestjs/common';
import type { SearchResponse } from '@tyio/shared';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Tenant } from '../src/modules/tenants/tenant.entity.js';
import { createTestApp } from './create-test-app.js';
import { resetData } from './db.js';
import { createRemote, createTenant, createTicket, createUser, sessionCookieFrom, TEST_PASSWORD } from './fixtures.js';

describe('pencarian global', () => {
  let app: INestApplication;
  let ds: DataSource;
  let a: Tenant;
  let b: Tenant;
  let cookie: string;
  let cookieA: string;

  const http = () => request(app.getHttpServer());
  const search = (q: string | undefined, who = cookie) =>
    http()
      .get('/api/search')
      .query(q === undefined ? {} : { q })
      .set('Cookie', who);

  beforeAll(async () => {
    app = await createTestApp();
    ds = app.get(DataSource);
    await resetData(ds);
    a = await createTenant(ds, 'TNA', 'Bank Uji Anggrek');
    b = await createTenant(ds, 'TNB', 'Bank Uji Bakung');
    await createUser(ds, { username: 'l2.semua', role: 'helpdesk' });
    await createUser(ds, { username: 'l1.hanya-a', allTenants: false, tenants: [a] });
    const login = async (username: string) =>
      sessionCookieFrom(
        (await http().post('/api/auth/login').send({ username, password: TEST_PASSWORD }).expect(200)).headers[
          'set-cookie'
        ],
      );
    cookie = await login('l2.semua');
    cookieA = await login('l1.hanya-a');

    const pasar = await createRemote(ds, a, 'ANG-001', { name: 'ATM Pasar Raya', city: 'Ambon' });
    const bakung = await createRemote(ds, b, 'BKG-001', { name: 'ATM Pasar Bakung' });
    await createTicket(ds, pasar, 'NPR/UJI/TNA/2026/11/0001', { customerTicketNumber: 'INC-12345' });
    await createTicket(ds, bakung, 'NPR/UJI/TNB/2026/11/0007');
    for (let i = 1; i <= 12; i++) {
      await createRemote(ds, a, `ANG-2${String(i).padStart(2, '0')}`, { name: `Cabang Melati ${i}` });
    }
  });

  afterAll(async () => {
    await app.close();
  });

  it('menemukan tiket dari nomor NPR dan remote dari Site ID dengan satu kata', async () => {
    const body = (await search('ANG-001').expect(200)).body as SearchResponse;
    expect(body.q).toBe('ANG-001');
    // Tiket ditemukan lewat Site ID remote-nya; remote ditemukan langsung.
    expect(body.tickets.map((t) => t.number)).toEqual(['NPR/UJI/TNA/2026/11/0001']);
    expect(body.remotes.map((r) => r.siteId)).toEqual(['ANG-001']);

    const byNumber = (await search('TNB/2026/11/0007').expect(200)).body as SearchResponse;
    expect(byNumber.tickets.map((t) => t.number)).toEqual(['NPR/UJI/TNB/2026/11/0007']);
    expect(byNumber.remotes).toEqual([]);
    expect(byNumber.ticketTotal).toBe(1);
  });

  it('menemukan tiket dari nomor tiket customer', async () => {
    const body = (await search('inc-123').expect(200)).body as SearchResponse;
    expect(body.tickets.map((t) => t.customerTicketNumber)).toEqual(['INC-12345']);
  });

  it('nama remote ditemukan di tiket dan di remote, dari semua customer yang boleh dilihat', async () => {
    const body = (await search('pasar').expect(200)).body as SearchResponse;
    expect(body.tickets.map((t) => t.number).sort()).toEqual(['NPR/UJI/TNA/2026/11/0001', 'NPR/UJI/TNB/2026/11/0007']);
    expect(body.remotes.map((r) => r.siteId)).toEqual(['ANG-001', 'BKG-001']);
  });

  it('pengguna yang dibatasi ke satu customer tidak menemukan data customer lain', async () => {
    const body = (await search('pasar', cookieA).expect(200)).body as SearchResponse;
    expect(body.tickets.map((t) => t.tenant.id)).toEqual([a.id]);
    expect(body.remotes.map((r) => r.tenant.id)).toEqual([a.id]);
    const json = JSON.stringify(body);
    for (const marker of [b.id, b.code, b.name, 'BKG-001']) expect(json).not.toContain(marker);
  });

  it('paling banyak 10 per jenis, dengan jumlah seluruhnya', async () => {
    const body = (await search('Cabang Melati').expect(200)).body as SearchResponse;
    expect(body.remotes).toHaveLength(10);
    expect(body.remoteTotal).toBe(12);
    expect(body.tickets).toEqual([]);
    expect(body.ticketTotal).toBe(0);
  });

  it.each([
    [undefined, /paling sedikit 2 karakter/],
    ['  a ', /paling sedikit 2 karakter/],
    ['x'.repeat(101), /paling banyak 100/],
  ])('kata %j dijawab 400', async (q, message) => {
    expect((await search(q).expect(400)).body.message).toMatch(message);
  });

  it('parameter lain atau q ganda dijawab 400', async () => {
    expect((await http().get('/api/search?q=pasar&jenis=tiket').set('Cookie', cookie).expect(400)).body.message).toMatch(
      /Parameter tidak dikenal: jenis/,
    );
    expect((await http().get('/api/search?q=pasar&q=atm').set('Cookie', cookie).expect(400)).body.message).toMatch(
      /hanya boleh satu nilai/,
    );
  });

  it('tanpa login dijawab 401', async () => {
    await http().get('/api/search?q=pasar').expect(401);
  });
});
