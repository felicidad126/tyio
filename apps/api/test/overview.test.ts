import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  type Overview,
  type OverviewCount,
  REMOTE_REGION_PROVINCES,
  remoteRegionOf,
  provinceKey,
  type TicketQueueFilter,
  type TicketQueuePage,
  type TicketStatus,
  type TroubleTicketPage,
} from '@npr/shared';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { provinceKeySql, remoteRegionSql } from '../src/modules/remotes/remote-region.js';
import { wibDateSql, wibDayStartSql } from '../src/modules/tickets/list/wib-day.js';
import { createTestApp } from './create-test-app.js';
import {
  closeTicketDirect,
  closeTroubleTicketDirect,
  insertMasterValue,
  insertRemote,
  insertTenant,
  insertTicket,
  insertTroubleTicket,
  insertUser,
  operatorQuery,
  TEST_PASSWORD,
} from './fixtures.js';

// Overview (langkah 2.1). Inti uji: setiap angka di jawaban Overview sama dengan `total`
// GET /api/tickets dengan saringan yang dikirim bersama angka itu (T108–T114).
// Data: dua customer baru, pengguna yang hanya melihat keduanya, sehingga berkas uji lain
// yang menulis paralel ke database yang sama tidak mengubah angka.

type Agent = ReturnType<typeof request.agent>;

/** Semua angka yang bisa diklik di Overview. */
function allCounts(overview: Overview): Array<[string, OverviewCount]> {
  return [
    ['open', overview.open],
    ['pending', overview.pending],
    ['escalated', overview.escalated],
    ['ready', overview.ready],
    ['createdToday', overview.createdToday],
    ['closedToday', overview.closedToday],
    ...overview.byStatus.map((item): [string, OverviewCount] => [`status ${item.status}`, item]),
    ...overview.byCategory.map((item): [string, OverviewCount] => [`kategori ${item.name}`, item]),
    ...overview.byCustomer.map((item): [string, OverviewCount] => [`customer ${item.name}`, item]),
    ...overview.regions.map((item): [string, OverviewCount] => [`wilayah ${item.region}`, item]),
    ...overview.daily.days.flatMap((day) => [
      [`hari ${day.date}`, day.total] as [string, OverviewCount],
      ...day.categories.map((item, index): [string, OverviewCount] => [
        `hari ${day.date} ${overview.daily.categories[index] ?? '?'}`,
        item,
      ]),
    ]),
    ...overview.frequent.map((item): [string, OverviewCount] => [`remote ${item.remote.code}`, item]),
  ];
}

const queryOf = (filter: TicketQueueFilter) =>
  new URLSearchParams(Object.entries(filter).map(([key, value]) => [key, String(value)])).toString();

