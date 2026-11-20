import { randomBytes } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  type RemoteDetail,
  type RemoteImportReport,
  type RemotePage,
  REMOTE_IMPORT_MAX_BYTES,
  XLSX_MIME,
} from '@tyio/shared';
import { readSheet } from 'read-excel-file/node';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FORBIDDEN_ROLE_MESSAGE } from '../src/modules/auth/roles.guard.js';
import { IMPORT_COLUMNS, parseRemoteImport } from '../src/modules/remotes/remote-import.parser.js';
import { createTestApp } from './create-test-app.js';
import {
  buildXlsx,
  insertMasterValue,
  insertRemote,
  insertTenant,
  insertUser,
  operatorQuery,
  TEST_PASSWORD,
} from './fixtures.js';

// Remote (langkah 1.2): daftar yang bisa dicari dan disaring, halaman remote, dan impor
// dari Excel dengan pratinjau dan laporan baris gagal. Isolasi antar-customer diuji di
// tenant-isolation.test.ts.

type Agent = ReturnType<typeof request.agent>;
type Cell = string | number | Date | null;

const HEADER = IMPORT_COLUMNS.map((column) => column.title);
const uid = () => randomBytes(3).toString('hex').toUpperCase();

/** Satu baris lengkap sesuai urutan kolom templat. */
function fullRow(values: Partial<Record<string, Cell>>): Cell[] {
  return IMPORT_COLUMNS.map((column) => values[column.key] ?? null);
}

