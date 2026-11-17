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
import { createTenant, createUser, sessionCookieFrom, TEST_PASSWORD } from './fixtures.js';
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
  const cookies: Record<'a' | 'semua' | 'kosong', string> = { a: '', semua: '', kosong: '' };

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
    for (const [key, username] of [
      ['a', 'l1.hanya-a'],
      ['semua', 'l2.semua'],
      ['kosong', 'l1.kosong'],
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
  const fill = (path: string, id: string) => path.replace(/:[A-Za-z]+/g, id);
  const hasParams = (path: string) => /:[A-Za-z]+/.test(path);
  const get = (path: string, who: keyof typeof cookies) =>
    request(app.getHttpServer()).get(path).set('Cookie', cookies[who]);
  const bMarkers = () => [...bIds, b.code, b.name];

  it('setiap rute menyatakan kebijakan tenant', () => {
    const undeclared = routes.filter((r) => !r.policy).map((r) => `${r.method} ${r.path}`);

    expect(undeclared).toEqual([]);
    expect(scopedRoutes().length).toBeGreaterThan(0);
  });

  it('rute tenant yang mengubah data belum ada; bila ditambah, uji mutasinya wajib ditambah di sini', () => {
    const mutating = scopedRoutes().filter((r) => r.method !== 'GET');

    expect(mutating.map((r) => `${r.method} ${r.path}`), 'tambahkan uji mutasi lintas-tenant').toEqual(
      [],
    );
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
    for (const route of scopedRoutes()) {
      const paths = hasParams(route.path) ? aIds.map((id) => fill(route.path, id)) : [route.path];
      const answers = await Promise.all(paths.map((path) => get(path, 'a')));
      const found = answers.some((res) => res.status === 200 && JSON.stringify(res.body).includes(a.id));

      expect(found, `${route.method} ${route.path} tidak mengembalikan data tenant A`).toBe(true);
    }
  });

  it('pengguna semua tenant melihat A dan B; pengguna tanpa tenant tidak melihat keduanya', async () => {
    for (const route of scopedRoutes().filter((r) => !hasParams(r.path))) {
      const all = JSON.stringify((await get(route.path, 'semua').expect(200)).body);
      const none = JSON.stringify((await get(route.path, 'kosong').expect(200)).body);

      expect(all).toContain(a.id);
      expect(all).toContain(b.id);
      expect(none).not.toContain(a.id);
      expect(none).not.toContain(b.id);
    }
  });

  it('tanpa login, rute tenant menjawab 401', async () => {
    for (const route of scopedRoutes()) {
      await request(app.getHttpServer()).get(fill(route.path, a.id)).expect(401);
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
