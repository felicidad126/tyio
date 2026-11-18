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
import { TroubleTicketEntity } from '../src/modules/trouble-tickets/trouble-ticket.entity.js';
import {
  seedTenantOwnedData,
  TENANT_COLUMN_NOT_OWNED,
  TENANT_OWNED_TABLES_COVERED,
} from './tenant-data.js';
import { testConfig } from './test-config.js';
import { binaryParser, readXlsx } from './xlsx-read.js';

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
    await createUser(ds, { username: 'l2.semua', role: 'helpdesk', allTenants: true });
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
  // Rute GET yang wajib punya parameter pencarian: diuji dengan kata yang cocok dengan data
  // kedua tenant ("Remote <nama tenant>"), sehingga kebocoran tenant B pasti terlihat.
  // Laporan: periode tetap yang memuat NPR uji kedua tenant (dibuat 1 Nov 2026), tidak bergantung
  // pada tanggal uji dijalankan.
  const REPORT_PERIOD = 'from=2026-11-01&to=2026-11-30';
  const PROBE_QUERY: Readonly<Record<string, string>> = {
    '/api/search': 'q=Remote',
    '/api/reports/npr': REPORT_PERIOD,
    '/api/reports/npr/excel': REPORT_PERIOD,
  };
  // Rute yang menjawab berkas Excel: isinya dibongkar dan diperiksa seperti JSON. Berkas tidak
  // memuat id, jadi penanda customer di dalamnya adalah namanya.
  const XLSX_ROUTES = ['GET /api/reports/npr/excel'];
  const isXlsx = (route: RouteInfo) => XLSX_ROUTES.includes(`${route.method} ${route.path}`);
  const get = (path: string, who: keyof typeof cookies) => {
    const req = request(app.getHttpServer())
      .get(PROBE_QUERY[path] ? `${path}?${PROBE_QUERY[path]}` : path)
      .set('Cookie', cookies[who]);
    return XLSX_ROUTES.includes(`GET ${path}`) ? req.buffer(true).parse(binaryParser) : req;
  };
  /** Teks jawaban untuk dicari penandanya: JSON, atau isi lembar bila berkas Excel. */
  const textOf = (res: request.Response): string => {
    if (String(res.headers['content-type']).startsWith('application/vnd.openxmlformats')) {
      return readXlsx(res.body as Buffer).sheets.join('');
    }
    return Buffer.isBuffer(res.body) ? res.body.toString('utf8') : JSON.stringify(res.body);
  };
  const tenantMarker = (route: RouteInfo, tenant: Tenant) => (isXlsx(route) ? tenant.name : tenant.id);
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
  const MUTATION_TESTED = [
    'POST /api/tickets',
    'POST /api/tickets/:id/actions',
    'PATCH /api/tickets/:id',
    'POST /api/tickets/:id/tt',
    'POST /api/tickets/:id/tt/salin',
  ];
  // Rute yang menjawab berkas, bukan JSON: kontrol positifnya cukup 200 untuk id milik A.
  const BINARY_ROUTES = ['GET /api/attachments/:id'];
  // Rute kabar perubahan (2.2): saat dibuka belum berisi data, hanya kabar ketika ada perubahan.
  // Penyaringan per customer diuji dengan koneksi sungguhan di stream.test.ts; di sini rute ini
  // tetap ikut pemeriksaan "tidak membocorkan data tenant B".
  const EVENT_ROUTES = ['GET /api/stream'];
  const dataReads = () => scopedReads().filter((r) => !EVENT_ROUTES.includes(`${r.method} ${r.path}`));

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

  it('pengguna tenant A tidak bisa membuka TT atau menyalin ringkasan TT tiket tenant B (404, tidak berubah)', async () => {
    const ticketB = bIds[2]!;
    const actionsBefore = await ds.getRepository(TicketActionEntity).count();
    const ttBefore = await ds.getRepository(TroubleTicketEntity).count();
    const statusBefore = (await ds.getRepository(TicketEntity).findOneByOrFail({ id: ticketB })).status;

    const open = await call('POST', `/api/tickets/${ticketB}/tt`, 'a').send({ problem: 'Coba TT customer lain', expectedStatus: statusBefore });
    const copy = await call('POST', `/api/tickets/${ticketB}/tt/salin`, 'a').send({});

    for (const res of [open, copy]) {
      expect(res.status).toBe(404);
      for (const marker of bMarkers()) expect(JSON.stringify(res.body)).not.toContain(marker);
    }
    expect(await ds.getRepository(TicketActionEntity).count()).toBe(actionsBefore);
    expect(await ds.getRepository(TroubleTicketEntity).count()).toBe(ttBefore);
    expect((await ds.getRepository(TicketEntity).findOneByOrFail({ id: ticketB })).status).toBe(statusBefore);
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

  it('riwayat tiket remote customer lain (GET /api/tickets?remoteId=) kosong untuk pengguna tenant A', async () => {
    const remoteB = bIds[1]!;
    const own = await call('GET', `/api/tickets?view=semua&remoteId=${remoteB}`, 'semua').expect(200);
    expect(own.body.total).toBeGreaterThan(0);

    const res = await call('GET', `/api/tickets?view=semua&remoteId=${remoteB}`, 'a').expect(200);

    expect(res.body).toMatchObject({ items: [], total: 0 });
    for (const marker of bMarkers()) expect(JSON.stringify(res.body)).not.toContain(marker);
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
        const body = textOf(res);
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
    for (const route of dataReads()) {
      const ids = hasParams(route.path) ? aIds : [''];
      const answers = await Promise.all(ids.map(async (id) => ({ id, res: await get(fill(route.path, id), 'a') })));
      const binary = BINARY_ROUTES.includes(`${route.method} ${route.path}`);
      // Jawaban memuat penanda tenant A, atau id data A lain selain yang dipakai di alamat.
      const found = answers.some(
        ({ id, res }) =>
          res.status === 200 &&
          (binary ||
            [tenantMarker(route, a), ...aIds.filter((other) => other !== id)].some((x) => textOf(res).includes(x))),
      );

      expect(found, `${route.method} ${route.path} tidak mengembalikan data tenant A`).toBe(true);
    }
  });

  it('pengguna semua tenant melihat A dan B; pengguna tanpa tenant tidak melihat keduanya', async () => {
    for (const route of dataReads().filter((r) => !hasParams(r.path))) {
      const all = textOf(await get(route.path, 'semua').expect(200));
      const none = textOf(await get(route.path, 'kosong').expect(200));

      expect(all, `${route.method} ${route.path}`).toContain(tenantMarker(route, a));
      expect(all, `${route.method} ${route.path}`).toContain(tenantMarker(route, b));
      expect(none, `${route.method} ${route.path}`).not.toContain(tenantMarker(route, a));
      expect(none, `${route.method} ${route.path}`).not.toContain(tenantMarker(route, b));
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