describe('remote', () => {
  let app: NestExpressApplication;
  let dataSource: DataSource;
  let admin: Agent;
  let adminEmail: string;
  let operator: Agent;
  let tenant: { id: string; code: string; name: string };
  let vsat: { id: string; code: string | null };

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
    tenant = await insertTenant(dataSource, 'Bank Remote');
    vsat = await insertMasterValue(dataSource, 'jarkom', tenant.id, 'VSAT uji');

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

  const importFile = (file: Buffer, mode: 'preview' | 'save', tenantId = tenant.id, agent = admin) =>
    agent.post(`/api/remote-import?tenantId=${tenantId}&mode=${mode}`).set('Content-Type', XLSX_MIME).send(file);

  describe('templat', () => {
    it('admin mengunduh templat .xlsx berisi judul kolom dan petunjuk', async () => {
      const res = await admin.get('/api/remote-import/template').responseType('blob').expect(200);

      expect(res.headers['content-type']).toBe(XLSX_MIME);
      expect(res.headers['content-disposition']).toContain('templat-impor-remote.xlsx');
      const remoteSheet = await readSheet(res.body as Buffer, 'Remote');
      expect(remoteSheet).toEqual([HEADER]);
      const guide = await readSheet(res.body as Buffer, 'Petunjuk');
      expect(guide.map((row) => row[0])).toEqual(expect.arrayContaining(['Kode remote', 'Online sejak']));
    });

    it('operator L1 tidak bisa mengunduh templat atau mengimpor', async () => {
      const res = await operator.get('/api/remote-import/template').expect(403);
      expect(res.body.message).toBe(FORBIDDEN_ROLE_MESSAGE);
      await importFile(await buildXlsx([HEADER]), 'preview', tenant.id, operator).expect(403);
    });
  });

  describe('impor', () => {
    it('pratinjau tidak menyimpan apa pun; simpan menyimpan semua kolom', async () => {
      const code = `BNA-MKS-${uid()}`;
      const file = await buildXlsx([
        HEADER,
        fullRow({
          code: code.toLowerCase(),
          name: 'ATM KCP Pasar Sentral',
          network: vsat.code?.toLowerCase(),
          status: 'Aktif',
          zone: 'wita',
          address: 'Jl. Sulawesi No. 12',
          city: 'Makassar',
          province: 'Sulawesi Selatan',
          latitude: -5.1349,
          longitude: '119,4128',
          kanwil: 'Kanwil Makassar',
          kanca: 'KCP Pasar Sentral',
          ipSnmp: '10.41.17.22',
          ipLan: '192.168.217.1',
          userIp: '10.41.17.23',
          userIdent: 'bna-mks-0217',
          manager: 'Bank Nusa KCP Pasar Sentral',
          onlineSince: new Date(Date.UTC(2023, 2, 12)),
          contact1Name: 'Hendra',
          contact1Role: 'Kepala Unit',
          contact1Phone: '+62 811-0000-0217',
          contact2Name: 'Sari',
        }),
      ]);

      const preview = (await importFile(file, 'preview').expect(200)).body as RemoteImportReport;
      expect(preview).toEqual({ mode: 'preview', totalRows: 1, created: 1, updated: 0, unchanged: 0, failed: [] });
      expect(await dataSource.query('SELECT id FROM remotes WHERE code = $1', [code])).toEqual([]);

      const saved = (await importFile(file, 'save').expect(200)).body as RemoteImportReport;
      expect(saved).toMatchObject({ mode: 'save', created: 1, updated: 0, unchanged: 0 });

      const list = (await operator.get(`/api/remotes?q=${code}`).expect(200)).body as RemotePage;
      expect(list.total).toBe(1);
      const detail = (await operator.get(`/api/remotes/${list.items[0]?.id}`).expect(200)).body as RemoteDetail;
      expect(detail).toMatchObject({
        tenantId: tenant.id,
        code,
        name: 'ATM KCP Pasar Sentral',
        networkId: vsat.id,
        networkCode: vsat.code,
        active: true,
        zone: 'WITA',
        address: 'Jl. Sulawesi No. 12',
        city: 'Makassar',
        province: 'Sulawesi Selatan',
        latitude: -5.1349,
        longitude: 119.4128,
        kanwil: 'Kanwil Makassar',
        kanca: 'KCP Pasar Sentral',
        ipSnmp: '10.41.17.22',
        ipLan: '192.168.217.1',
        userIp: '10.41.17.23',
        userIdent: 'bna-mks-0217',
        manager: 'Bank Nusa KCP Pasar Sentral',
        onlineSince: '2023-03-12',
        contacts: [
          { name: 'Hendra', role: 'Kepala Unit', phone: '+62 811-0000-0217' },
          { name: 'Sari', role: null, phone: null },
        ],
      });
    });

    it('impor ulang: yang sama dilewati, yang berubah diperbarui dan tercatat di audit', async () => {
      const [first, second] = [`UPD-${uid()}`, `UPD-${uid()}`];
      const rows = (city: string) => [
        HEADER,
        fullRow({ code: first, name: 'Remote satu', network: vsat.code, zone: 'WIB', city: 'Bogor' }),
        fullRow({ code: second, name: 'Remote dua', network: vsat.code, zone: 'WIB', city }),
      ];
      await importFile(await buildXlsx(rows('Depok')), 'save').expect(200);

      const again = (await importFile(await buildXlsx(rows('Depok')), 'save').expect(200)).body as RemoteImportReport;
      expect(again).toMatchObject({ created: 0, updated: 0, unchanged: 2 });

      const changed = (await importFile(await buildXlsx(rows('Bekasi')), 'save').expect(200))
        .body as RemoteImportReport;
      expect(changed).toMatchObject({ created: 0, updated: 1, unchanged: 1 });

      const audit = (await dataSource.query(
        `SELECT a.action, a.actor_label, a.tenant_id, a.changes FROM audit_log a
         JOIN remotes r ON a.table_name = 'remotes' AND a.row_id = r.id::text
         WHERE r.code = $1 ORDER BY a.id`,
        [second],
      )) as Array<{ action: string; actor_label: string; tenant_id: string; changes: Record<string, unknown> }>;
      expect(audit.map((entry) => entry.action)).toEqual(['insert', 'update']);
      expect(audit[1]).toMatchObject({ actor_label: adminEmail, tenant_id: tenant.id });
      expect(Object.keys(audit[1]?.changes ?? {}).sort()).toEqual(['city', 'updated_at']);
    });

    it('kolom yang tidak ada di berkas tidak mengubah data tersimpan; sel kosong mengosongkan', async () => {
      const code = `PART-${uid()}`;
      await importFile(
        await buildXlsx([
          HEADER,
          fullRow({
            code,
            name: 'Lengkap',
            network: vsat.code,
            status: 'Nonaktif',
            zone: 'WIB',
            address: 'Jl. Lama 1',
            city: 'Bogor',
            ipSnmp: '10.9.9.9',
            contact1Name: 'Andi',
          }),
        ]),
        'save',
      ).expect(200);

      // Berkas hanya berisi kolom wajib + Kota (dikosongkan): alamat, IP, status, kontak tetap.
      const partial = await buildXlsx([
        ['Kode remote', 'Nama remote', 'Jarkom', 'Zona waktu', 'Kota'],
        [code, 'Nama baru', vsat.code, 'WIB', null],
      ]);
      const report = (await importFile(partial, 'save').expect(200)).body as RemoteImportReport;
      expect(report).toMatchObject({ updated: 1, unchanged: 0 });

      const list = (await admin.get(`/api/remotes?q=${code}`).expect(200)).body as RemotePage;
      const detail = (await admin.get(`/api/remotes/${list.items[0]?.id}`).expect(200)).body as RemoteDetail;
      expect(detail).toMatchObject({
        name: 'Nama baru',
        city: null,
        address: 'Jl. Lama 1',
        ipSnmp: '10.9.9.9',
        active: false,
        contacts: [{ name: 'Andi', role: null, phone: null }],
      });
      // Berkas yang sama sekali lagi: tidak ada yang berubah.
      expect(((await importFile(partial, 'save').expect(200)).body as RemoteImportReport).unchanged).toBe(1);
    });

    it('melaporkan baris gagal dengan nomor baris Excel dan alasannya; baris benar tetap disimpan', async () => {
      const inactive = await insertMasterValue(dataSource, 'jarkom', tenant.id);
      await operatorQuery(dataSource, 'UPDATE master_networks SET active = false WHERE id = $1', [inactive.id]);
      const good = `OK-${uid()}`;
      const dup = `DUP-${uid()}`;
      const file = await buildXlsx([
        HEADER,
        fullRow({ code: good, name: 'Benar', network: vsat.code, zone: 'WIB' }),
        fullRow({ code: dup, name: 'Pertama', network: vsat.code, zone: 'WIB' }),
        fullRow({}), // baris kosong dilewati
        fullRow({ code: dup, name: 'Kembar', network: vsat.code, zone: 'WIB' }),
        fullRow({ code: 'X', name: '', network: 'TIDAKADA', zone: 'UTC' }),
        fullRow({ code: `IP-${uid()}`, name: 'IP salah', network: inactive.code, zone: 'WIT', ipSnmp: '10.0.0.300' }),
        fullRow({ code: `KO-${uid()}`, name: 'Koordinat', network: vsat.code, zone: 'WIB', latitude: -6.2 }),
        fullRow({
          code: `TG-${uid()}`,
          name: 'Tanggal',
          network: vsat.code,
          zone: 'WIB',
          onlineSince: '31/02/2023',
          contact1Phone: '0811',
        }),
      ]);

      const report = (await importFile(file, 'save').expect(200)).body as RemoteImportReport;

      expect(report).toMatchObject({ totalRows: 7, created: 2, updated: 0, unchanged: 0 });
      expect(report.failed).toEqual([
        { row: 5, code: dup, errors: [`Kode remote ${dup} sudah dipakai di baris 3 berkas ini.`] },
        {
          row: 6,
          code: 'X',
          errors: [
            'Kode remote hanya boleh huruf, angka, titik, minus, atau garis bawah (2–40 karakter).',
            'Nama remote wajib diisi.',
            'Jarkom TIDAKADA tidak ada di customer ini.',
            'Zona waktu harus WIB, WITA, atau WIT.',
          ],
        },
        {
          row: 7,
          code: expect.stringMatching(/^IP-/) as unknown as string,
          errors: [`Jarkom ${inactive.code} nonaktif.`, 'IP SNMP bukan alamat IP yang sah: 10.0.0.300.'],
        },
        {
          row: 8,
          code: expect.stringMatching(/^KO-/) as unknown as string,
          errors: ['Latitude dan Longitude diisi bersama, atau dikosongkan keduanya.'],
        },
        {
          row: 9,
          code: expect.stringMatching(/^TG-/) as unknown as string,
          errors: [
            'Online sejak bukan tanggal yang sah (pakai format tanggal Excel, 2023-03-12, atau 12/03/2023).',
            'Kontak 1 nama wajib diisi bila jabatan atau teleponnya diisi.',
          ],
        },
      ]);
      const stored = (await dataSource.query('SELECT code, name FROM remotes WHERE code = ANY($1) ORDER BY code', [
        [good, dup],
      ])) as Array<{ code: string; name: string }>;
      expect(stored).toEqual([
        { code: dup, name: 'Pertama' },
        { code: good, name: 'Benar' },
      ]);
    });

    it('kolom opsional boleh tidak ada; judul kolom tak dikenal atau kolom wajib hilang ditolak', async () => {
      const minimal = await buildXlsx([
        ['kode REMOTE', 'Nama remote', 'Jarkom', 'Zona waktu'],
        [`MIN-${uid()}`, 'Minimal', vsat.code, 'WIB'],
      ]);
      expect(((await importFile(minimal, 'preview').expect(200)).body as RemoteImportReport).created).toBe(1);

      const unknown = await importFile(await buildXlsx([[...HEADER, 'Warna']]), 'preview').expect(400);
      expect(unknown.body.message).toBe('Judul kolom tidak dikenal: "Warna". Pakai judul kolom dari templat.');
      const missing = await importFile(await buildXlsx([['Kode remote', 'Nama remote']]), 'preview').expect(400);
      expect(missing.body.message).toBe('Kolom wajib tidak ada: "Jarkom", "Zona waktu".');
      const empty = await importFile(await buildXlsx([[null]]), 'preview').expect(400);
      expect(empty.body.message).toBe('Baris pertama berkas harus berisi judul kolom seperti di templat.');
    });

    it('menolak berkas yang bukan .xlsx, jenis isi yang salah, dan berkas lebih dari 5 MB', async () => {
      const broken = await importFile(Buffer.from('bukan excel'), 'preview').expect(400);
      expect(broken.body.message).toBe('Berkas tidak bisa dibaca sebagai Excel (.xlsx). Pakai templat dari portal.');

      await admin
        .post(`/api/remote-import?tenantId=${tenant.id}`)
        .set('Content-Type', 'text/csv')
        .send('Kode remote,Nama remote')
        .expect(415);
      await importFile(Buffer.alloc(REMOTE_IMPORT_MAX_BYTES + 1), 'preview').expect(413);
      await admin
        .post(`/api/remote-import?tenantId=${tenant.id}&mode=hapus`)
        .set('Content-Type', XLSX_MIME)
        .send(await buildXlsx([HEADER]))
        .expect(400);
    });

    it('customer nonaktif atau id customer yang salah dijawab seperti customer tidak ada', async () => {
      const closed = await insertTenant(dataSource, 'Bank Tutup Remote', { active: false });
      const file = await buildXlsx([HEADER]);

      await importFile(file, 'preview', closed.id).expect(404);
      await importFile(file, 'preview', 'bukan-uuid').expect(404);
    });

    it('impor 5.000 baris: pratinjau dan simpan selesai wajar, lalu pencarian tetap cepat', async () => {
      const own = await insertTenant(dataSource, 'Bank Besar');
      const network = await insertMasterValue(dataSource, 'jarkom', own.id, 'VSAT besar');
      const cities = ['Makassar', 'Palu', 'Kendari', 'Manado', 'Gorontalo'];
      const rows: Cell[][] = [HEADER];
      for (let i = 1; i <= 5000; i++) {
        const n = String(i).padStart(4, '0');
        rows.push(
          fullRow({
            code: `BB-${n}`,
            name: `ATM Besar ${n}`,
            network: network.code,
            zone: 'WITA',
            city: cities[i % cities.length] ?? null,
            ipSnmp: `10.${Math.floor(i / 250)}.${i % 250}.1`,
            contact1Name: `PIC ${n}`,
            contact1Phone: '0811-000-000',
          }),
        );
      }
      const file = await buildXlsx(rows);

      const previewReport = (await importFile(file, 'preview', own.id).expect(200)).body as RemoteImportReport;
      expect(previewReport).toMatchObject({ totalRows: 5000, created: 5000, failed: [] });
      let started = Date.now();
      const saved = (await importFile(file, 'save', own.id).expect(200)).body as RemoteImportReport;
      const saveMs = Date.now() - started;
      expect(saved).toMatchObject({ created: 5000, updated: 0, unchanged: 0 });
      expect(saveMs).toBeLessThan(20_000);

      started = Date.now();
      const page = (await admin.get(`/api/remotes?tenantId=${own.id}&q=palu&page=3&pageSize=100`).expect(200))
        .body as RemotePage;
      expect(Date.now() - started).toBeLessThan(1_000);
      expect(page.total).toBe(1000);
      expect(page.items).toHaveLength(100);
      // Palu = setiap baris ke-5 mulai BB-0001; urut kode, halaman 3 dimulai dari hasil ke-201.
      expect(page.items[0]?.code).toBe('BB-1001');
      const byIp = (await admin.get(`/api/remotes?tenantId=${own.id}&q=10.4.17.1`).expect(200)).body as RemotePage;
      expect(byIp.items.map((remote) => remote.code)).toEqual(['BB-1017']);
    }, 60_000);
  });

  describe('daftar dan halaman remote', () => {
    it('menyaring per jarkom dan status; kata kunci dengan % dicari apa adanya', async () => {
      const own = await insertTenant(dataSource, 'Bank Saring');
      const vpn = await insertMasterValue(dataSource, 'jarkom', own.id);
      const a = await insertRemote(dataSource, own.id, { name: 'Diskon 50% Plaza', networkId: vpn.id });
      const b = await insertRemote(dataSource, own.id, { name: 'Diskon 50 Plaza', active: false });

      const byNetwork = (await operator.get(`/api/remotes?tenantId=${own.id}&networkId=${vpn.id}`).expect(200))
        .body as RemotePage;
      expect(byNetwork.items.map((remote) => remote.id)).toEqual([a.id]);
      const inactive = (await operator.get(`/api/remotes?tenantId=${own.id}&active=false`).expect(200))
        .body as RemotePage;
      expect(inactive.items.map((remote) => remote.id)).toEqual([b.id]);
      const percent = (await operator.get(`/api/remotes?tenantId=${own.id}&q=50%25`).expect(200)).body as RemotePage;
      expect(percent.items.map((remote) => remote.id)).toEqual([a.id]);
      const badNetwork = (await operator.get('/api/remotes?networkId=bukan-uuid').expect(200)).body as RemotePage;
      expect(badNetwork).toMatchObject({ items: [], total: 0 });
    });

    it('menolak parameter halaman yang tidak sah', async () => {
      await operator.get('/api/remotes?page=0').expect(400);
      await operator.get('/api/remotes?pageSize=101').expect(400);
      await operator.get('/api/remotes?active=ya').expect(400);
      await operator.get(`/api/remotes?q=${'x'.repeat(101)}`).expect(400);
    });

    it('id yang bukan UUID atau tidak ada dijawab 404', async () => {
      await operator.get('/api/remotes/bukan-uuid').expect(404);
      await operator.get('/api/remotes/00000000-0000-4000-8000-000000000000').expect(404);
    });
  });

  describe('aturan database', () => {
    it('jarkom yang sudah dipakai remote tidak bisa dihapus, hanya dinonaktifkan (T45)', async () => {
      const remote = await insertRemote(dataSource, tenant.id);

      const res = await admin.delete(`/api/master/jarkom/${remote.networkId}`).expect(409);
      expect(res.body.message).toBe('Jarkom ini sudah dipakai, jadi tidak bisa dihapus. Nonaktifkan saja.');
      await admin.patch(`/api/master/jarkom/${remote.networkId}`).send({ active: false }).expect(200);
    });

    it('remote tidak bisa memakai jarkom customer lain, dan kodenya tidak bisa diubah', async () => {
      const other = await insertTenant(dataSource, 'Bank Lain Remote');
      const foreignNetwork = await insertMasterValue(dataSource, 'jarkom', other.id);

      await expect(insertRemote(dataSource, tenant.id, { networkId: foreignNetwork.id })).rejects.toThrow(
        /remotes_network_same_tenant/,
      );
      const remote = await insertRemote(dataSource, tenant.id);
      await expect(
        operatorQuery(dataSource, 'UPDATE remotes SET code = $1 WHERE id = $2', ['GANTI-01', remote.id]),
      ).rejects.toThrow(/remotes\.code tidak bisa diubah/);
    });
  });
});

