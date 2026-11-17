import type { INestApplication } from '@nestjs/common';
import type {
  MasterListResponse,
  RemoteImportField,
  RemoteImportResult,
  RemoteImportRow,
  RemoteListResponse,
  RemoteResponse,
} from '@tyio/shared';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AuditEntryEntity } from '../src/common/audit/audit-entry.entity.js';
import { RemoteEntity } from '../src/modules/remotes/remote.entity.js';
import type { Tenant } from '../src/modules/tenants/tenant.entity.js';
import { createTestApp } from './create-test-app.js';
import { resetData } from './db.js';
import {
  asTester,
  createRemote,
  createTenant,
  createUser,
  ensureJarkom,
  sessionCookieFrom,
  TEST_PASSWORD,
} from './fixtures.js';

type Values = Partial<Record<RemoteImportField, string>>;

describe('remote: daftar, detail, impor', () => {
  let app: INestApplication;
  let ds: DataSource;
  let a: Tenant;
  let b: Tenant;
  const cookie: Record<'admin' | 'l1a' | 'l2', string> = { admin: '', l1a: '', l2: '' };

  beforeAll(async () => {
    app = await createTestApp();
    ds = app.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetData(ds);
    a = await createTenant(ds, 'TNA', 'Bank Uji Anggrek');
    b = await createTenant(ds, 'TNB', 'Bank Uji Bakung');
    await ensureJarkom(ds, 'VSAT', 'VSAT');
    const inactive = await ensureJarkom(ds, 'LAMA', 'Jarkom Lama');
    await asTester(ds, (m) => m.getRepository('Jarkom').update(inactive.id, { active: false }));
    await createUser(ds, { username: 'admin.uji', role: 'admin' });
    await createUser(ds, { username: 'l1.anggrek', allTenants: false, tenants: [a] });
    await createUser(ds, { username: 'l2.uji', role: 'L2' });
    cookie.admin = await loginAs('admin.uji');
    cookie.l1a = await loginAs('l1.anggrek');
    cookie.l2 = await loginAs('l2.uji');
  });

  const http = () => request(app.getHttpServer());
  async function loginAs(username: string): Promise<string> {
    const res = await http().post('/api/auth/login').send({ username, password: TEST_PASSWORD }).expect(200);
    return sessionCookieFrom(res.headers['set-cookie']);
  }

  const list = async (query: Record<string, string | number> = {}, who: keyof typeof cookie = 'l2') =>
    (await http().get('/api/remotes').query(query).set('Cookie', cookie[who]).expect(200))
      .body as RemoteListResponse;

  const base: Values = { siteId: 'S-001', name: 'Remote Satu', jarkom: 'VSAT', city: 'Malang', province: 'Jawa Timur' };
  const rowsOf = (...values: Values[]): RemoteImportRow[] =>
    values.map((v, i) => ({ row: i + 2, values: { ...base, ...v } }));
  const importRows = (rows: RemoteImportRow[], options: { dryRun?: boolean; tenant?: Tenant } = {}) =>
    http()
      .post('/api/admin/remotes/import')
      .set('Cookie', cookie.admin)
      .send({ tenantId: (options.tenant ?? a).id, rows, dryRun: options.dryRun ?? false });
  const importOk = async (rows: RemoteImportRow[], tenant?: Tenant) =>
    (await importRows(rows, { tenant }).expect(201)).body as RemoteImportResult;

  /** Banyak remote sekaligus lewat repository, untuk uji daftar. */
  async function seedMany(tenant: Tenant, count: number, extra: (i: number) => Values = () => ({})) {
    const jarkom = await ensureJarkom(ds, 'VSAT');
    await asTester(ds, (m) =>
      m.getRepository(RemoteEntity).insert(
        Array.from({ length: count }, (_, i) => {
          const v = extra(i);
          return {
            tenantId: tenant.id,
            siteId: `${tenant.code}-${String(i).padStart(4, '0')}`,
            name: v.name ?? `Remote ${tenant.code} ${i}`,
            jarkomId: jarkom.id,
            city: v.city ?? 'Malang',
            province: v.province ?? 'Jawa Timur',
            timeZone: 'Asia/Jakarta' as const,
            kanca: v.kanca ?? null,
            status: (v.status as 'aktif' | undefined) ?? 'aktif',
          };
        }),
      ),
    );
  }

  describe('daftar', () => {
    it('urut Site ID, 50 per halaman, dengan total', async () => {
      await seedMany(a, 60);
      await seedMany(b, 5);

      const first = await list();
      const second = await list({ page: 2 });

      expect(first).toMatchObject({ total: 65, page: 1, pageSize: 50 });
      expect(first.items).toHaveLength(50);
      expect(second.items).toHaveLength(15);
      const ids = [...first.items, ...second.items].map((r) => r.siteId);
      expect(ids).toEqual([...ids].sort());
      expect(first.items[0]).toEqual({
        id: expect.any(String),
        siteId: 'TNA-0000',
        name: 'Remote TNA 0',
        tenant: { id: a.id, code: 'TNA', name: 'Bank Uji Anggrek' },
        jarkom: { id: expect.any(String), code: 'VSAT', name: 'VSAT' },
        city: 'Malang',
        province: 'Jawa Timur',
        status: 'aktif',
      });
    });

    it('mencari di Site ID, nama, kota, dan kanca tanpa membedakan huruf besar/kecil', async () => {
      await seedMany(a, 4, (i) =>
        [
          { name: 'ATM Pasar Besar' },
          { city: 'Kediri' },
          { kanca: 'KC Sukun' },
          { name: 'Diskon 100%_promo' },
        ][i] as Values,
      );
      const found = async (q: string) => (await list({ q })).items.map((r) => r.siteId);

      expect(await found('tna-0000')).toEqual(['TNA-0000']);
      expect(await found('pasar')).toEqual(['TNA-0000']);
      expect(await found('KEDIRI')).toEqual(['TNA-0001']);
      expect(await found('sukun')).toEqual(['TNA-0002']);
      // % dan _ dicari apa adanya, bukan sebagai wildcard.
      expect(await found('100%_')).toEqual(['TNA-0003']);
      expect(await found('%')).toEqual(['TNA-0003']);
    });

    it('saringan customer, provinsi, jarkom, dan status bisa digabung', async () => {
      await seedMany(a, 3, (i) => [{ province: 'Bali' }, { status: 'dibongkar' }, {}][i] as Values);
      await seedMany(b, 2, () => ({ province: 'Bali' }));
      const other = await ensureJarkom(ds, 'M2X', 'Jarkom Lain');
      await createRemote(ds, a, 'TNA-LAIN', { jarkomId: other.id });
      const sites = async (query: Record<string, string>) => (await list(query)).items.map((r) => r.siteId);

      expect(await sites({ tenantId: a.id, province: 'Bali' })).toEqual(['TNA-0000']);
      expect(await sites({ province: 'Bali' })).toEqual(['TNA-0000', 'TNB-0000', 'TNB-0001']);
      expect(await sites({ status: 'dibongkar' })).toEqual(['TNA-0001']);
      expect(await sites({ jarkomId: other.id })).toEqual(['TNA-LAIN']);
    });

    it('pengguna terbatas hanya melihat customernya, juga saat menyaring customer lain', async () => {
      await seedMany(a, 2);
      await seedMany(b, 3);

      expect((await list({}, 'l1a')).total).toBe(2);
      expect(await list({ tenantId: b.id }, 'l1a')).toMatchObject({ total: 0, items: [] });
    });

    it.each([
      [{ page: 0 }, /Halaman/],
      [{ page: 'dua' }, /Halaman/],
      [{ status: 'rusak' }, /Status/],
      [{ tenantId: 'bukan-uuid' }, /Customer/],
      [{ jarkomId: 'bukan-uuid' }, /Jarkom/],
      [{ province: 'Atlantis' }, /Provinsi/],
      [{ q: 'x'.repeat(101) }, /Pencarian/],
      [{ urut: 'nama' }, /tidak dikenal/],
    ])('parameter %o ditolak 400', async (query, message) => {
      const res = await http().get('/api/remotes').query(query).set('Cookie', cookie.l2).expect(400);
      expect(res.body.message).toMatch(message);
    });
  });

  describe('detail', () => {
    it('memuat semua kolom; koordinat berupa angka; zona waktu mengikuti provinsi', async () => {
      await importOk(
        rowsOf({
          siteId: 'sby-01',
          name: 'ATM Uji Pelabuhan',
          status: 'Nonaktif',
          address: 'Jl. Contoh No. 1',
          city: 'Jayapura',
          province: 'Papua',
          latitude: '-2,5337',
          longitude: '140.7181',
          ipSnmp: '10.200.1.2',
          ipLan: '10.200.2.0/29',
          userIp: '10.200.3.4',
          userId: 'ATMUJI01',
          kanwil: 'Kanwil Contoh',
          kanca: 'KC Contoh',
          onlineDate: '31/01/2024',
          contact1Name: 'Petugas Contoh',
          contact1Role: 'Pengelola',
          contact1Phone: '021-0000-0011',
          contact2Name: 'Satpam Contoh',
          contact2Phone: '021-0000-0012',
        }),
      );
      const id = (await list({ q: 'SBY-01' })).items[0]?.id;

      const res = await http().get(`/api/remotes/${id}`).set('Cookie', cookie.l2).expect(200);

      expect((res.body as RemoteResponse).remote).toEqual({
        id,
        siteId: 'SBY-01',
        name: 'ATM Uji Pelabuhan',
        tenant: { id: a.id, code: 'TNA', name: 'Bank Uji Anggrek' },
        jarkom: { id: expect.any(String), code: 'VSAT', name: 'VSAT' },
        status: 'nonaktif',
        address: 'Jl. Contoh No. 1',
        city: 'Jayapura',
        province: 'Papua',
        timeZone: 'Asia/Jayapura',
        latitude: -2.5337,
        longitude: 140.7181,
        ipSnmp: '10.200.1.2',
        ipLan: '10.200.2.0/29',
        userIp: '10.200.3.4',
        userId: 'ATMUJI01',
        kanwil: 'Kanwil Contoh',
        kanca: 'KC Contoh',
        onlineDate: '2024-01-31',
        contacts: [
          { name: 'Petugas Contoh', role: 'Pengelola', phone: '021-0000-0011', email: null },
          { name: 'Satpam Contoh', role: null, phone: '021-0000-0012', email: null },
        ],
      });
    });

    it('remote customer lain dijawab 404', async () => {
      const other = await createRemote(ds, b, 'TNB-X');
      await http().get(`/api/remotes/${other.id}`).set('Cookie', cookie.l1a).expect(404);
    });
  });

  describe('impor', () => {
    it('periksa: melaporkan baru, diperbarui, tidak berubah, dan baris gagal, tanpa menyimpan', async () => {
      await importOk(rowsOf({ siteId: 'S-001' }, { siteId: 'S-002' }));

      const res = await importRows(
        rowsOf(
          { siteId: 'S-001' },
          { siteId: 'S-002', name: 'Nama Baru' },
          { siteId: 'S-003' },
          { siteId: 'S-004', jarkom: 'TIDAKADA', province: 'Atlantis' },
        ),
        { dryRun: true },
      ).expect(201);

      expect(res.body).toEqual({
        created: 1,
        updated: 1,
        unchanged: 1,
        saved: false,
        failed: [
          {
            row: 5,
            errors: [
              { column: 'Jarkom', message: 'Jarkom TIDAKADA tidak ada di master data.' },
              { column: 'Provinsi', message: 'Provinsi "Atlantis" tidak dikenal.' },
            ],
          },
        ],
      });
      expect((await list()).items.map((r) => [r.siteId, r.name])).toEqual([
        ['S-001', 'Remote Satu'],
        ['S-002', 'Remote Satu'],
      ]);
    });

    it('ada baris gagal: 422 dan tidak ada yang tersimpan', async () => {
      const res = await importRows(rowsOf({ siteId: 'S-001' }, { siteId: 'S-002', name: '' }));

      expect(res.status).toBe(422);
      expect(res.body).toMatchObject({ saved: false, created: 1, failed: [{ row: 3 }] });
      expect((await list()).total).toBe(0);
    });

    it('menyimpan baru dan perubahan; kolom yang tidak ada di file tidak diubah, sel kosong mengosongkan', async () => {
      await importOk(rowsOf({ siteId: 'S-001', kanca: 'KC Lama', kanwil: 'Kanwil Lama' }));

      const result = await importOk([
        { row: 2, values: { siteId: 'S-001', name: 'Remote Satu', jarkom: 'VSAT', city: 'Malang', province: 'Jawa Timur', kanca: '' } },
        { row: 3, values: { ...base, siteId: 'S-002' } },
      ]);

      expect(result).toEqual({ created: 1, updated: 1, unchanged: 0, failed: [], saved: true });
      const id = (await list({ q: 'S-001' })).items[0]?.id;
      const detail = (await http().get(`/api/remotes/${id}`).set('Cookie', cookie.l2)).body as RemoteResponse;
      expect(detail.remote).toMatchObject({ kanca: null, kanwil: 'Kanwil Lama' });
    });

    it.each<[Values, string, string | RegExp]>([
      [{ siteId: '' }, 'Site ID', 'Isi Site ID.'],
      [{ siteId: 'S 01' }, 'Site ID', /huruf, angka, titik, garis bawah, atau tanda hubung/],
      [{ name: 'x' }, 'Nama Remote', 'Nama remote 2–160 karakter.'],
      [{ jarkom: 'LAMA' }, 'Jarkom', 'Jarkom LAMA nonaktif.'],
      [{ city: '' }, 'Kota', 'Isi kota.'],
      [{ province: '' }, 'Provinsi', 'Isi provinsi.'],
      [{ status: 'rusak' }, 'Status', 'Status harus Aktif, Nonaktif, atau Dismantle.'],
      [{ latitude: '-6.2' }, 'Longitude', 'Isi Latitude dan Longitude bersama-sama.'],
      [{ latitude: '95', longitude: '100' }, 'Latitude', 'Latitude harus angka antara -90 dan 90.'],
      [{ latitude: '1', longitude: 'timur' }, 'Longitude', 'Longitude harus angka antara -180 dan 180.'],
      [{ ipSnmp: '10.0.0.300' }, 'IP SNMP', 'IP SNMP bukan alamat IP yang sah.'],
      [{ ipLan: '10.0.0.0/33' }, 'IP LAN', 'IP LAN bukan alamat IP yang sah.'],
      [{ onlineDate: '31-13-2024' }, 'Tanggal Online', /Tanggal tidak dikenali/],
      [{ address: 'x'.repeat(501) }, 'Alamat', 'Alamat paling banyak 500 karakter.'],
      [{ contact1Name: 'Petugas' }, 'Kontak 1 Telepon', 'Isi telepon kontak 1.'],
      [{ contact2Phone: '021-0000-0001' }, 'Kontak 2 Nama', 'Isi nama kontak 2.'],
    ])('%o ditolak di kolom %s', async (values, column, message) => {
      const res = await importRows(rowsOf(values), { dryRun: true }).expect(201);

      const errors = (res.body as RemoteImportResult).failed[0]?.errors ?? [];
      expect(errors).toContainEqual({ column, message: expect.stringMatching(message instanceof RegExp ? message : `^${escape(message)}$`) });
    });

    it('impor ulang file yang sama tidak dianggap perubahan (kontak, IP, koordinat, tanggal)', async () => {
      const rows = rowsOf({
        siteId: 'S-ULANG',
        ipLan: '10.200.9.9/32',
        ipSnmp: '10.200.9.10',
        latitude: '-7.98',
        longitude: '112.63',
        onlineDate: '5/2/2024',
        contact1Name: 'Petugas Contoh',
        contact1Role: 'Pengelola',
        contact1Phone: '021-0000-0013',
      });
      await importOk(rows);

      expect(await importOk(rows)).toMatchObject({ created: 0, updated: 0, unchanged: 1 });
    });

    it('Site ID kembar di dalam file ditolak pada kemunculan kedua', async () => {
      const res = await importRows(rowsOf({ siteId: 'S-001' }, { siteId: 's-001' }), { dryRun: true });

      expect((res.body as RemoteImportResult).failed).toEqual([
        { row: 3, errors: [{ column: 'Site ID', message: 'Site ID S-001 sudah ada di baris 2.' }] },
      ]);
    });

    it('menerima penulisan provinsi, status, dan tanggal yang umum', async () => {
      await importOk(
        rowsOf(
          { siteId: 'S-001', province: 'jatim', status: 'dibongkar', onlineDate: '2024-02-29' },
          { siteId: 'S-002', province: 'Provinsi Sulawesi Selatan', status: 'AKTIF', onlineDate: '01-03-2024' },
          // Label baru (K38); "Dibongkar" dari file lama tetap diterima.
          { siteId: 'S-003', province: 'Bali', status: 'Dismantle' },
        ),
      );
      const rows = await ds.getRepository(RemoteEntity).find({ order: { siteId: 'ASC' } });

      expect(rows.map((r) => [r.province, r.timeZone, r.status, r.onlineDate])).toEqual([
        ['Jawa Timur', 'Asia/Jakarta', 'dibongkar', '2024-02-29'],
        ['Sulawesi Selatan', 'Asia/Makassar', 'aktif', '2024-03-01'],
        ['Bali', 'Asia/Makassar', 'dibongkar', null],
      ]);
    });

    it('customer tidak dikenal, customer nonaktif, dan isian tanpa baris ditolak', async () => {
      const missing = '01900000-0000-7000-8000-0000000000ff';
      await http()
        .post('/api/admin/remotes/import')
        .set('Cookie', cookie.admin)
        .send({ tenantId: missing, rows: rowsOf({}), dryRun: true })
        .expect(400);
      await asTester(ds, (m) => m.getRepository('Tenant').update(b.id, { active: false }));
      expect((await importRows(rowsOf({}), { tenant: b, dryRun: true }).expect(400)).body.message).toBe(
        'Customer Bank Uji Bakung nonaktif; aktifkan dulu di Admin › Master data.',
      );
      await http()
        .post('/api/admin/remotes/import')
        .set('Cookie', cookie.admin)
        .send({ tenantId: a.id, rows: [], dryRun: true })
        .expect(400);
    });

    it('5.000 baris tersimpan dalam satu kali impor dan langsung bisa dicari', async () => {
      const rows = Array.from({ length: 5000 }, (_, i) => ({
        row: i + 2,
        values: { ...base, siteId: `M-${String(i).padStart(5, '0')}`, name: `ATM Massal ${i}`, kanca: `KC ${i % 40}` },
      }));

      const started = Date.now();
      const result = await importOk(rows);
      const seconds = (Date.now() - started) / 1000;

      expect(result).toMatchObject({ created: 5000, saved: true, failed: [] });
      expect(seconds, `impor 5.000 baris butuh ${seconds} detik`).toBeLessThan(30);
      expect((await list({ q: 'M-04999' })).items.map((r) => r.name)).toEqual(['ATM Massal 4999']);
      expect((await list({ q: 'kc 39' })).total).toBe(125);

      const again = await importOk(rows);
      expect(again).toMatchObject({ created: 0, updated: 0, unchanged: 5000 });
    }, 120_000);

    it('batas isian besar hanya untuk impor; rute lain tetap menolak isian di atas 100 KB', async () => {
      const big = 'x'.repeat(150_000);
      await http()
        .post('/api/admin/master/kategori')
        .set('Cookie', cookie.admin)
        .send({ code: 'BIG', name: big })
        .expect(413);
      await importRows(rowsOf({ address: big.slice(0, 400) }, ...Array.from({ length: 400 }, (_, i) => ({ siteId: `B-${i}`, address: big.slice(0, 400) }))), {
        dryRun: true,
      }).expect(201);
    });

    it('tercatat di audit log atas nama admin', async () => {
      await importOk(rowsOf({ siteId: 'S-AUD' }));
      const remote = await ds.getRepository(RemoteEntity).findOneByOrFail({ siteId: 'S-AUD' });

      const rows = await ds.getRepository(AuditEntryEntity).findBy({ tableName: 'remotes', rowId: remote.id });
      expect(rows.map((r) => [r.action, r.actor, r.tenantId])).toEqual([['insert', 'pengguna:admin.uji', a.id]]);
    });

    it('L1 tidak bisa mengimpor (403)', async () => {
      await http()
        .post('/api/admin/remotes/import')
        .set('Cookie', cookie.l1a)
        .send({ tenantId: a.id, rows: rowsOf({}), dryRun: false })
        .expect(403);
    });
  });

  it('pilihan jarkom untuk saringan: hanya yang aktif, untuk semua peran', async () => {
    const res = await http().get('/api/master/jarkom').set('Cookie', cookie.l1a).expect(200);

    expect((res.body as MasterListResponse).items.map((i) => i.code)).toEqual(['VSAT']);
  });
});

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
