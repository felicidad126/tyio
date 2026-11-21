import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  NPR_NUMBER_PATTERN,
  type OpenTicketsConflict,
  REMOTE_ZONE_IANA,
  type RemoteZone,
  type TicketDetail,
  type TicketSummary,
} from '@tyio/shared';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { REMOTE_NOT_FOUND_MESSAGE } from '../src/modules/remotes/remotes.service.js';
import {
  CATEGORY_NOT_FOUND_MESSAGE,
  OPEN_TICKETS_MESSAGE,
  SYSTEM_NOT_FOUND_MESSAGE,
  TICKET_NOT_FOUND_MESSAGE,
} from '../src/modules/tickets/tickets.service.js';
import { createTestApp } from './create-test-app.js';
import { insertMasterValue, insertRemote, insertTenant, insertUser, operatorQuery, TEST_PASSWORD } from './fixtures.js';

// Buat NPR (langkah 1.3): nomor NPR/JARKOM/CUSTOMER/TAHUN/BULAN/urut menurut zona remote
// (T55), urut per jarkom per customer per bulan (T56), tanpa bentrok saat disimpan
// bersamaan; peringatan NPR terbuka; mulai gangguan (T57). Isolasi antar-customer diuji di
// tenant-isolation.test.ts.

type Agent = ReturnType<typeof request.agent>;
type Tenant = { id: string; code: string; name: string };

interface Customer {
  tenant: Tenant;
  network: { id: string; code: string };
  categoryId: string;
  systemId: string;
}

const MINUTE = 60_000;