describe('Overview', () => {
  let app: NestExpressApplication;
  let dataSource: DataSource;
  /** L1 yang hanya melihat customer A dan B. */
  let op: Agent;
  let opA: Agent;
  let tenantA: { id: string; code: string; name: string };
  let tenantB: { id: string; code: string; name: string };
  const remotes: Record<'a1' | 'a2' | 'a3' | 'b1' | 'b2', { id: string; code: string }> = {} as never;
  const t: Record<string, { id: string; number: string }> = {};

  /** Awal hari WIB `offset` hari dari hari ini, ditambah `seconds` detik. */
  async function wibDay(offset: number, seconds = 0): Promise<Date> {
    const [row] = (await dataSource.query(
      `SELECT (((now() AT TIME ZONE 'Asia/Jakarta')::date + $1::int)::timestamp AT TIME ZONE 'Asia/Jakarta')
              + make_interval(secs => $2) AS at`,
      [offset, seconds],
    )) as Array<{ at: Date }>;
    if (!row) throw new Error('Tanggal WIB tidak terbaca.');
    return row.at;
  }

  async function wibDate(offset = 0): Promise<string> {
    const [row] = (await dataSource.query(
      `SELECT to_char((now() AT TIME ZONE 'Asia/Jakarta')::date + $1::int, 'YYYY-MM-DD') AS d`,
      [offset],
    )) as Array<{ d: string }>;
    return row?.d ?? '';
  }

  /** NPR di remote dan kategori tertentu, dipindah ke status `status` lewat linimasa. */
  async function ticket(
    tenantId: string,
    remoteId: string,
    categoryId: string,
    status: TicketStatus,
    createdAt?: Date,
  ): Promise<{ id: string; number: string }> {
    const created = await insertTicket(dataSource, tenantId, { remoteId, categoryId, createdAt });
    if (status === 'ditutup') {
      await closeTicketDirect(dataSource, created.id);
    } else if (status !== 'terbuka') {
      await operatorQuery(
        dataSource,
        `INSERT INTO ticket_actions (tenant_id, ticket_id, kind, note, occurred_at, status_from, status_to,
                                     pending_reason, created_by)
         SELECT tenant_id, id, 'catatan', 'Pindah status', now(), status, $2, $3, created_by FROM tickets WHERE id = $1`,
        [created.id, status, status.startsWith('pending') ? 'Menunggu konfirmasi' : null],
      );
    }
    return created;
  }

  const overview = async (agent: Agent, query = '') =>
    (await agent.get(`/api/overview${query ? `?${query}` : ''}`).expect(200)).body as Overview;
  const queue = async (agent: Agent, filter: TicketQueueFilter) =>
    (await agent.get(`/api/tickets?${queryOf(filter)}&pageSize=100`).expect(200)).body as TicketQueuePage;

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
    const marker = randomUUID().slice(0, 6);
    tenantA = await insertTenant(dataSource, `Bank Nusa ${marker}`);
    tenantB = await insertTenant(dataSource, `BPD Timur ${marker}`);
    const login = async (tenantCodes: string[]) => {
      const user = await insertUser(dataSource, { role: 'l1', tenantCodes });
      const agent = request.agent(app.getHttpServer());
      await agent.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD }).expect(200);
      return agent;
    };
    op = await login([tenantA.code, tenantB.code]);
    opA = await login([tenantA.code]);

    const cat = {
      aRd: (await insertMasterValue(dataSource, 'kategori', tenantA.id, 'Remote Down')).id,
      aCm: (await insertMasterValue(dataSource, 'kategori', tenantA.id, 'Corrective')).id,
      bRd: (await insertMasterValue(dataSource, 'kategori', tenantB.id, 'remote down')).id,
      bPm: (await insertMasterValue(dataSource, 'kategori', tenantB.id, 'Preventive')).id,
    };
    remotes.a1 = await insertRemote(dataSource, tenantA.id, { province: 'Sulawesi Selatan', zone: 'WITA' });
    remotes.a2 = await insertRemote(dataSource, tenantA.id, { province: 'Jawa Barat' });
    remotes.a3 = await insertRemote(dataSource, tenantA.id);
    remotes.b1 = await insertRemote(dataSource, tenantB.id, { province: 'Papua', zone: 'WIT' });
    remotes.b2 = await insertRemote(dataSource, tenantB.id, { province: 'Prov. Sulawesi Tengah', zone: 'WITA' });
    await insertRemote(dataSource, tenantB.id, { province: 'Sulawesi Utara', active: false });

    t.t1 = await ticket(tenantA.id, remotes.a1.id, cat.aRd, 'terbuka');
    t.t2 = await ticket(tenantA.id, remotes.a1.id, cat.aCm, 'dikerjakan');
    t.t3 = await ticket(tenantA.id, remotes.a1.id, cat.aRd, 'pending_customer');
    t.t4 = await ticket(tenantA.id, remotes.a1.id, cat.aRd, 'ditutup');
    t.t5 = await ticket(tenantA.id, remotes.a2.id, cat.aCm, 'eskalasi_sd');
    t.t6 = await ticket(tenantA.id, remotes.a2.id, cat.aRd, 'pulih');
    t.t7 = await ticket(tenantA.id, remotes.a3.id, cat.aRd, 'pending_tm', await wibDay(-3, 10 * 3600));
    t.t8 = await ticket(tenantB.id, remotes.b1.id, cat.bRd, 'eskalasi_l2');
    t.t9 = await ticket(tenantB.id, remotes.b1.id, cat.bPm, 'terbuka', await wibDay(-20, 12 * 3600));
    t.t10 = await ticket(tenantB.id, remotes.b1.id, cat.bPm, 'ditutup', await wibDay(-10, 12 * 3600));
    // Batas periode 7 hari: 00:00 WIB hari pertama masuk, 23:59:59 WIB sehari sebelumnya tidak.
    t.t11 = await ticket(tenantB.id, remotes.b2.id, cat.bRd, 'terbuka', await wibDay(-6));
    t.t12 = await ticket(tenantB.id, remotes.b2.id, cat.bRd, 'terbuka', await wibDay(-6, -1));

    await insertTroubleTicket(dataSource, t.t5.id);
    await closeTroubleTicketDirect(dataSource, (await insertTroubleTicket(dataSource, t.t6.id)).id);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('setiap angka sama dengan total antrean dengan saringannya', () => {
    const cases = ['', 'period=7', 'period=30', 'tenantId=A', 'tenantId=B&period=7'];
    for (const query of cases) {
      it(`?${query}`, async () => {
        const resolved = query.replace('tenantId=A', `tenantId=${tenantA.id}`).replace('tenantId=B', `tenantId=${tenantB.id}`);
        const result = await overview(op, resolved);
        const counts = allCounts(result);
        expect(counts.length).toBeGreaterThan(20);
        for (const [label, item] of counts) {
          const page = await queue(op, item.filter);
          expect({ label, count: page.total }).toEqual({ label, count: item.count });
        }
        const tenantId = new URLSearchParams(resolved).get('tenantId') ?? '';
        const tt = (await op.get(`/api/trouble-tickets?tenantId=${tenantId}`).expect(200)).body as TroubleTicketPage;
        expect(result.activeTroubleTickets).toBe(tt.total);
      });
    }

    it('perbandingan memang membedakan: angka yang diubah tidak lagi sama dengan total', async () => {
      const result = await overview(op);
      const page = await queue(op, result.open.filter);
      expect(page.total).toBe(result.open.count);
      expect(page.total).not.toBe(result.open.count + 1);
    });
  });

  it('angka utama: NPR berjalan, pending, eskalasi, siap ditutup, baru dan ditutup hari ini, TT aktif (T110, T111)', async () => {
    const result = await overview(op);
    expect(result.open.count).toBe(10);
    expect(result.open.filter).toEqual({});
    expect(result.pending).toEqual({ count: 2, filter: { view: 'pending' } });
    expect(result.escalated).toEqual({ count: 2, filter: { view: 'eskalasi' } });
    expect(result.ready).toEqual({ count: 1, filter: { view: 'siap' } });
    const today = await wibDate();
    expect(result.today).toBe(today);
    expect(result.createdToday).toEqual({
      count: 7,
      filter: { status: 'semua', createdFrom: today, createdTo: today },
    });
    expect(result.closedToday).toEqual({
      count: 2,
      filter: { status: 'ditutup', closedFrom: today, closedTo: today },
    });
    expect(result.activeTroubleTickets).toBe(1);
  });

  it('per status (semua status berjalan, termasuk nol), per kategori (nama digabung), per customer', async () => {
    const result = await overview(op);
    expect(result.byStatus.map((item) => [item.status, item.count])).toEqual([
      ['terbuka', 4],
      ['dikerjakan', 1],
      ['pending_customer', 1],
      ['pending_tm', 1],
      ['eskalasi_l2', 1],
      ['eskalasi_sd', 1],
      ['pulih', 1],
    ]);
    expect(result.byStatus[0]?.filter).toEqual({ status: 'terbuka' });
    // "Remote Down" (A) dan "remote down" (B) satu baris (T114).
    expect(result.byCategory.map((item) => [item.name, item.count])).toEqual([
      ['Remote Down', 7],
      ['Corrective', 2],
      ['Preventive', 1],
    ]);
    expect(result.byCategory[0]?.filter).toEqual({ categoryName: 'Remote Down' });
    expect(result.byCustomer.map((item) => [item.tenantId, item.count])).toEqual([
      [tenantA.id, 6],
      [tenantB.id, 4],
    ]);
    expect(result.byCustomer[1]?.filter).toEqual({ tenantId: tenantB.id });
  });

  it('perlu tindakan sekarang = 5 NPR berjalan dengan mulai gangguan terlama, sama dengan antrean (T111)', async () => {
    const result = await overview(op);
    const page = (await op.get('/api/tickets?pageSize=5').expect(200)).body as TicketQueuePage;
    expect(result.urgent).toHaveLength(5);
    expect(result.urgent.map((item) => item.id)).toEqual(page.items.map((item) => item.id));
    expect(result.urgent[0]?.id).toBe(t.t9?.id);
  });

  it('per wilayah: NPR berjalan dan remote aktif, terbanyak lalu barat ke timur (T113)', async () => {
    const result = await overview(op);
    expect(result.regions.map((item) => [item.region, item.count, item.remotes])).toEqual([
      ['Sulawesi', 5, 2],
      ['Jawa', 2, 1],
      ['Papua', 2, 1],
      ['Lainnya', 1, 1],
    ]);
    expect(result.regions[0]?.filter).toEqual({ region: 'Sulawesi' });
  });

  it('tren per hari WIB dalam periode, dipecah per kategori, termasuk NPR Ditutup (T108, T109, T114)', async () => {
    const week = await overview(op, 'period=7');
    expect(week.period).toEqual({ days: 7, from: await wibDate(-6), to: await wibDate() });
    expect(week.daily.days.map((day) => day.date)).toEqual(
      await Promise.all([-6, -5, -4, -3, -2, -1, 0].map((offset) => wibDate(offset))),
    );
    expect(week.daily.categories).toEqual(['Remote Down', 'Corrective']);
    const byDay = week.daily.days.map((day) => [day.total.count, ...day.categories.map((item) => item.count)]);
    expect(byDay).toEqual([[1, 1, 0], [0, 0, 0], [0, 0, 0], [1, 1, 0], [0, 0, 0], [0, 0, 0], [7, 5, 2]]);
    const today = week.daily.days[6];
    expect(today?.total.filter).toEqual({ status: 'semua', createdFrom: week.today, createdTo: week.today });
    expect(today?.categories[1]?.filter).toEqual({
      status: 'semua',
      createdFrom: week.today,
      createdTo: week.today,
      categoryName: 'Corrective',
    });

    const twoWeeks = await overview(op);
    expect(twoWeeks.period.days).toBe(14);
    expect(twoWeeks.daily.days).toHaveLength(14);
    expect(twoWeeks.daily.categories).toEqual(['Remote Down', 'Corrective', 'Preventive']);
    expect(twoWeeks.daily.days.reduce((sum, day) => sum + day.total.count, 0)).toBe(11);

    const month = await overview(op, 'period=30');
    expect(month.daily.days).toHaveLength(30);
    expect(month.daily.days.reduce((sum, day) => sum + day.total.count, 0)).toBe(12);
  });

  it('remote paling sering bermasalah: jumlah NPR dalam periode, 5 teratas, seri = NPR terbaru dulu (T112)', async () => {
    const week = await overview(op, 'period=7');
    expect(week.frequent.map((item) => [item.remote.id, item.count])).toEqual([
      [remotes.a1.id, 4],
      [remotes.a2.id, 2],
      [remotes.b1.id, 1],
      [remotes.a3.id, 1],
      [remotes.b2.id, 1],
    ]);
    expect(week.frequent[0]).toMatchObject({
      remote: { code: remotes.a1.code, zone: 'WITA', customerName: tenantA.name },
      filter: { status: 'semua', createdFrom: week.period.from, createdTo: week.today, remoteId: remotes.a1.id },
    });
    const month = await overview(op, 'period=30');
    expect(month.frequent.map((item) => [item.remote.id, item.count])).toEqual([
      [remotes.a1.id, 4],
      [remotes.b1.id, 3],
      [remotes.a2.id, 2],
      [remotes.b2.id, 2],
      [remotes.a3.id, 1],
    ]);
  });

  it('saringan customer: semua panel hanya customer itu; saringan ikut di setiap angka', async () => {
    const result = await overview(op, `tenantId=${tenantB.id}`);
    expect(result.open).toEqual({ count: 4, filter: { tenantId: tenantB.id } });
    // Semua status berjalan tetap tercantum, juga yang nol.
    expect(result.byStatus.map((item) => [item.status, item.count])).toEqual([
      ['terbuka', 3],
      ['dikerjakan', 0],
      ['pending_customer', 0],
      ['pending_tm', 0],
      ['eskalasi_l2', 1],
      ['eskalasi_sd', 0],
      ['pulih', 0],
    ]);
    expect(result.byCustomer.map((item) => item.tenantId)).toEqual([tenantB.id]);
    expect(result.activeTroubleTickets).toBe(0);
    expect(result.frequent.every((item) => item.filter.tenantId === tenantB.id)).toBe(true);
    expect(result.regions.map((item) => [item.region, item.count, item.remotes])).toEqual([
      ['Sulawesi', 2, 1],
      ['Papua', 2, 1],
    ]);
  });

  it('cakupan customer pengguna: customer lain tidak terhitung', async () => {
    const result = await overview(opA);
    expect(result.open.count).toBe(6);
    expect(result.byCustomer.map((item) => item.tenantId)).toEqual([tenantA.id]);
    const other = await overview(opA, `tenantId=${tenantB.id}`);
    expect(allCounts(other).every(([, item]) => item.count === 0)).toBe(true);
    expect(other.urgent).toEqual([]);
    expect(other.frequent).toEqual([]);
    expect(other.activeTroubleTickets).toBe(0);
  });

  it('parameter yang salah ditolak dengan pesan', async () => {
    const cases: Array<[string, RegExp]> = [
      ['period=10', /period harus salah satu dari: 7, 14, 30/],
      ['period=abc', /period harus salah satu dari/],
      ['period=7.0', /period harus salah satu dari/],
      ['tenantId=bukan-uuid', /tenantId harus id customer yang sah/],
      ['customer=x', /Parameter tidak dikenal: customer/],
    ];
    for (const [query, message] of cases) {
      const res = await op.get(`/api/overview?${query}`).expect(400);
      expect(res.body.message).toMatch(message);
    }
  });

  it('batas hari WIB di SQL: tanggal dari waktu dan awal hari dari tanggal (T109)', async () => {
    const dates = (await dataSource.query(
      `SELECT ${wibDateSql("'2026-11-23T16:59:59Z'::timestamptz")} AS before,
              ${wibDateSql("'2026-11-23T17:00:00Z'::timestamptz")} AS midnight,
              ${wibDateSql("'2026-11-23T17:00:00Z'::timestamptz", '(14 - 1)')} AS first`,
    )) as Array<{ before: string; midnight: string; first: string }>;
    expect(dates[0]).toEqual({ before: '2026-11-23', midnight: '2026-11-24', first: '2026-11-11' });
    const starts = (await dataSource
      .createQueryBuilder()
      .select(wibDayStartSql('d'), 'start')
      .addSelect(wibDayStartSql('d', true), 'next')
      .from('(SELECT 1)', 'x')
      .setParameter('d', '2026-11-24')
      .getRawOne()) as { start: Date; next: Date };
    expect([starts.start.toISOString(), starts.next.toISOString()]).toEqual([
      '2026-11-23T17:00:00.000Z',
      '2026-11-24T17:00:00.000Z',
    ]);
  });

  describe('wilayah di SQL sama dengan @npr/shared (T113)', () => {
    const spellings = [
      ...Object.values(REMOTE_REGION_PROVINCES).flat(),
      'Sulawesi Selatan',
      'Provinsi Sulawesi Selatan',
      'PROV. SUMATERA UTARA',
      'Prov.Papua',
      'DKI Jakarta',
      'D.I. Yogyakarta',
      'Daerah Istimewa Yogyakarta',
      'Kepulauan Bangka Belitung',
      'Nusa Tenggara Timur',
      ' N.T.B. ',
      'Kalimantan-Timur',
      'Papua Barat Daya',
      'Maluku Utara',
      'Atlantis',
      'Sulawesi',
      'Jawa',
      '',
      'Провинция',
      'Jawa Barat 2',
    ];

    it('ejaan yang dirapikan dan wilayahnya sama untuk setiap ejaan di daftar', async () => {
      for (const spelling of spellings) {
        const [row] = (await dataSource.query(
          `SELECT ${provinceKeySql('$1::text')} AS key, ${remoteRegionSql('$1::text')} AS region`,
          [spelling],
        )) as Array<{ key: string; region: string }>;
        expect({ spelling, key: row?.key, region: row?.region }).toEqual({
          spelling,
          key: provinceKey(spelling),
          region: remoteRegionOf(spelling),
        });
      }
      const [none] = (await dataSource.query(`SELECT ${remoteRegionSql('NULL::text')} AS region`)) as Array<{
        region: string;
      }>;
      expect(none?.region).toBe('Lainnya');
    });

    it('38 provinsi dengan nama resminya dikenali', () => {
      const official = [
        'Aceh', 'Sumatera Utara', 'Sumatera Barat', 'Riau', 'Kepulauan Riau', 'Jambi', 'Sumatera Selatan',
        'Kepulauan Bangka Belitung', 'Bengkulu', 'Lampung', 'DKI Jakarta', 'Jawa Barat', 'Banten', 'Jawa Tengah',
        'DI Yogyakarta', 'Jawa Timur', 'Bali', 'Nusa Tenggara Barat', 'Nusa Tenggara Timur', 'Kalimantan Barat',
        'Kalimantan Tengah', 'Kalimantan Selatan', 'Kalimantan Timur', 'Kalimantan Utara', 'Sulawesi Utara',
        'Gorontalo', 'Sulawesi Tengah', 'Sulawesi Barat', 'Sulawesi Selatan', 'Sulawesi Tenggara', 'Maluku',
        'Maluku Utara', 'Papua', 'Papua Barat', 'Papua Barat Daya', 'Papua Tengah', 'Papua Pegunungan',
        'Papua Selatan',
      ];
      expect(official).toHaveLength(38);
      expect(official.filter((name) => remoteRegionOf(name) === 'Lainnya')).toEqual([]);
    });
  });
});
