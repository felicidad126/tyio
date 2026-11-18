import type { INestApplication } from '@nestjs/common';
import type { MapResponse, MapStatesResponse } from '@tyio/shared';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Tenant } from '../src/modules/tenants/tenant.entity.js';
import { createTestApp } from './create-test-app.js';
import { resetData } from './db.js';
import { createRemote, createTenant, createTicket, createUser, sessionCookieFrom, TEST_PASSWORD } from './fixtures.js';
import { testConfig } from './test-config.js';

// Peta remote (2.3): titik per remote berkoordinat, warnanya dari NPR aktif, dibatasi customer.
describe('peta remote (/api/map)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let a: Tenant;
  let b: Tenant;
  const cookies = { semua: '', hanyaA: '' };
  const map = async (who: keyof typeof cookies = 'semua') =>
    (await request(app.getHttpServer()).get('/api/map').set('Cookie', cookies[who]).expect(200)).body as MapResponse;

  beforeAll(async () => {
    app = await createTestApp(testConfig({ mapTileUrl: 'https://peta.contoh.id/{z}/{x}/{y}.png', mapTileAttribution: '© Peta Contoh' }));
    ds = app.get(DataSource);
    await resetData(ds);
    a = await createTenant(ds, 'TNA', 'Bank Uji Anggrek');
    b = await createTenant(ds, 'TNB', 'Bank Uji Rahasia');
    const at = (lat: string, lng: string) => ({ latitude: lat, longitude: lng });
    let n = 0;
    const ticket = (remote: Awaited<ReturnType<typeof createRemote>>, overrides: Parameters<typeof createTicket>[3] = {}) =>
      createTicket(ds, remote, `NPR/UJI/${remote.siteId}/${++n}`, overrides);

    const down = await createRemote(ds, a, 'TNA-001', { name: 'ATM Pasar', city: 'Malang', ...at('-7.983000', '112.621000') });
    await ticket(down);
    await ticket(down, { status: 'selesai' }); // sudah Selesai: tidak dihitung
    const waiting = await createRemote(ds, a, 'TNA-002', at('-7.900000', '112.600000'));
    await ticket(waiting, { status: 'pending', pendingParty: 'customer', pendingReason: 'Listrik padam' });
    const mixed = await createRemote(ds, a, 'TNA-003', at('-7.800000', '112.500000'));
    await ticket(mixed, { status: 'pending', pendingParty: 'tm', pendingReason: 'Menunggu teknisi' });
    await ticket(mixed, { status: 'eskalasi' });
    await createRemote(ds, a, 'TNA-004', at('-7.700000', '112.400000'));
    await createRemote(ds, a, 'TNA-005', { status: 'nonaktif', ...at('-7.600000', '112.300000') });
    const dismantled = await createRemote(ds, a, 'TNA-006', { status: 'dibongkar', ...at('-7.500000', '112.200000') });
    await ticket(dismantled, { status: 'dikerjakan' });
    await createRemote(ds, a, 'TNA-007'); // tanpa koordinat
    const other = await createRemote(ds, b, 'TNB-001', at('-2.533000', '140.718000'));
    await ticket(other);

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
    await app.close();
  });

  it('kondisi tiap remote dari NPR aktif: gangguan, pending, normal, nonaktif; tanpa koordinat dihitung terpisah', async () => {
    const m = await map();

    expect(m.tiles).toEqual({ url: 'https://peta.contoh.id/{z}/{x}/{y}.png', attribution: '© Peta Contoh' });
    expect(m.withoutCoordinates).toBe(1);
    expect(m.remotes.map((r) => [r.siteId, r.state, r.activeTickets])).toEqual([
      ['TNA-001', 'gangguan', 1],
      ['TNA-002', 'pending', 1],
      ['TNA-003', 'gangguan', 2],
      ['TNA-004', 'normal', 0],
      ['TNA-005', 'nonaktif', 0],
      ['TNA-006', 'gangguan', 1],
      ['TNB-001', 'gangguan', 1],
    ]);
    expect(m.remotes[0]).toEqual({
      id: expect.any(String),
      siteId: 'TNA-001',
      name: 'ATM Pasar',
      city: 'Malang',
      tenantId: a.id,
      tenant: 'Bank Uji Anggrek',
      lat: -7.983,
      lng: 112.621,
      state: 'gangguan',
      activeTickets: 1,
    });
  });

  it('pengguna yang dibatasi ke satu customer hanya melihat remote customernya', async () => {
    const m = await map('hanyaA');

    expect(m.remotes.map((r) => r.siteId)).toEqual(['TNA-001', 'TNA-002', 'TNA-003', 'TNA-004', 'TNA-005', 'TNA-006']);
    const body = JSON.stringify(m);
    for (const marker of [b.id, b.name, 'TNB-001']) expect(body).not.toContain(marker);
  });

  it('kondisi terkini (untuk pembaruan langsung) hanya berisi remote yang tidak normal, sama dengan peta lengkap', async () => {
    const full = await map();
    const res = await request(app.getHttpServer()).get('/api/map/states').set('Cookie', cookies.semua).expect(200);
    const states = (res.body as MapStatesResponse).states;

    const expected = full.remotes
      .filter((r) => r.state !== 'normal')
      .map((r) => ({ id: r.id, tenantId: r.tenantId, state: r.state, activeTickets: r.activeTickets }))
      .sort((x, y) => x.id.localeCompare(y.id));
    expect([...states].sort((x, y) => x.id.localeCompare(y.id))).toEqual(expected);
    expect(states.map((s) => s.state)).not.toContain('normal');
    const onlyA = (await request(app.getHttpServer()).get('/api/map/states').set('Cookie', cookies.hanyaA).expect(200)).body;
    expect(JSON.stringify(onlyA)).not.toContain(full.remotes.find((r) => r.siteId === 'TNB-001')!.id);
  });

  it('jawaban JSON dikompresi gzip; koneksi pembaruan langsung tidak', async () => {
    const res = await request(app.getHttpServer()).get('/api/map').set('Cookie', cookies.semua).set('Accept-Encoding', 'gzip').expect(200);
    expect(res.headers['content-encoding']).toBe('gzip');
  });

  it('tanpa login 401; parameter tidak dikenal 400', async () => {
    await request(app.getHttpServer()).get('/api/map').expect(401);
    expect((await request(app.getHttpServer()).get('/api/map?x=1').set('Cookie', cookies.semua).expect(400)).body.message).toBe(
      'Parameter tidak dikenal: x.',
    );
  });
});