describe('pembaca berkas impor', () => {
  const networks = new Map([['VSAT', { id: 'n1', active: true }]]);
  const header = ['Kode remote', 'Nama remote', 'Jarkom', 'Zona waktu', 'Online sejak'];
  const parse = (onlineSince: Cell, today = '2026-11-20') =>
    parseRemoteImport([header, ['R-01', 'Satu', 'vsat', 'WIB', onlineSince]], networks, today);

  it('membaca tanggal dari sel tanggal Excel, teks ISO, dan teks DD/MM/YYYY', () => {
    expect(parse(new Date(Date.UTC(2023, 2, 12))).valid[0]?.remote.onlineSince).toBe('2023-03-12');
    expect(parse('2023-03-12').valid[0]?.remote.onlineSince).toBe('2023-03-12');
    expect(parse('12/03/2023').valid[0]?.remote.onlineSince).toBe('2023-03-12');
  });

  it('menolak tanggal yang tidak ada dan tanggal setelah hari ini', () => {
    expect(parse('2023-02-30').failed[0]?.errors[0]).toMatch(/bukan tanggal yang sah/);
    expect(parse('2026-11-21').failed[0]?.errors).toEqual(['Online sejak tidak boleh setelah hari ini.']);
    expect(parse('2026-11-20').valid).toHaveLength(1);
  });

  it('judul kolom tidak peka huruf besar/kecil dan spasi berlebih', () => {
    const result = parseRemoteImport([['  KODE   remote ', 'nama remote', 'JARKOM', 'zona waktu'], ['R-02', 'Dua', 'VSAT', 'WIT']], networks, '2026-11-20');
    expect(result.valid[0]?.remote).toMatchObject({ code: 'R-02', zone: 'WIT', networkId: 'n1', active: true });
  });
});

