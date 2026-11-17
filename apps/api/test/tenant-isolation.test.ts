import { Controller, Get, type INestApplication } from '@nestjs/common';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { listRoutes, type RouteInfo } from '../src/common/tenant/tenant-policy.js';
import type { Tenant } from '../src/modules/tenants/tenant.entity.js';
import { createTestApp } from './create-test-app.js';
import { resetData } from './db.js';
import { createTenant, createUser, ensureCategory, sessionCookieFrom, TEST_PASSWORD } from './fixtures.js';
import { TicketEntity } from '../src/modules/tickets/ticket.entity.js';
import { TicketActionEntity } from '../src/modules/tickets/ticket-action.entity.js';
import {
  seedTenantOwnedData,
  TENANT_COLUMN_NOT_OWNED,
  TENANT_OWNED_TABLES_COVERED,
} from './tenant-data.js';
import { testConfig } from './test-config.js';

describe('isolasi tenant di semua rute terdaftar', () => {
  let app: INestApplication;
  let ds: DataSource;
  let routes: RouteInfo[];
  let a: Tenant;
  let b: Tenant;
  let aIds: string[];
  let bIds: string[];
  const cookies: Record<'a' | 'semua' | 'kosong' | 'adminA' | 'adminSemua', string> = {
    a: '',
    semua: '',
    kosong: '',
    adminA: '',
    adminSemua: '',
  };

  beforeAll(async () => {
    app = await createTestApp();
    ds = app.get(DataSource);
    routes = listRoutes(app.get(DiscoveryService), app.get(MetadataScanner), app.get(Reflector));

    await resetData(ds);
    a = await createTenant(ds, 'TNA', 'Bank Uji Anggrek');
    b = await createTenant(ds, 'TNB', 'Bank Uji Rahasia');
    aIds = [a.id, ...(await seedTenantOwnedData(ds, a))];
    bIds = [b.id, ...(await seedTenantOwnedData(ds, b))];
    await createUser(ds, { username: 'l1.hanya-a', allTenants: false, tenants: [a] });
    await createUser(ds, { username: 'l2.semua', role: 'L2', allTenants: true });
    await createUser(ds, { username: 'l1.kosong', allTenants: false, tenants: [] });
    await createUser(ds, { username: 'admin.hanya-a', role: 'admin', allTenants: false, tenants: [a] });
    await createUser(ds, { username: 'admin.semua', role: 'admin', allTenants: true });
    for (const [key, username] of [
      ['a', 'l1.hanya-a'],
      ['semua', 'l2.semua'],
      ['kosong', 'l1.kosong'],
      ['adminA', 'admin.hanya-a'],
      ['adminSemua', 'admin.semua'],
    ] as const) {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ username, password: TEST_PASSWORD })
        .expect(200);
      cookies[key] = sessionCookieFrom(res.headers['set-cookie']);
    }
  });

  afterAll(async () => {
    await app.close();
  });

  const scopedRoutes = () => routes.filter((r) => r.policy?.kind === 'scoped');
  const scopedReads = () => scopedRoutes().filter((r) => r.method === 'GET');
  const allTenantRoutes = () => routes.filter((r) => r.policy?.kind === 'all');
  const fill = (path: string, id: string) => path.replace(/:[A-Za-z]+/g, id);
  const hasParams = (path: string) => /:[A-Za-z]+/.test(path);
  const get = (path: string, who: keyof typeof cookies) =>
    request(app.getHttpServer()).get(path).set('Cookie', cookies[who]);
  const call = (method: string, path: string, who?: keyof typeof cookies) => {
    const req = request(app.getHttpServer())[method.toLowerCase() as 'get'](path);
    return who ? req.set('Cookie', cookies[who]) : req;
  };
  const bMarkers = () => [...bIds, b.code, b.name];

  it('setiap rute menyatakan kebijakan tenant', () => {
    const undeclared = routes.filter((r) => !r.policy).map((r) => `${r.method} ${r.path}`);

    expect(undeclared).toEqual([]);
    expect(scopedRoutes().length).toBeGreaterThan(0);
  });

  // Setiap rute tenant yang mengubah data wajib punya uji lintas-tenant sendiri di bawah ini.
  const MUTATION_TESTED = ['POST /api/tickets', 'POST /api/tickets/:id/actions', 'PATCH /api/tickets/:id'];
  // Rute yang menjawab berkas, bukan JSON: kontrol positifnya cukup 200 untuk id milik A.
  const BINARY_ROUTES = ['GET /api/attachments/:id'];

  it('setiap rute tenant yang mengubah data punya uji mutasi lintas-tenant', () => {
    const mutating = scopedRoutes().filter((r) => r.method !== 'GET');

    expect(mutating.map((r) => `${r.method} ${r.path}`).sort(), 'tambahkan uji mutasi lintas-tenant').toEqual(
      [...MUTATION_TESTED].sort(),
    );
  });

  it('pengguna tenant A tidak bisa menambah tindakan atau mengubah tiket tenant B (404, tidak berubah)', async () => {
    const ticketB = bIds[2]!;
    const before = await ds.getRepository(TicketActionEntity).count();
    const statusBefore = (await ds.getRepository(TicketEntity).findOneByOrFail({ id: ticketB })).status;

    const add = await call('POST', `/api/tickets/${ticketB}/actions`, 'a').send({
      occurredAt: new Date().toISOString(),
      note: 'Coba menulis di tiket customer lain',
      statusTo: 'dikerjakan',
      expectedStatus: statusBefore,
    });
    const patch = await call('PATCH', `/api/tickets/${ticketB}`, 'a').send({ customerTicketNumber: 'X-1' });

    for (const res of [add, patch]) {
      expect(res.status).toBe(404);
      for (const marker of bMarkers()) expect(JSON.stringify(res.body)).not.toContain(marker);
    }
    expect(await ds.getRepository(TicketActionEntity).count()).toBe(before);
    expect(await ds.getRepository(TicketEntity).findOneByOrFail({ id: ticketB })).toMatchObject({
      status: statusBefore,
      customerTicketNumber: null,
    });
  });

  it('pengguna tenant A tidak bisa membuat tiket pada remote tenant B (404, tidak ada yang dibuat)', async () => {
    const remoteB = bIds[1]!;
    const category = await ensureCategory(ds);
    const before = await ds.getRepository(TicketEntity).count();

    const res = await call('POST', '/api/tickets', 'a').send({
      remoteId: remoteB,
      categoryId: category.id,
      occurredAt: new Date().toISOString(),
      problem: 'Coba buat tiket lintas customer',
      confirmOpenTickets: true,
    });

    expect(res.status).toBe(404);
    for (const marker of bMarkers()) expect(JSON.stringify(res.body)).not.toContain(marker);
    expect(await ds.getRepository(TicketEntity).count()).toBe(before);
  });

  it('setiap tabel ber-tenant_id punya data uji lintas-tenant', async () => {
    const rows: Array<{ table_name: string }> = await ds.query(
      `SELECT table_name FROM information_schema.columns
        WHERE table_schema = 'public' AND column_name = 'tenant_id'`,
    );
    const uncovered = rows
      .map((r) => r.table_name)
      .filter((t) => !TENANT_OWNED_TABLES_COVERED.includes(t) && !(t in TENANT_COLUMN_NOT_OWNED));

    expect(uncovered, 'tambahkan ke test/tenant-data.ts').toEqual([]);
  });

  // Semua rute GET diperiksa, apa pun tandanya: rute yang salah ditandai @NoTenantData
  // tetap ketahuan bila jawabannya memuat data tenant lain.
  it('pengguna tenant A tidak menerima data tenant B dari rute GET mana pun', async () => {
    for (const route of routes.filter((r) => r.method === 'GET')) {
      const probes = hasParams(route.path) ? bIds.map((id) => fill(route.path, id)) : [route.path];
      for (const path of probes) {
        const res = await get(path, 'a');
        const body = JSON.stringify(res.body);
        for (const marker of bMarkers()) {
          expect(body, `${route.method} ${path} membocorkan "${marker}"`).not.toContain(marker);
        }
        if (route.policy?.kind === 'scoped' && hasParams(route.path)) {
          expect(res.status, `${route.method} ${path}`).toBe(404);
        }
      }
    }
  });

  // Kontrol positif: rute yang sama memang mengembalikan data tenant A, jadi uji
  // di atas tidak lulus hanya karena rutenya kosong atau rusak.
  it('rute yang sama mengembalikan data tenant A kepada pengguna tenant A', async () => {
    for (const route of scopedReads()) {
      const ids = hasParams(route.path) ? aIds : [''];
      const answers = await Promise.all(ids.map(async (id) => ({ id, res: await get(fill(route.path, id), 'a') })));
      const binary = BINARY_ROUTES.includes(`${route.method} ${route.path}`);
      // Jawaban memuat id tenant A, atau id data A lain selain yang dipakai di alamat.
      const found = answers.some(
        ({ id, res }) =>
          res.status === 200 &&
          (binary || [a.id, ...aIds.filter((other) => other !== id)].some((x) => JSON.stringify(res.body).includes(x))),
      );

      expect(found, `${route.method} ${route.path} tidak mengembalikan data tenant A`).toBe(true);
    }
  });

  it('pengguna semua tenant melihat A dan B; pengguna tanpa tenant tidak melihat keduanya', async () => {
    for (const route of scopedReads().filter((r) => !hasParams(r.path))) {
      const all = JSON.stringify((await get(route.path, 'semua').expect(200)).body);
      const none = JSON.stringify((await get(route.path, 'kosong').expect(200)).body);

      expect(all).toContain(a.id);
      expect(all).toContain(b.id);
      expect(none).not.toContain(a.id);
      expect(none).not.toContain(b.id);
    }
  });

  // Rute lintas customer (@AllTenants, mis. master data) hanya untuk pengguna dengan akses
  // semua customer. Admin yang dibatasi ke sebagian customer ditolak untuk setiap metode,
  // sebelum isian dibaca, dan jawabannya tidak memuat data tenant lain.
  it('rute lintas customer menolak pengguna yang dibatasi ke sebagian customer, termasuk admin', async () => {
    expect(allTenantRoutes().length).toBeGreaterThan(0);
    for (const route of allTenantRoutes()) {
      for (const who of ['a', 'adminA'] as const) {
        const res = await call(route.method, fill(route.path, b.id), who).send({});
        expect(res.status, `${route.method} ${route.path} oleh ${who}`).toBe(403);
        for (const marker of bMarkers()) {
          expect(JSON.stringify(res.body), `${route.method} ${route.path}`).not.toContain(marker);
        }
      }
    }
  });

  it('rute lintas customer melayani admin dengan akses semua customer', async () => {
    for (const route of allTenantRoutes().filter((r) => r.method === 'GET' && !hasParams(r.path))) {
      await get(route.path, 'adminSemua').expect(200);
    }
  });

  it('tanpa login, rute tenant dan rute lintas customer menjawab 401', async () => {
    for (const route of [...scopedRoutes(), ...allTenantRoutes()]) {
      const res = await call(route.method, fill(route.path, a.id));
      expect(res.status, `${route.method} ${route.path}`).toBe(401);
    }
  });
});

describe('pemeriksaan kebijakan tenant saat aplikasi start', () => {
  @Controller('uji-tanpa-kebijakan')
  class TanpaKebijakanController {
    @Get()
    ambil(): string {
      return 'x';
    }
  }

  it('menolak start bila ada rute tanpa kebijakan tenant', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.register(testConfig())],
      controllers: [TanpaKebijakanController],
    }).compile();
    const app = moduleRef.createNestApplication({ logger: false });

    await expect(app.init()).rejects.toThrow(/uji-tanpa-kebijakan/);
    await app.close();
  });
});
