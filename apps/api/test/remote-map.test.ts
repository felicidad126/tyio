import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { RemoteMap, RemoteMapPoint, RemotePage, TicketQueuePage } from '@tyio/shared';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from './create-test-app.js';
import {
  closeTicketDirect,
  insertMasterValue,
  insertRemote,
  insertTenant,
  insertTicket,
  insertUser,
  moveTicketDirect,
  TEST_PASSWORD,
} from './fixtures.js';

// Peta remote (langkah 2.3, T140–T143). Inti uji: titik di peta dan angka "tanpa koordinat"
// sama dengan daftar remote dengan saringan yang sama, dan jumlah NPR berjalan per titik sama
// dengan total antrean NPR remote itu. Data: dua customer baru dan pengguna yang hanya
// melihat keduanya, jadi berkas uji lain yang menulis paralel tidak mengubah angka.

type Agent = ReturnType<typeof request.agent>;

const ids = (map: RemoteMap) => map.points.map((point) => point[0]).sort();

describe('peta remote', () => {
  let app: NestExpressApplication;
  let dataSource: DataSource;
  /** L1 yang hanya melihat customer A dan B. */
  let op: Agent;
  let tenantA: { id: string; code: string; name: string };
  let tenantB: { id: string; code: string; name: string };
  let vsatA: { id: string };
  type Key = 'makassar' | 'palu' | 'tanpa' | 'nonaktif' | 'nonaktifTanpa' | 'jayapura' | 'tanpaB';
  const r: Record<Key, { id: string; code: string; name: string }> = {} as never;

  const map = async (query = '', agent = op) =>
    (await agent.get(`/api/remote-map${query ? `?${query}` : ''}`).expect(200)).body as RemoteMap;
  const list = async (query: string) =>
    (await op.get(`/api/remotes?${query}&pageSize=100`).expect(200)).body as RemotePage;

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
    const marker = randomUUID().slice(0, 6);
    tenantA = await insertTenant(dataSource, `Bank Peta ${marker}`);
    tenantB = await insertTenant(dataSource, `BPD Peta ${marker}`);
    const user = await insertUser(dataSource, { role: 'l1', tenantCodes: [tenantA.code, tenantB.code] });
    op = request.agent(app.getHttpServer());
    await op.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD }).expect(200);

    vsatA = await insertMasterValue(dataSource, 'jarkom', tenantA.id, 'VSAT peta');
    r.makassar = await insertRemote(dataSource, tenantA.id, {
      name: `ATM Makassar ${marker}`,
      networkId: vsatA.id,
      latitude: -5.134912,
      longitude: 119.412833,
    });
    r.palu = await insertRemote(dataSource, tenantA.id, { name: `ATM Palu ${marker}`, latitude: -0.9, longitude: 119.87 });
    r.tanpa = await insertRemote(dataSource, tenantA.id, { name: `ATM Tanpa Titik ${marker}` });
    r.nonaktif = await insertRemote(dataSource, tenantA.id, {
      name: `ATM Lama ${marker}`,
      active: false,
      latitude: 3.59,
      longitude: 98.67,
    });
    r.nonaktifTanpa = await insertRemote(dataSource, tenantA.id, { active: false });
    r.jayapura = await insertRemote(dataSource, tenantB.id, { latitude: -2.53, longitude: 140.72 });
    r.tanpaB = await insertRemote(dataSource, tenantB.id);

    // Makassar: 2 berjalan (terbuka, pulih) + 1 ditutup; Palu: semua ditutup; Jayapura: 1 berjalan.
    await insertTicket(dataSource, tenantA.id, { remoteId: r.makassar.id });
    const pulih = await insertTicket(dataSource, tenantA.id, { remoteId: r.makassar.id });
    await moveTicketDirect(dataSource, pulih.id, 'pulih');
    await closeTicketDirect(dataSource, (await insertTicket(dataSource, tenantA.id, { remoteId: r.makassar.id })).id);
    await closeTicketDirect(dataSource, (await insertTicket(dataSource, tenantA.id, { remoteId: r.palu.id })).id);
    await insertTicket(dataSource, tenantB.id, { remoteId: r.jayapura.id });
    await insertTicket(dataSource, tenantA.id, { remoteId: r.tanpa.id });
  });

  afterAll(async () => {
    await app.close();
  });

  it('hanya remote aktif yang punya koordinat; koordinat dan jumlah NPR berjalan apa adanya (T141)', async () => {
    const result = await map();
    const byId = new Map(result.points.map((point) => [point[0], point]));

    expect([...byId.keys()].sort()).toEqual([r.makassar.id, r.palu.id, r.jayapura.id].sort());
    expect(byId.get(r.makassar.id)).toEqual([
      r.makassar.id,
      r.makassar.code,
      r.makassar.name,
      -5.134912,
      119.412833,
      2,
    ] satisfies RemoteMapPoint);
    expect(byId.get(r.palu.id)?.[5]).toBe(0);
    expect(byId.get(r.jayapura.id)?.[5]).toBe(1);
    expect(result.withoutCoordinates).toBe(2); // r.tanpa dan r.tanpaB; yang nonaktif tidak dihitung
  });

  it('jumlah NPR berjalan per titik sama dengan total antrean NPR remote itu', async () => {
    const result = await map();
    for (const [id, code, , , , open] of result.points) {
      const queue = (await op.get(`/api/tickets?remoteId=${id}`).expect(200)).body as TicketQueuePage;
      expect(open, code).toBe(queue.total);
    }
  });

  it('titik dan angka tanpa koordinat sama dengan daftar remote dengan saringan yang sama (T143)', async () => {
    const cases: Array<[string, string]> = [
      ['', 'active=true'],
      [`tenantId=${tenantA.id}`, `tenantId=${tenantA.id}&active=true`],
      ['active=false', 'active=false'],
      [`q=${encodeURIComponent('Makassar')}`, `q=Makassar&active=true`],
      [`networkId=${vsatA.id}`, `networkId=${vsatA.id}&active=true`],
    ];
    for (const [mapQuery, listQuery] of cases) {
      const result = await map(mapQuery);
      const withCoordinates = await list(`${listQuery}&hasCoordinates=true`);
      const without = await list(`${listQuery}&hasCoordinates=false`);
      expect(ids(result), mapQuery).toEqual(withCoordinates.items.map((remote) => remote.id).sort());
      expect(result.withoutCoordinates, mapQuery).toBe(without.total);
    }
  });

  it('saringan: customer, jarkom, kata kunci, dan remote nonaktif', async () => {
    expect(ids(await map(`tenantId=${tenantB.id}`))).toEqual([r.jayapura.id]);
    expect(ids(await map(`networkId=${vsatA.id}`))).toEqual([r.makassar.id]);
    const search = await map(`q=${encodeURIComponent('Tanpa Titik')}`);
    expect(search).toEqual({ points: [], withoutCoordinates: 1 });
    const inactive = await map('active=false');
    expect(ids(inactive)).toEqual([r.nonaktif.id]);
    expect(inactive.withoutCoordinates).toBe(1);
  });

  it('id saringan yang bukan UUID menghasilkan peta kosong, bukan galat', async () => {
    expect(await map('tenantId=bukan-uuid')).toEqual({ points: [], withoutCoordinates: 0 });
    expect(await map('networkId=123')).toEqual({ points: [], withoutCoordinates: 0 });
  });

  it('menolak parameter yang tidak berlaku untuk peta dan nilai yang salah', async () => {
    for (const query of ['page=2', 'pageSize=10', 'hasCoordinates=true', 'active=ya', `q=${'x'.repeat(101)}`]) {
      await op.get(`/api/remote-map?${query}`).expect(400);
    }
  });

  it('daftar remote bisa disaring menurut ada/tidaknya koordinat', async () => {
    const without = await list(`tenantId=${tenantA.id}&hasCoordinates=false`);
    expect(without.items.map((remote) => remote.id).sort()).toEqual([r.tanpa.id, r.nonaktifTanpa.id].sort());
    const withCoordinates = await list(`tenantId=${tenantA.id}&hasCoordinates=true`);
    expect(withCoordinates.items.map((remote) => remote.id).sort()).toEqual(
      [r.makassar.id, r.palu.id, r.nonaktif.id].sort(),
    );
    await op.get('/api/remotes?hasCoordinates=ya').expect(400);
  });

  it('butuh sesi masuk', async () => {
    await request(app.getHttpServer()).get('/api/remote-map').expect(401);
  });
});
