import { randomBytes } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { CustomerRecord, MasterKind, MasterValue } from '@tyio/shared';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FORBIDDEN_ROLE_MESSAGE } from '../src/modules/auth/roles.guard.js';
import { createTestApp } from './create-test-app.js';
import {
  insertMasterValue,
  insertTenant,
  insertUser,
  operatorQuery,
  TEST_PASSWORD,
  uniqueTenantCode,
} from './fixtures.js';

// Data master (langkah 1.1): admin mengelola customer, kategori, system, dan jarkom per
// customer; nilai yang sudah dipakai tidak bisa dihapus, hanya dinonaktifkan.
// Isolasi antar-customer diuji di tenant-isolation.test.ts.

type Agent = ReturnType<typeof request.agent>;

const TABLES: Record<MasterKind, string> = {
  kategori: 'master_categories',
  system: 'master_systems',
  jarkom: 'master_networks',
};

const shortId = () => randomBytes(3).toString('hex').toUpperCase();

describe('data master', () => {
  let app: NestExpressApplication;
  let dataSource: DataSource;
  let admin: Agent;
  let adminEmail: string;
  let operator: Agent;
  let tenant: { id: string; code: string; name: string };

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
    tenant = await insertTenant(dataSource, 'Bank Master');

    const login = async (role: 'admin' | 'l1') => {
      const user = await insertUser(dataSource, { role });
      const agent = request.agent(app.getHttpServer());
      await agent.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD }).expect(200);
      return { agent, email: user.email };
    };
    ({ agent: admin, email: adminEmail } = await login('admin'));
    ({ agent: operator } = await login('l1'));
  });

  afterAll(async () => {
    await app.close();
  });

  describe('kategori, system, dan jarkom', () => {
    it.for(['kategori', 'system'] as const)('%s: admin menambah, mengganti nama, menonaktifkan', async (kind) => {
      const created = await admin
        .post(`/api/master/${kind}`)
        .send({ tenantId: tenant.id, name: '  Remote   Down  ' })
        .expect(201);
      const value = created.body as MasterValue;
      expect(value).toMatchObject({ tenantId: tenant.id, name: 'Remote Down', code: null, active: true });

      const renamed = await admin.patch(`/api/master/${kind}/${value.id}`).send({ name: 'Link Down' }).expect(200);
      expect((renamed.body as MasterValue).name).toBe('Link Down');

      await admin.patch(`/api/master/${kind}/${value.id}`).send({ active: false }).expect(200);

      // Nilai nonaktif tetap ada di daftar (data lama memakainya), dengan tanda nonaktif.
      const list = await operator.get(`/api/master/${kind}?tenantId=${tenant.id}`).expect(200);
      expect(list.body as MasterValue[]).toContainEqual({ ...value, name: 'Link Down', active: false });

      await admin.patch(`/api/master/${kind}/${value.id}`).send({ active: true }).expect(200);
    });

    it('jarkom wajib punya kode; huruf kecil diubah ke huruf besar', async () => {
      const code = `v${shortId()}`.slice(0, 8);

      const res = await admin
        .post('/api/master/jarkom')
        .send({ tenantId: tenant.id, name: `VSAT ${code}`, code })
        .expect(201);

      expect((res.body as MasterValue).code).toBe(code.toUpperCase());
      const missing = await admin.post('/api/master/jarkom').send({ tenantId: tenant.id, name: 'Tanpa kode' });
      expect(missing.status).toBe(400);
      for (const bad of ['V', 'VSAT-1', 'VSAT 1', 'ABCDEFGHIJK']) {
        await admin.post('/api/master/jarkom').send({ tenantId: tenant.id, name: `Kode ${bad}`, code: bad }).expect(400);
      }
    });

    it('kode dan customer tidak bisa diubah lewat API', async () => {
      const network = await insertMasterValue(dataSource, 'jarkom', tenant.id);
      const other = await insertTenant(dataSource, 'Bank Lain');

      const res = await admin.patch(`/api/master/jarkom/${network.id}`).send({ code: 'BARU' }).expect(400);
      expect(res.body.message).toBe('Kolom ini tidak bisa diisi atau diubah: code.');
      await admin.patch(`/api/master/jarkom/${network.id}`).send({ tenantId: other.id }).expect(400);
      // Kategori dan system tidak punya kode.
      await admin.post('/api/master/kategori').send({ tenantId: tenant.id, name: 'Berkode', code: 'AB' }).expect(400);
    });

    it('database juga menolak perubahan customer atau kode nilai master', async () => {
      const network = await insertMasterValue(dataSource, 'jarkom', tenant.id);
      const other = await insertTenant(dataSource, 'Bank Pindah');

      await expect(
        operatorQuery(dataSource, 'UPDATE master_networks SET code = $1 WHERE id = $2', ['GANTI', network.id]),
      ).rejects.toThrow(/master_networks\.code tidak bisa diubah/);
      await expect(
        operatorQuery(dataSource, 'UPDATE master_networks SET tenant_id = $1 WHERE id = $2', [other.id, network.id]),
      ).rejects.toThrow(/master_networks\.tenant_id tidak bisa diubah/);
    });

    it('nama unik per customer tanpa membedakan huruf besar/kecil; customer lain boleh sama', async () => {
      const name = `Preventive ${shortId()}`;
      await admin.post('/api/master/kategori').send({ tenantId: tenant.id, name }).expect(201);

      const duplicate = await admin
        .post('/api/master/kategori')
        .send({ tenantId: tenant.id, name: name.toUpperCase() })
        .expect(409);
      expect(duplicate.body.message).toBe('Kategori dengan nama ini sudah ada di customer tersebut.');

      const other = await insertTenant(dataSource, 'Bank Kembar');
      await admin.post('/api/master/kategori').send({ tenantId: other.id, name }).expect(201);
    });

    it('mengganti nama menjadi nama yang sudah ada ditolak', async () => {
      const first = await insertMasterValue(dataSource, 'system', tenant.id);
      const second = await insertMasterValue(dataSource, 'system', tenant.id);

      await admin.patch(`/api/master/system/${second.id}`).send({ name: first.name.toLowerCase() }).expect(409);
    });

    it('kode jarkom unik per customer', async () => {
      const existing = await insertMasterValue(dataSource, 'jarkom', tenant.id);

      const res = await admin
        .post('/api/master/jarkom')
        .send({ tenantId: tenant.id, name: 'Jarkom kembar', code: existing.code })
        .expect(409);
      expect(res.body.message).toBe('Kode jarkom ini sudah ada di customer tersebut.');
    });

    it('menolak nama kosong, terlalu panjang, kolom tak dikenal, dan isi bukan objek', async () => {
      const post = (body: unknown) => admin.post('/api/master/system').send(body as object);

      expect((await post({ tenantId: tenant.id, name: '   ' }).expect(400)).body.message).toBe('Nama wajib diisi.');
      await post({ tenantId: tenant.id, name: 'x'.repeat(81) }).expect(400);
      await post({ tenantId: tenant.id, name: 'x'.repeat(80) }).expect(201);
      await post({ tenantId: tenant.id, name: 'Lebih', warna: 'merah' }).expect(400);
      await post([{ tenantId: tenant.id, name: 'Larik' }]).expect(400);
      await admin.patch(`/api/master/system/${(await insertMasterValue(dataSource, 'system', tenant.id)).id}`)
        .send({ active: 'ya' })
        .expect(400);
    });

    it('menambah nilai untuk customer nonaktif ditolak seperti customer tidak ada', async () => {
      const closed = await insertTenant(dataSource, 'Bank Tutup Master', { active: false });

      await admin.post('/api/master/kategori').send({ tenantId: closed.id, name: 'Apa saja' }).expect(404);
      await admin.post('/api/master/kategori').send({ tenantId: 'bukan-uuid', name: 'Apa saja' }).expect(404);
    });

    it('id yang bukan UUID atau tidak ada dijawab 404', async () => {
      const res = await admin.patch('/api/master/jarkom/bukan-uuid').send({ active: false }).expect(404);
      expect(res.body.message).toBe('Jarkom tidak ditemukan.');
      await admin.delete('/api/master/jarkom/00000000-0000-4000-8000-000000000000').expect(404);
    });

    it('operator L1 boleh membaca tetapi tidak boleh mengubah', async () => {
      const value = await insertMasterValue(dataSource, 'kategori', tenant.id);

      const list = await operator.get('/api/master/kategori').expect(200);
      expect((list.body as MasterValue[]).map((item) => item.id)).toContain(value.id);

      const post = await operator.post('/api/master/kategori').send({ tenantId: tenant.id, name: 'L1' }).expect(403);
      expect(post.body.message).toBe(FORBIDDEN_ROLE_MESSAGE);
      await operator.patch(`/api/master/kategori/${value.id}`).send({ active: false }).expect(403);
      await operator.delete(`/api/master/kategori/${value.id}`).expect(403);
      await operator.get('/api/master/customer').expect(403);
    });

    it('daftar urut nama seperti dibaca orang', async () => {
      const own = await insertTenant(dataSource, 'Bank Urut');
      for (const name of ['link down', 'Listrik Padam', 'Corrective 10', 'Corrective 9']) {
        await insertMasterValue(dataSource, 'kategori', own.id, name);
      }

      const res = await admin.get(`/api/master/kategori?tenantId=${own.id}`).expect(200);

      expect((res.body as MasterValue[]).map((value) => value.name)).toEqual([
        'Corrective 9',
        'Corrective 10',
        'link down',
        'Listrik Padam',
      ]);
    });
  });

  describe('nilai yang sudah dipakai hanya bisa dinonaktifkan (T45)', () => {
    // Tabel pemakai (remote, tiket) baru dibuat di langkah 1.2–1.3. Uji ini memakai tabel
    // pemakai sementara di schema terpisah dengan foreign key yang sama bentuknya.
    it.for(['kategori', 'system', 'jarkom'] as const)('%s', async (kind) => {
      const schema = `uji_pakai_${randomBytes(4).toString('hex')}`;
      const used = await insertMasterValue(dataSource, kind, tenant.id);
      const unused = await insertMasterValue(dataSource, kind, tenant.id);
      await dataSource.query(`CREATE SCHEMA ${schema}`);
      try {
        await dataSource.query(`CREATE TABLE ${schema}.pemakai (value_id uuid NOT NULL REFERENCES ${TABLES[kind]} (id))`);
        await dataSource.query(`INSERT INTO ${schema}.pemakai VALUES ($1)`, [used.id]);

        const res = await admin.delete(`/api/master/${kind}/${used.id}`).expect(409);
        expect(res.body.message).toMatch(/sudah dipakai, jadi tidak bisa dihapus\. Nonaktifkan saja\.$/);
        await admin.patch(`/api/master/${kind}/${used.id}`).send({ active: false }).expect(200);

        await admin.delete(`/api/master/${kind}/${unused.id}`).expect(204);
        const rows = (await dataSource.query(`SELECT id FROM ${TABLES[kind]} WHERE id = ANY($1)`, [
          [used.id, unused.id],
        ])) as Array<{ id: string }>;
        expect(rows.map((row) => row.id)).toEqual([used.id]);
      } finally {
        await dataSource.query(`DROP SCHEMA ${schema} CASCADE`);
      }
    });
  });

  describe('customer', () => {
    it('admin semua customer menambah customer; kode diubah ke huruf besar dan unik', async () => {
      const code = uniqueTenantCode().toLowerCase();

      const res = await admin.post('/api/master/customer').send({ code, name: 'Bank Baru' }).expect(201);
      expect(res.body as CustomerRecord).toMatchObject({ code: code.toUpperCase(), name: 'Bank Baru', active: true });

      const duplicate = await admin.post('/api/master/customer').send({ code, name: 'Bank Kembar' }).expect(409);
      expect(duplicate.body.message).toBe('Kode customer ini sudah dipakai.');
    });

    it('nama bisa diganti, kode tidak (juga di database)', async () => {
      const own = await insertTenant(dataSource, 'Bank Nama Lama');

      const res = await admin.patch(`/api/master/customer/${own.id}`).send({ name: 'Bank Nama Baru' }).expect(200);
      expect((res.body as CustomerRecord).name).toBe('Bank Nama Baru');
      await admin.patch(`/api/master/customer/${own.id}`).send({ code: 'ZZ' }).expect(400);
      await expect(
        operatorQuery(dataSource, 'UPDATE tenants SET code = $1 WHERE id = $2', ['ZZ', own.id]),
      ).rejects.toThrow(/tenants\.code tidak bisa diubah/);
    });

    it('customer nonaktif tetap tampil di daftar admin dan bisa diaktifkan lagi', async () => {
      const own = await insertTenant(dataSource, 'Bank Libur');

      await admin.patch(`/api/master/customer/${own.id}`).send({ active: false }).expect(200);
      const list = await admin.get('/api/master/customer').expect(200);
      expect(list.body as CustomerRecord[]).toContainEqual({ ...own, active: false });
      // Pilihan customer untuk operator hanya berisi yang aktif.
      expect(((await operator.get('/api/tenants').expect(200)).body as Array<{ id: string }>).map((t) => t.id))
        .not.toContain(own.id);

      await admin.patch(`/api/master/customer/${own.id}`).send({ active: true }).expect(200);
    });

    it('customer yang sudah punya pengguna atau data master hanya bisa dinonaktifkan', async () => {
      const withUser = await insertTenant(dataSource, 'Bank Berpengguna');
      await insertUser(dataSource, { tenantCodes: [withUser.code] });
      const withMaster = await insertTenant(dataSource, 'Bank Bermaster');
      await insertMasterValue(dataSource, 'system', withMaster.id);
      const empty = await insertTenant(dataSource, 'Bank Kosong');

      for (const used of [withUser, withMaster]) {
        const res = await admin.delete(`/api/master/customer/${used.id}`).expect(409);
        expect(res.body.message).toBe(
          'Customer ini sudah punya pengguna atau data, jadi tidak bisa dihapus. Nonaktifkan saja.',
        );
      }
      await admin.delete(`/api/master/customer/${empty.id}`).expect(204);
      await admin.patch(`/api/master/customer/${empty.id}`).send({ active: false }).expect(404);
    });
  });

  it('setiap perubahan tercatat di audit dengan pelaku, IP, dan customer', async () => {
    const created = await admin
      .post('/api/master/system')
      .send({ tenantId: tenant.id, name: `NMS ${shortId()}` })
      .expect(201);
    const id = (created.body as MasterValue).id;
    await admin.patch(`/api/master/system/${id}`).send({ active: false }).expect(200);
    await admin.delete(`/api/master/system/${id}`).expect(204);

    const rows = (await dataSource.query(
      `SELECT action, source, actor_label, client_ip, tenant_id, changes
       FROM audit_log WHERE table_name = 'master_systems' AND row_id = $1 ORDER BY id`,
      [id],
    )) as Array<{ action: string; source: string; actor_label: string; client_ip: string; tenant_id: string; changes: Record<string, unknown> }>;

    expect(rows.map((row) => row.action)).toEqual(['insert', 'update', 'delete']);
    for (const row of rows) {
      expect(row).toMatchObject({ source: 'api', actor_label: adminEmail, tenant_id: tenant.id });
      expect(row.client_ip).toMatch(/127\.0\.0\.1/);
    }
    expect(rows[1]?.changes).toMatchObject({ active: [true, false] });
  });
});
