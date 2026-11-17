import type { INestApplication } from '@nestjs/common';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import {
  MASTER_LABELS,
  MASTER_LISTS,
  type MasterItem,
  type MasterItemResponse,
  type MasterList,
  type MasterListResponse,
} from '@tyio/shared';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AuditEntryEntity } from '../src/common/audit/audit-entry.entity.js';
import { listRoutes } from '../src/common/tenant/tenant-policy.js';
import { MASTER_TABLES } from '../src/modules/master/master.entities.js';
import { TenantEntity } from '../src/modules/tenants/tenant.entity.js';
import { createTestApp } from './create-test-app.js';
import { resetData } from './db.js';
import { createTenant, createUser, sessionCookieFrom, TEST_PASSWORD } from './fixtures.js';

describe('master data: customer, kategori, system, jarkom', () => {
  let app: INestApplication;
  let ds: DataSource;
  let admin: string;

  beforeAll(async () => {
    app = await createTestApp();
    ds = app.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetData(ds);
    await createUser(ds, { username: 'admin.uji', role: 'admin', allTenants: true });
    admin = await loginAs('admin.uji');
  });

  const http = () => request(app.getHttpServer());
  const base = (list: MasterList) => `/api/admin/master/${list}`;

  async function loginAs(username: string): Promise<string> {
    const res = await http().post('/api/auth/login').send({ username, password: TEST_PASSWORD }).expect(200);
    return sessionCookieFrom(res.headers['set-cookie']);
  }

  const listOf = async (list: MasterList, cookie = admin): Promise<MasterItem[]> =>
    ((await http().get(base(list)).set('Cookie', cookie).expect(200)).body as MasterListResponse).items;

  const create = (list: MasterList, body: object, cookie = admin) =>
    http().post(base(list)).set('Cookie', cookie).send(body);

  const createOk = async (list: MasterList, code: string, name: string): Promise<MasterItem> =>
    ((await create(list, { code, name }).expect(201)).body as MasterItemResponse).item;

  const patch = (list: MasterList, id: string, body: object) =>
    http().patch(`${base(list)}/${id}`).set('Cookie', admin).send(body);

  const remove = (list: MasterList, id: string) =>
    http().delete(`${base(list)}/${id}`).set('Cookie', admin);

  describe('mengelola daftar', () => {
    it.each(MASTER_LISTS)('%s: tambah, lalu tampil di daftar beserta statusnya', async (list) => {
      const item = await createOk(list, ' ab1 ', '  Contoh   Satu ');

      expect(item).toEqual({ id: expect.any(String), code: 'AB1', name: 'Contoh Satu', active: true });
      expect(await listOf(list)).toEqual([item]);
    });

    it('daftar memuat yang nonaktif juga, urut kode', async () => {
      const b = await createOk('kategori', 'CM', 'Corrective Maintenance');
      const a = await createOk('kategori', 'RD', 'Remote Down');
      await patch('kategori', a.id, { active: false }).expect(200);

      expect(await listOf('kategori')).toEqual([b, { ...a, active: false }]);
    });

    it('nama bisa diubah; kode tidak, karena dipakai di nomor tiket', async () => {
      const item = await createOk('jarkom', 'VSAT', 'VSAT');

      const renamed = await patch('jarkom', item.id, { name: 'VSAT Satelit' }).expect(200);
      expect((renamed.body as MasterItemResponse).item).toEqual({ ...item, name: 'VSAT Satelit' });

      const res = await patch('jarkom', item.id, { code: 'SAT' }).expect(400);
      expect(res.body).toMatchObject({ message: 'Kode tidak bisa diubah setelah dibuat.', field: 'code' });
      expect((await listOf('jarkom'))[0]?.code).toBe('VSAT');
    });

    it('menonaktifkan customer menyembunyikannya dari pilihan customer, lalu bisa diaktifkan lagi', async () => {
      const item = await createOk('customer', 'BUJ', 'Bank Uji Jaya');
      const pickable = async () =>
        (await http().get('/api/tenants').set('Cookie', admin).expect(200)).body.tenants.map(
          (t: { code: string }) => t.code,
        );
      expect(await pickable()).toEqual(['BUJ']);

      await patch('customer', item.id, { active: false }).expect(200);
      expect(await pickable()).toEqual([]);
      expect((await listOf('customer'))[0]?.active).toBe(false);

      await patch('customer', item.id, { active: true }).expect(200);
      expect(await pickable()).toEqual(['BUJ']);
    });
  });

  describe('isian ditolak dengan pesan per kolom', () => {
    it.each([
      [{ code: 'A', name: 'Nama Sah' }, 'code', /Kode hanya huruf A–Z dan angka/],
      [{ code: 'A B', name: 'Nama Sah' }, 'code', /Kode hanya huruf A–Z dan angka/],
      [{ code: 'A/B', name: 'Nama Sah' }, 'code', /Kode hanya huruf A–Z dan angka/],
      [{ code: '', name: 'Nama Sah' }, 'code', /Isi kode/],
      [{ code: 'OK', name: ' ' }, 'name', /Isi nama/],
      [{ code: 'OK', name: 'x'.repeat(121) }, 'name', /Nama 2–120 karakter/],
      [{ code: 'OK' }, 'name', /Isi nama/],
      [{ code: 7, name: 'Nama Sah' }, 'code', /Isi kode/],
      [{ code: 'OK', name: 'Nama Sah', active: false }, 'active', /Kolom tidak dikenal: active/],
    ])('%o → %s', async (body, field, message) => {
      const res = await create('system', body).expect(400);

      expect(res.body).toMatchObject({ statusCode: 400, field, message: expect.stringMatching(message) });
      expect(await listOf('system')).toEqual([]);
    });

    it('ubah tanpa isi, status bukan boolean, atau kolom asing ditolak', async () => {
      const item = await createOk('system', 'SYA', 'System A');

      expect((await patch('system', item.id, {}).expect(400)).body.message).toBe('Tidak ada yang diubah.');
      expect((await patch('system', item.id, { active: 'tidak' }).expect(400)).body).toMatchObject({
        field: 'active',
      });
      expect((await patch('system', item.id, { warna: 'merah' }).expect(400)).body).toMatchObject({
        message: 'Kolom tidak dikenal: warna.',
      });
    });

    it.each(MASTER_LISTS)(
      '%s: kode dan nama wajib unik dalam satu daftar; nama tanpa beda huruf besar/kecil',
      async (list) => {
        const label = MASTER_LABELS[list];
        await createOk(list, 'BUA', 'Uji Anggrek');

        expect((await create(list, { code: 'bua', name: 'Lain' }).expect(409)).body).toMatchObject({
          message: `Kode BUA sudah dipakai di daftar ${label}.`,
          field: 'code',
        });
        expect((await create(list, { code: 'BUB', name: 'UJI ANGGREK' }).expect(409)).body).toMatchObject({
          message: `Nama UJI ANGGREK sudah dipakai di daftar ${label}.`,
          field: 'name',
        });

        const other = await createOk(list, 'BUC', 'Uji Cempaka');
        expect((await patch(list, other.id, { name: 'uji anggrek' }).expect(409)).body).toMatchObject({
          field: 'name',
        });
      },
    );

    it('daftar yang berbeda boleh memakai kode yang sama', async () => {
      await createOk('kategori', 'PM', 'Preventive Maintenance');
      await createOk('system', 'PM', 'System PM');
    });

    it('id tidak dikenal → 404; id bukan uuid → 400', async () => {
      const missing = '01900000-0000-7000-8000-00000000abcd';
      expect((await patch('kategori', missing, { name: 'Baru' }).expect(404)).body.message).toBe(
        'Kategori tidak ditemukan.',
      );
      await remove('kategori', missing).expect(404);
      await remove('kategori', 'bukan-uuid').expect(400);
    });
  });

  describe('hapus hanya bila belum dipakai', () => {
    it('nilai yang belum dipakai bisa dihapus', async () => {
      const item = await createOk('kategori', 'XX', 'Salah Ketik');

      await remove('kategori', item.id).expect(204);

      expect(await listOf('kategori')).toEqual([]);
    });

    it('customer yang sudah dipakai ditolak (409) dengan saran menonaktifkan', async () => {
      const item = await createOk('customer', 'BUD', 'Bank Uji Dahlia');
      const tenant = { ...item, createdAt: new Date(), updatedAt: new Date() };
      await createUser(ds, { username: 'l1.dahlia', allTenants: false, tenants: [tenant] });

      const res = await remove('customer', item.id).expect(409);

      expect(res.body.message).toBe(
        'Customer Bank Uji Dahlia sudah dipakai, jadi tidak bisa dihapus. Nonaktifkan agar tidak muncul di pilihan baru; data lama tetap utuh.',
      );
      expect(await listOf('customer')).toEqual([item]);
    });

    it.each(MASTER_LISTS.filter((l) => l !== 'customer'))(
      '%s yang sudah dipakai ditolak (409)',
      async (list) => {
        const item = await createOk(list, 'DPK', 'Sudah Dipakai');
        // Tabel pemakai sementara, meniru remote dan tiket yang kelak merujuk master ini.
        const table = MASTER_TABLES[list];
        await ds.query(
          `CREATE TABLE uji_pemakai (ref uuid NOT NULL REFERENCES ${table} (id) ON DELETE RESTRICT)`,
        );
        try {
          await ds.query('INSERT INTO uji_pemakai (ref) VALUES ($1)', [item.id]);

          expect((await remove(list, item.id).expect(409)).body.message).toMatch(/sudah dipakai/);
          expect(await listOf(list)).toEqual([item]);
        } finally {
          await ds.query('DROP TABLE uji_pemakai');
        }
      },
    );

    // Penjaga untuk langkah berikutnya: remote, tiket, dll. yang merujuk master dengan
    // ON DELETE CASCADE akan ikut terhapus diam-diam saat master dihapus.
    it('setiap foreign key ke tabel master memakai RESTRICT atau NO ACTION', async () => {
      const rows: Array<{ name: string; on_delete: string }> = await ds.query(
        `SELECT conname AS name, confdeltype AS on_delete
           FROM pg_constraint
          WHERE contype = 'f' AND confrelid::regclass::text = ANY ($1)`,
        [Object.values(MASTER_TABLES)],
      );

      expect(rows.map((r) => r.name)).toContain('user_tenants_tenant_id_fkey');
      expect(rows.filter((r) => !['r', 'a'].includes(r.on_delete))).toEqual([]);
    });
  });

  it('setiap perubahan tercatat di audit log dengan pelaku admin', async () => {
    const item = await createOk('jarkom', 'AUD', 'Jarkom Audit');
    await patch('jarkom', item.id, { active: false }).expect(200);
    await remove('jarkom', item.id).expect(204);

    const rows = await ds.getRepository(AuditEntryEntity).find({
      where: { tableName: MASTER_TABLES.jarkom, rowId: item.id },
      order: { occurredAt: 'ASC', id: 'ASC' },
    });

    expect(rows.map((r) => [r.action, r.actor])).toEqual([
      ['insert', 'pengguna:admin.uji'],
      ['update', 'pengguna:admin.uji'],
      ['delete', 'pengguna:admin.uji'],
    ]);
  });

  describe('akses', () => {
    const adminRoutes = () =>
      listRoutes(app.get(DiscoveryService), app.get(MetadataScanner), app.get(Reflector)).filter((r) =>
        r.path.startsWith('/api/admin/'),
      );
    const call = (method: string, path: string, cookie?: string) => {
      const req = http()[method.toLowerCase() as 'get'](path.replace(':id', '01900000-0000-7000-8000-000000000001'));
      return cookie ? req.set('Cookie', cookie) : req;
    };

    it('ada rute admin untuk keempat daftar', () => {
      const paths = new Set(adminRoutes().map((r) => r.path));

      for (const list of MASTER_LISTS) {
        expect(paths).toContain(base(list));
        expect(paths).toContain(`${base(list)}/:id`);
      }
    });

    it('L1 dan L2 ditolak (403) di setiap rute admin, dan tidak ada yang berubah', async () => {
      await createUser(ds, { username: 'l1.uji', role: 'L1' });
      await createUser(ds, { username: 'l2.uji', role: 'L2' });
      const existing = await createOk('kategori', 'RD', 'Remote Down');

      for (const cookie of [await loginAs('l1.uji'), await loginAs('l2.uji')]) {
        for (const route of adminRoutes()) {
          const res = await call(route.method, route.path.replace(':id', existing.id), cookie).send({
            code: 'L1X',
            name: 'Dari L1',
            active: false,
          });
          expect(res.status, `${route.method} ${route.path}`).toBe(403);
        }
      }
      expect(await listOf('kategori')).toEqual([existing]);
    });

    it('admin yang dibatasi ke sebagian customer ditolak (403): master berlaku untuk semua customer', async () => {
      const a = await createTenant(ds, 'TNA', 'Bank Uji Anggrek');
      await createTenant(ds, 'TNB', 'Bank Uji Rahasia');
      await createUser(ds, { username: 'admin.terbatas', role: 'admin', allTenants: false, tenants: [a] });
      const cookie = await loginAs('admin.terbatas');

      for (const route of adminRoutes()) {
        const res = await call(route.method, route.path, cookie).send({ code: 'TNC', name: 'Bank Baru' });
        expect(res.status, `${route.method} ${route.path}`).toBe(403);
        expect(JSON.stringify(res.body)).not.toContain('Rahasia');
      }
      const tenants = await ds.getRepository(TenantEntity).find({ order: { code: 'ASC' } });
      expect(tenants.map((t) => t.code)).toEqual(['TNA', 'TNB']);
    });

    it('tanpa login: 401', async () => {
      for (const route of adminRoutes()) {
        expect((await call(route.method, route.path)).status, `${route.method} ${route.path}`).toBe(401);
      }
    });
  });
});