describe('buat NPR', () => {
  let app: NestExpressApplication;
  let dataSource: DataSource;
  let l1: Agent;
  let l1Email: string;
  let l1Other: Agent;
  let l2: Agent;
  let admin: Agent;
  /** Pembuat NPR yang disisipkan langsung ke database. */
  let operatorId: string;

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
    const login = async (role: 'admin' | 'l1' | 'l2') => {
      const user = await insertUser(dataSource, { role, name: `Operator ${role}` });
      const agent = request.agent(app.getHttpServer());
      await agent.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD }).expect(200);
      return { agent, email: user.email };
    };
    ({ agent: l1, email: l1Email } = await login('l1'));
    ({ agent: l1Other } = await login('l1'));
    ({ agent: l2 } = await login('l2'));
    ({ agent: admin } = await login('admin'));
    operatorId = (await insertUser(dataSource, { name: 'Operator langsung' })).id;
  });

  afterAll(async () => {
    await app.close();
  });

  /** Customer baru dengan jarkom, kategori, dan system sendiri: penghitungnya mulai dari nol. */
  async function newCustomer(): Promise<Customer> {
    const tenant = await insertTenant(dataSource, `Bank NPR ${randomUUID().slice(0, 6)}`);
    const network = await insertMasterValue(dataSource, 'jarkom', tenant.id, 'VSAT');
    const category = await insertMasterValue(dataSource, 'kategori', tenant.id, 'Remote Down');
    const system = await insertMasterValue(dataSource, 'system', tenant.id, 'SNMP NOC');
    return { tenant, network: { id: network.id, code: network.code ?? '' }, categoryId: category.id, systemId: system.id };
  }

  const body = (customer: Customer, remoteId: string, extra: Record<string, unknown> = {}) => ({
    remoteId,
    categoryId: customer.categoryId,
    systemId: customer.systemId,
    description: 'Ping gagal 100%, remote lain di hub normal',
    ...extra,
  });

  const create = (agent: Agent, payload: Record<string, unknown>) => agent.post('/api/tickets').send(payload);

  /** Bulan `YYYY/MM` waktu dibuat NPR menurut zona remote, dibaca dari database. */
  async function createdPeriod(ticketId: string, zone: RemoteZone): Promise<string> {
    const [row] = (await dataSource.query(
      `SELECT to_char(created_at AT TIME ZONE $2, 'YYYY/MM') AS period FROM tickets WHERE id = $1`,
      [ticketId, REMOTE_ZONE_IANA[zone]],
    )) as Array<{ period: string }>;
    return row?.period ?? '';
  }

  const sequenceOf = (number: string) => Number(number.split('/')[5]);

  describe('nomor NPR', () => {
    it('L1 membuat NPR: nomor dari jarkom, customer, dan bulan zona remote; data lain dari remote dan sesi', async () => {
      const customer = await newCustomer();
      const remote = await insertRemote(dataSource, customer.tenant.id, { networkId: customer.network.id, zone: 'WITA' });

      const res = await create(l1, body(customer, remote.id)).expect(201);
      const ticket = res.body as TicketDetail;

      const period = await createdPeriod(ticket.id, 'WITA');
      expect(ticket.number).toBe(`NPR/${customer.network.code}/${customer.tenant.code}/${period}/0001`);
      expect(ticket.number).toMatch(NPR_NUMBER_PATTERN);
      expect(ticket).toMatchObject({
        status: 'terbuka',
        tenantId: customer.tenant.id,
        network: { id: customer.network.id, code: customer.network.code, name: 'VSAT' },
        category: { id: customer.categoryId, name: 'Remote Down' },
        system: { id: customer.systemId, name: 'SNMP NOC' },
        createdBy: { name: 'Operator l1' },
        createdByName: 'Operator l1',
        description: 'Ping gagal 100%, remote lain di hub normal',
        remote: { id: remote.id, code: remote.code, zone: 'WITA' },
      });
      // Tanpa mulai gangguan: sama dengan waktu NPR disimpan.
      expect(ticket.startedAt).toBe(ticket.createdAt);

      const reread = await l1.get(`/api/tickets/${ticket.id}`).expect(200);
      expect(reread.body).toEqual(ticket);

      // Tercatat di audit atas nama pengguna yang membuatnya.
      const audit = (await dataSource.query(
        `SELECT source, actor_label, client_ip FROM audit_log WHERE table_name = 'tickets' AND row_id = $1`,
        [ticket.id],
      )) as Array<{ source: string; actor_label: string; client_ip: string | null }>;
      expect(audit).toEqual([expect.objectContaining({ source: 'api', actor_label: l1Email })]);
      expect(audit[0]?.client_ip).toBeTruthy();
    });

    it('urut per jarkom per customer: jarkom lain dan customer lain mulai dari 0001 sendiri', async () => {
      const customer = await newCustomer();
      const vpn = await insertMasterValue(dataSource, 'jarkom', customer.tenant.id, 'VPN IP');
      const other = await newCustomer();
      const [r1, r2] = [
        await insertRemote(dataSource, customer.tenant.id, { networkId: customer.network.id }),
        await insertRemote(dataSource, customer.tenant.id, { networkId: customer.network.id }),
      ];
      const r3 = await insertRemote(dataSource, customer.tenant.id, { networkId: vpn.id });
      const r4 = await insertRemote(dataSource, other.tenant.id, { networkId: other.network.id });

      const numbers: string[] = [];
      for (const [owner, remoteId] of [
        [customer, r1.id],
        [customer, r2.id],
        [customer, r3.id],
        [other, r4.id],
      ] as const) {
        numbers.push(((await create(l1, body(owner, remoteId)).expect(201)).body as TicketDetail).number);
      }

      expect(numbers.map(sequenceOf)).toEqual([1, 2, 1, 1]);
      expect(numbers[2]).toContain(`/${vpn.code}/${customer.tenant.code}/`);
      expect(numbers[3]).toContain(`/${other.network.code}/${other.tenant.code}/`);
    });

    it('urut mulai lagi setiap bulan dan melanjutkan penghitung bulan yang sama', async () => {
      const customer = await newCustomer();
      const remote = await insertRemote(dataSource, customer.tenant.id, { networkId: customer.network.id });
      // Bulan lalu sudah sampai 0041: tidak memengaruhi bulan ini.
      await operatorQuery(
        dataSource,
        `INSERT INTO ticket_counters (tenant_id, kind, network_id, period, last_value)
         VALUES ($1, 'NPR', $2, '2020-01', 41)`,
        [customer.tenant.id, customer.network.id],
      );
      const first = (await create(l1, body(customer, remote.id)).expect(201)).body as TicketDetail;
      expect(sequenceOf(first.number)).toBe(1);

      // Penghitung bulan ini (mis. sesudah pemulihan data) dilanjutkan, bukan diulang.
      const period = (await createdPeriod(first.id, 'WIB')).replace('/', '-');
      await operatorQuery(
        dataSource,
        `UPDATE ticket_counters SET last_value = 417
         WHERE tenant_id = $1 AND kind = 'NPR' AND network_id = $2 AND period = $3`,
        [customer.tenant.id, customer.network.id, period],
      );
      const next = (await create(l1, body(customer, remote.id, { acknowledgeOpenTickets: true })).expect(201))
        .body as TicketDetail;
      expect(next.number.endsWith('/0418')).toBe(true);
    });

    it('bulan dihitung menurut zona remote masing-masing (WIB, WITA, WIT)', async () => {
      const customer = await newCustomer();
      for (const zone of ['WIB', 'WITA', 'WIT'] as const) {
        const remote = await insertRemote(dataSource, customer.tenant.id, { networkId: customer.network.id, zone });
        const ticket = (await create(l1, body(customer, remote.id)).expect(201)).body as TicketDetail;
        expect(ticket.number.split('/').slice(3, 5).join('/')).toBe(await createdPeriod(ticket.id, zone));
      }
    });

    it('pergantian bulan dan tahun mengikuti zona remote (31 Okt 23:30 WIB = 1 Nov di WITA dan WIT)', async () => {
      const customer = await newCustomer();
      const remotes = {
        WIB: await insertRemote(dataSource, customer.tenant.id, { networkId: customer.network.id, zone: 'WIB' }),
        WITA: await insertRemote(dataSource, customer.tenant.id, { networkId: customer.network.id, zone: 'WITA' }),
        WIT: await insertRemote(dataSource, customer.tenant.id, { networkId: customer.network.id, zone: 'WIT' }),
      };
      /** NPR yang disisipkan langsung dengan waktu dibuat tertentu; nomornya dari trigger. */
      const insertAt = async (zone: RemoteZone, createdAt: string) => {
        const rows = (await operatorQuery(
          dataSource,
          `INSERT INTO tickets (tenant_id, remote_id, network_id, category_id, system_id, description,
                                started_at, created_by, created_at)
           VALUES ($1, $2, $3, $4, $5, 'uji pergantian bulan', $6, $7, $6) RETURNING number`,
          [customer.tenant.id, remotes[zone].id, customer.network.id, customer.categoryId, customer.systemId, createdAt, operatorId],
        )) as Array<{ number: string }>;
        return rows[0]?.number.split('/').slice(3).join('/');
      };

      // 23:30 WIB = 00:30 WITA = 01:30 WIT tanggal 1 November.
      expect(await insertAt('WIB', '2026-10-31T23:30:00+07:00')).toBe('2026/10/0001');
      expect(await insertAt('WITA', '2026-10-31T23:30:00+07:00')).toBe('2026/11/0001');
      expect(await insertAt('WIT', '2026-10-31T23:30:00+07:00')).toBe('2026/11/0002');
      // 22:30 WIB = 23:30 WITA (masih Oktober) = 00:30 WIT (sudah November).
      expect(await insertAt('WITA', '2026-10-31T22:30:00+07:00')).toBe('2026/10/0002');
      expect(await insertAt('WIT', '2026-10-31T22:30:00+07:00')).toBe('2026/11/0003');
      // Pergantian tahun: 22:30 WIB = 00:30 WIT tanggal 1 Januari.
      expect(await insertAt('WIB', '2026-12-31T15:30:00Z')).toBe('2026/12/0001');
      expect(await insertAt('WIT', '2026-12-31T15:30:00Z')).toBe('2027/01/0001');
    });

    it('zona remote di database sama dengan REMOTE_ZONE_IANA di aplikasi', async () => {
      for (const zone of ['WIB', 'WITA', 'WIT'] as const) {
        const [row] = (await dataSource.query('SELECT ticket_zone_iana($1) AS zone', [zone])) as Array<{ zone: string }>;
        expect(row?.zone).toBe(REMOTE_ZONE_IANA[zone]);
      }
    });

    it('urut minimal empat digit dan tidak pernah dipotong (sesudah 9999 menjadi 10000)', async () => {
      const customer = await newCustomer();
      const remote = await insertRemote(dataSource, customer.tenant.id, { networkId: customer.network.id });
      const first = (await create(l1, body(customer, remote.id)).expect(201)).body as TicketDetail;
      expect(first.number.endsWith('/0001')).toBe(true);
      await operatorQuery(dataSource, 'UPDATE ticket_counters SET last_value = 9999 WHERE tenant_id = $1', [
        customer.tenant.id,
      ]);

      const next = (await create(l1, body(customer, remote.id, { acknowledgeOpenTickets: true })).expect(201))
        .body as TicketDetail;
      expect(next.number.endsWith('/10000')).toBe(true);
      expect(next.number).toMatch(NPR_NUMBER_PATTERN);
    });

    it('penyimpanan yang gagal tidak menghabiskan nomor', async () => {
      const customer = await newCustomer();
      const remote = await insertRemote(dataSource, customer.tenant.id, { networkId: customer.network.id });
      const marker = `GAGAL-UJI-${randomUUID()}`;
      // Kegagalan buatan setelah nomor diambil, hanya untuk keterangan penanda ini.
      const trigger = `uji_gagal_${randomUUID().replace(/-/g, '')}`;
      await dataSource.query(`
        CREATE FUNCTION ${trigger}() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'gagal buatan uji'; END $$`);
      await dataSource.query(
        `CREATE TRIGGER ${trigger} BEFORE INSERT ON tickets FOR EACH ROW
         WHEN (NEW.description = '${marker}') EXECUTE FUNCTION ${trigger}()`,
      );
      try {
        await create(l1, body(customer, remote.id, { description: marker })).expect(500);
      } finally {
        await dataSource.query(`DROP TRIGGER ${trigger} ON tickets`);
        await dataSource.query(`DROP FUNCTION ${trigger}()`);
      }

      const ticket = (await create(l1, body(customer, remote.id)).expect(201)).body as TicketDetail;
      expect(sequenceOf(ticket.number)).toBe(1);
    });
  });

  describe('disimpan bersamaan', () => {
    it('sepuluh NPR serentak dari dua operator di jarkom yang sama mendapat 0001–0010 tanpa bentrok', async () => {
      const customer = await newCustomer();
      const remotes = await Promise.all(
        Array.from({ length: 10 }, () =>
          insertRemote(dataSource, customer.tenant.id, { networkId: customer.network.id }),
        ),
      );

      const results = await Promise.all(
        remotes.map((remote, index) => create(index % 2 === 0 ? l1 : l1Other, body(customer, remote.id))),
      );

      expect(results.map((res) => res.status)).toEqual(Array(10).fill(201));
      const numbers = results.map((res) => (res.body as TicketDetail).number);
      expect(new Set(numbers).size).toBe(10);
      expect(numbers.map(sequenceOf).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    });

    it('NPR serentak untuk remote yang sama: hanya satu tersimpan, sisanya mendapat peringatan', async () => {
      const customer = await newCustomer();
      const remote = await insertRemote(dataSource, customer.tenant.id, { networkId: customer.network.id });

      const results = await Promise.all(
        Array.from({ length: 8 }, (_, index) => create(index % 2 === 0 ? l1 : l1Other, body(customer, remote.id))),
      );

      const created = results.filter((res) => res.status === 201);
      const warned = results.filter((res) => res.status === 409);
      expect(created).toHaveLength(1);
      expect(warned).toHaveLength(7);
      const first = created[0]?.body as TicketDetail;
      for (const res of warned) {
        expect((res.body as OpenTicketsConflict).openTickets.map((ticket) => ticket.number)).toEqual([first.number]);
      }
      const count = (await dataSource.query('SELECT count(*)::int AS n FROM tickets WHERE remote_id = $1', [
        remote.id,
      ])) as Array<{ n: number }>;
      expect(count[0]?.n).toBe(1);
    });

    it('NPR serentak untuk remote yang sama dengan konfirmasi: semua tersimpan dengan nomor berbeda', async () => {
      const customer = await newCustomer();
      const remote = await insertRemote(dataSource, customer.tenant.id, { networkId: customer.network.id });

      const results = await Promise.all(
        Array.from({ length: 5 }, () => create(l1, body(customer, remote.id, { acknowledgeOpenTickets: true }))),
      );

      expect(results.map((res) => res.status)).toEqual(Array(5).fill(201));
      expect(results.map((res) => sequenceOf((res.body as TicketDetail).number)).sort()).toEqual([1, 2, 3, 4, 5]);
    });
  });

  describe('peringatan NPR terbuka', () => {
    it('remote dengan NPR terbuka: 409 berisi NPR itu tanpa menyimpan; dengan konfirmasi tersimpan', async () => {
      const customer = await newCustomer();
      const remote = await insertRemote(dataSource, customer.tenant.id, { networkId: customer.network.id });
      const first = (await create(l1, body(customer, remote.id)).expect(201)).body as TicketDetail;

      const warned = await create(l2, body(customer, remote.id)).expect(409);
      expect(warned.body).toEqual({
        statusCode: 409,
        message: OPEN_TICKETS_MESSAGE,
        openTickets: [
          {
            id: first.id,
            number: first.number,
            status: 'terbuka',
            categoryName: 'Remote Down',
            startedAt: first.startedAt,
            createdAt: first.createdAt,
            createdByName: 'Operator l1',
            description: first.description,
          },
        ],
      });

      // Yang ditolak tidak menghabiskan nomor.
      const second = (await create(l2, body(customer, remote.id, { acknowledgeOpenTickets: true })).expect(201))
        .body as TicketDetail;
      expect(sequenceOf(second.number)).toBe(2);
      expect(second.createdByName).toBe('Operator l2');
    });

    it('NPR terbuka sebuah remote terbaca terbaru dulu; remote tanpa NPR kosong; remote asing 404', async () => {
      const customer = await newCustomer();
      const remote = await insertRemote(dataSource, customer.tenant.id, { networkId: customer.network.id });
      const quiet = await insertRemote(dataSource, customer.tenant.id, { networkId: customer.network.id });
      const first = (await create(l1, body(customer, remote.id)).expect(201)).body as TicketDetail;
      const second = (await create(admin, body(customer, remote.id, { acknowledgeOpenTickets: true })).expect(201))
        .body as TicketDetail;

      const open = (await l1.get(`/api/remotes/${remote.id}/open-tickets`).expect(200)).body as TicketSummary[];
      expect(open.map((ticket) => ticket.number)).toEqual([second.number, first.number]);
      expect((await l1.get(`/api/remotes/${quiet.id}/open-tickets`).expect(200)).body).toEqual([]);
      for (const id of [randomUUID(), 'bukan-uuid']) {
        const res = await l1.get(`/api/remotes/${id}/open-tickets`).expect(404);
        expect(res.body.message).toBe(REMOTE_NOT_FOUND_MESSAGE);
      }
    });
  });

  describe('mulai gangguan', () => {
    it('dua jam lalu disimpan apa adanya; sedikit di depan jam server disamakan dengan waktu dibuat', async () => {
      const customer = await newCustomer();
      const remote = await insertRemote(dataSource, customer.tenant.id, { networkId: customer.network.id });
      const twoHoursAgo = new Date(Date.now() - 120 * MINUTE);
      twoHoursAgo.setUTCSeconds(0, 0);

      const past = (await create(l1, body(customer, remote.id, { startedAt: twoHoursAgo.toISOString() })).expect(201))
        .body as TicketDetail;
      expect(past.startedAt).toBe(twoHoursAgo.toISOString());

      const ahead = new Date(Date.now() + 2 * MINUTE).toISOString().replace('Z', '+00:00');
      const skewed = (
        await create(l1, body(customer, remote.id, { startedAt: ahead, acknowledgeOpenTickets: true })).expect(201)
      ).body as TicketDetail;
      expect(skewed.startedAt).toBe(skewed.createdAt);
    });

    it('menerima zona tertulis (+08:00) dan menolak waktu tanpa zona, di masa depan, atau lebih dari 30 hari', async () => {
      const customer = await newCustomer();
      const remote = await insertRemote(dataSource, customer.tenant.id, { networkId: customer.network.id, zone: 'WITA' });
      const witaHourAgo = new Date(Date.now() - 60 * MINUTE + 8 * 60 * MINUTE).toISOString().slice(0, 16);

      const ok = (await create(l1, body(customer, remote.id, { startedAt: `${witaHourAgo}+08:00` })).expect(201))
        .body as TicketDetail;
      expect(ok.startedAt).toBe(new Date(`${witaHourAgo}:00+08:00`).toISOString());

      const cases: Array<[unknown, string]> = [
        [witaHourAgo, 'Mulai gangguan harus berupa tanggal dan jam yang sah.'],
        ['kemarin', 'Mulai gangguan harus berupa tanggal dan jam yang sah.'],
        ['2026-13-40T25:00+07:00', 'Mulai gangguan harus berupa tanggal dan jam yang sah.'],
        [new Date(Date.now() + 10 * MINUTE).toISOString(), 'Mulai gangguan tidak boleh di masa depan.'],
        [new Date(Date.now() - 31 * 24 * 60 * MINUTE).toISOString(), 'Mulai gangguan paling lama 30 hari sebelum NPR dibuat.'],
      ];
      for (const [startedAt, message] of cases) {
        const res = await create(l1, body(customer, remote.id, { startedAt, acknowledgeOpenTickets: true })).expect(400);
        expect(res.body.message).toBe(message);
      }
    });
  });

  describe('masukan dan penjaga', () => {
    it('L2 dan admin juga bisa membuat NPR', async () => {
      const customer = await newCustomer();
      for (const agent of [l2, admin]) {
        const remote = await insertRemote(dataSource, customer.tenant.id, { networkId: customer.network.id });
        await create(agent, body(customer, remote.id)).expect(201);
      }
    });

    it('kolom wajib, panjang keterangan, dan kolom yang diisi sistem', async () => {
      const customer = await newCustomer();
      const remote = await insertRemote(dataSource, customer.tenant.id, { networkId: customer.network.id });
      const cases: Array<[Record<string, unknown>, string]> = [
        [{ categoryId: undefined }, 'Kategori wajib dipilih.'],
        [{ categoryId: 'bukan-uuid' }, CATEGORY_NOT_FOUND_MESSAGE],
        [{ categoryId: randomUUID() }, CATEGORY_NOT_FOUND_MESSAGE],
        [{ systemId: '' }, 'System wajib dipilih.'],
        [{ systemId: randomUUID() }, SYSTEM_NOT_FOUND_MESSAGE],
        [{ description: '   ' }, 'Keterangan wajib diisi.'],
        [{ description: 'x'.repeat(2001) }, 'Keterangan paling panjang 2000 karakter.'],
        [{ acknowledgeOpenTickets: 'ya' }, 'acknowledgeOpenTickets harus true atau false.'],
        [{ number: 'NPR/VSAT/BNA/2026/11/0001' }, 'Kolom ini tidak bisa diisi atau diubah: number.'],
        [{ createdBy: randomUUID(), tenantId: randomUUID() }, 'Kolom ini tidak bisa diisi atau diubah: createdBy, tenantId.'],
      ];
      for (const [extra, message] of cases) {
        const res = await create(l1, body(customer, remote.id, extra)).expect(400);
        expect(res.body.message).toBe(message);
      }
      for (const remoteId of [randomUUID(), 'bukan-uuid']) {
        const res = await create(l1, body(customer, remoteId)).expect(404);
        expect(res.body.message).toBe(REMOTE_NOT_FOUND_MESSAGE);
      }
      const stored = (await dataSource.query('SELECT count(*)::int AS n FROM tickets WHERE tenant_id = $1', [
        customer.tenant.id,
      ])) as Array<{ n: number }>;
      expect(stored[0]?.n).toBe(0);

      // Keterangan dirapikan di tepi, baris baru di dalamnya dipertahankan.
      const ticket = (await create(l1, body(customer, remote.id, { description: '  Baris 1\nBaris 2  ' })).expect(201))
        .body as TicketDetail;
      expect(ticket.description).toBe('Baris 1\nBaris 2');
    });

    it('remote nonaktif, customer nonaktif, dan kategori/system nonaktif ditolak', async () => {
      const customer = await newCustomer();
      const inactiveRemote = await insertRemote(dataSource, customer.tenant.id, {
        networkId: customer.network.id,
        active: false,
      });
      const res = await create(l1, body(customer, inactiveRemote.id)).expect(400);
      expect(res.body.message).toBe(
        `Remote ${inactiveRemote.code} nonaktif; NPR baru tidak bisa dibuat. Admin bisa mengaktifkannya lewat impor.`,
      );

      const remote = await insertRemote(dataSource, customer.tenant.id, { networkId: customer.network.id });
      await operatorQuery(dataSource, 'UPDATE master_categories SET active = false WHERE id = $1', [customer.categoryId]);
      const category = await create(l1, body(customer, remote.id)).expect(400);
      expect(category.body.message).toBe('Kategori Remote Down sudah dinonaktifkan. Pilih kategori lain.');
      await operatorQuery(dataSource, 'UPDATE master_categories SET active = true WHERE id = $1', [customer.categoryId]);
      await operatorQuery(dataSource, 'UPDATE master_systems SET active = false WHERE id = $1', [customer.systemId]);
      const system = await create(l1, body(customer, remote.id)).expect(400);
      expect(system.body.message).toBe('System SNMP NOC sudah dinonaktifkan. Pilih system lain.');
      await operatorQuery(dataSource, 'UPDATE master_systems SET active = true WHERE id = $1', [customer.systemId]);

      await operatorQuery(dataSource, 'UPDATE tenants SET active = false WHERE id = $1', [customer.tenant.id]);
      const tenant = await create(l1, body(customer, remote.id)).expect(400);
      expect(tenant.body.message).toBe(`Customer ${customer.tenant.name} nonaktif; NPR baru tidak bisa dibuat.`);
    });

    it('halaman NPR: id asing atau salah format dijawab 404', async () => {
      for (const id of [randomUUID(), 'NPR-1']) {
        const res = await l1.get(`/api/tickets/${id}`).expect(404);
        expect(res.body.message).toBe(TICKET_NOT_FOUND_MESSAGE);
      }
    });

    it('database menolak nomor yang diisi sendiri, nilai customer lain, dan perubahan nomor', async () => {
      const customer = await newCustomer();
      const other = await newCustomer();
      const remote = await insertRemote(dataSource, customer.tenant.id, { networkId: customer.network.id });
      const otherRemote = await insertRemote(dataSource, other.tenant.id, { networkId: other.network.id });
      const ticket = (await create(l1, body(customer, remote.id)).expect(201)).body as TicketDetail;
      const insert = (values: { number?: string; remoteId?: string; networkId?: string; categoryId?: string }) =>
        operatorQuery(
          dataSource,
          `INSERT INTO tickets (tenant_id, number, remote_id, network_id, category_id, system_id,
                                description, started_at, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, 'uji', now(), $7)`,
          [
            customer.tenant.id,
            values.number ?? null,
            values.remoteId ?? remote.id,
            values.networkId ?? customer.network.id,
            values.categoryId ?? customer.categoryId,
            customer.systemId,
            operatorId,
          ],
        );

      await expect(insert({ number: 'NPR/VSAT/BNA/2026/11/0001' })).rejects.toMatchObject({
        driverError: { constraint: 'tickets_number_assigned' },
      });
      await expect(insert({ remoteId: otherRemote.id })).rejects.toMatchObject({
        driverError: { constraint: 'tickets_remote_same_tenant' },
      });
      await expect(insert({ networkId: other.network.id })).rejects.toMatchObject({
        driverError: { constraint: 'tickets_network_same_tenant' },
      });
      await expect(insert({ categoryId: other.categoryId })).rejects.toMatchObject({
        driverError: { constraint: 'tickets_category_same_tenant' },
      });
      await expect(
        operatorQuery(dataSource, `UPDATE tickets SET number = number || '9' WHERE id = $1`, [ticket.id]),
      ).rejects.toMatchObject({ driverError: { constraint: 'tickets_number_immutable' } });
      // Penolakan di atas tidak menghabiskan nomor.
      const next = (await create(l1, body(customer, remote.id, { acknowledgeOpenTickets: true })).expect(201))
        .body as TicketDetail;
      expect(sequenceOf(next.number)).toBe(2);
    });

    it('kategori dan system yang sudah dipakai NPR hanya bisa dinonaktifkan (T45)', async () => {
      const customer = await newCustomer();
      const remote = await insertRemote(dataSource, customer.tenant.id, { networkId: customer.network.id });
      await create(l1, body(customer, remote.id)).expect(201);

      for (const [kind, id] of [
        ['kategori', customer.categoryId],
        ['system', customer.systemId],
      ] as const) {
        const res = await admin.delete(`/api/master/${kind}/${id}`).expect(409);
        expect(res.body.message).toContain('Nonaktifkan saja');
      }
    });
  });
});
