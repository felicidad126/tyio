import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { remoteRegionOf, type TicketQueuePage, type TicketStatus, type TicketTimeline } from '@tyio/shared';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  ALREADY_ASSIGNEE_MESSAGE,
  TICKET_CLOSED_MESSAGE,
} from '../src/modules/tickets/actions/ticket-actions.service.js';
import { createTestApp } from './create-test-app.js';
import {
  CLOSE_CAUSE,
  CLOSE_KIND,
  insertMasterValue,
  insertRemote,
  insertTenant,
  insertTicket,
  insertUser,
  operatorQuery,
  TEST_PASSWORD,
} from './fixtures.js';

// Antrean NPR dan penanggung (langkah 1.5): lima tampilan bawaan dengan jumlahnya (T82),
// saringan, urutan mulai gangguan terlama (T83), halaman, dan "Ambil" (T81, T85).
// Setiap uji memakai customer baru dan saringan tenantId, karena berkas uji lain menulis ke
// database yang sama secara paralel. Isolasi antar-customer di tenant-isolation.test.ts.

type Agent = ReturnType<typeof request.agent>;

const MINUTE = 60_000;

/** Jalan dari Terbuka ke setiap status. */
const PATH_TO: Record<TicketStatus, TicketStatus[]> = {
  terbuka: [],
  dikerjakan: ['dikerjakan'],
  pending_customer: ['pending_customer'],
  pending_tm: ['pending_tm'],
  eskalasi_l2: ['eskalasi_l2'],
  eskalasi_sd: ['eskalasi_sd'],
  pulih: ['pulih'],
  ditutup: ['pulih', 'ditutup'],
};

describe('antrean NPR', () => {
  let app: NestExpressApplication;
  let dataSource: DataSource;
  let l1: Agent;
  let l1Id: string;
  let l1Name: string;
  let l2: Agent;
  let l2Id: string;
  let l2Name: string;

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
    const login = async (role: 'l1' | 'l2', name: string) => {
      const user = await insertUser(dataSource, { role, name });
      const agent = request.agent(app.getHttpServer());
      await agent.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD }).expect(200);
      return { agent, id: user.id };
    };
    l1Name = `Dewi ${randomUUID().slice(0, 4)}`;
    l2Name = `Arif ${randomUUID().slice(0, 4)}`;
    ({ agent: l1, id: l1Id } = await login('l1', l1Name));
    ({ agent: l2, id: l2Id } = await login('l2', l2Name));
  });

  afterAll(async () => {
    await app.close();
  });

  const newTenant = async () => (await insertTenant(dataSource, `Bank Antrean ${randomUUID().slice(0, 6)}`)).id;

  async function ticketIn(
    tenantId: string,
    status: TicketStatus,
    options: { remoteId?: string; pendingReason?: string } = {},
  ): Promise<{ id: string; number: string }> {
    const ticket = await insertTicket(dataSource, tenantId, { remoteId: options.remoteId });
    let from: TicketStatus = 'terbuka';
    for (const to of PATH_TO[status]) {
      await operatorQuery(
        dataSource,
        `INSERT INTO ticket_actions (tenant_id, ticket_id, kind, note, occurred_at, status_from, status_to,
                                     pending_reason, close_cause, created_by)
         SELECT tenant_id, id, ${CLOSE_KIND}, 'Pindah status', now(), $2, $3, $4, ${CLOSE_CAUSE}, created_by
           FROM tickets WHERE id = $1`,
        [
          ticket.id,
          from,
          to,
          to.startsWith('pending') ? (options.pendingReason ?? 'Menunggu konfirmasi') : null,
        ],
      );
      from = to;
    }
    return ticket;
  }

  /** Mulai gangguan sekian menit sebelum NPR dibuat (lewat entri koreksi, satu-satunya jalan). */
  function startedMinutesBefore(ticketId: string, minutes: number): Promise<unknown> {
    return operatorQuery(
      dataSource,
      `INSERT INTO ticket_actions (tenant_id, ticket_id, kind, note, occurred_at, corrects_id, started_at_correction,
                                   created_by)
       SELECT t.tenant_id, t.id, 'koreksi', 'Mulai gangguan dari log', now(), a.id,
              t.created_at - make_interval(mins => $2), t.created_by
         FROM tickets t JOIN ticket_actions a ON a.ticket_id = t.id AND a.kind = 'dibuat' WHERE t.id = $1`,
      [ticketId, minutes],
    );
  }

  const queue = async (agent: Agent, query: string) =>
    (await agent.get(`/api/tickets?${query}`).expect(200)).body as TicketQueuePage;
  const idsOf = (page: TicketQueuePage) => page.items.map((item) => item.id).sort();

  describe('tampilan bawaan', () => {
    it('lima tampilan dengan jumlahnya: Semua terbuka tanpa Ditutup, Milik saya, Pending, Eskalasi, Siap ditutup', async () => {
      const tenantId = await newTenant();
      const t = {
        terbuka: await ticketIn(tenantId, 'terbuka'),
        dikerjakan: await ticketIn(tenantId, 'dikerjakan'),
        pendingCustomer: await ticketIn(tenantId, 'pending_customer'),
        pendingTm: await ticketIn(tenantId, 'pending_tm'),
        eskalasiL2: await ticketIn(tenantId, 'eskalasi_l2'),
        eskalasiSd: await ticketIn(tenantId, 'eskalasi_sd'),
        pulih: await ticketIn(tenantId, 'pulih'),
        ditutup: await ticketIn(tenantId, 'ditutup'),
      };
      await l1.post(`/api/tickets/${t.dikerjakan.id}/take`).send({ expectedAssigneeId: null }).expect(201);
      await l1.post(`/api/tickets/${t.pulih.id}/take`).send({ expectedAssigneeId: null }).expect(201);
      await l2.post(`/api/tickets/${t.eskalasiL2.id}/take`).send({ expectedAssigneeId: null }).expect(201);

      const all = await queue(l1, `tenantId=${tenantId}`);
      expect(all.counts).toEqual({ semua: 7, saya: 2, pending: 2, eskalasi: 2, siap: 1 });
      expect(all.total).toBe(7);
      expect(idsOf(all)).not.toContain(t.ditutup.id);

      expect(idsOf(await queue(l1, `tenantId=${tenantId}&view=saya`))).toEqual([t.dikerjakan.id, t.pulih.id].sort());
      expect(idsOf(await queue(l2, `tenantId=${tenantId}&view=saya`))).toEqual([t.eskalasiL2.id]);
      expect(idsOf(await queue(l1, `tenantId=${tenantId}&view=pending`))).toEqual(
        [t.pendingCustomer.id, t.pendingTm.id].sort(),
      );
      expect(idsOf(await queue(l1, `tenantId=${tenantId}&view=eskalasi`))).toEqual(
        [t.eskalasiL2.id, t.eskalasiSd.id].sort(),
      );
      expect(idsOf(await queue(l1, `tenantId=${tenantId}&view=siap`))).toEqual([t.pulih.id]);

      // NPR Ditutup hanya lewat saringan status.
      const closed = await queue(l1, `tenantId=${tenantId}&status=ditutup`);
      expect(idsOf(closed)).toEqual([t.ditutup.id]);
      expect(closed.counts).toEqual({ semua: 1, saya: 0, pending: 0, eskalasi: 0, siap: 0 });
    });

    it('baris memuat remote, customer, status, alasan pending, penanggung, dan tindakan terakhir', async () => {
      const tenantId = await newTenant();
      const remote = await insertRemote(dataSource, tenantId, { city: 'Kendari', zone: 'WITA' });
      const ticket = await ticketIn(tenantId, 'pending_tm', { remoteId: remote.id, pendingReason: 'Menunggu teknisi TM' });
      await l2.post(`/api/tickets/${ticket.id}/take`).send({ expectedAssigneeId: null }).expect(201);
      await l1
        .post(`/api/tickets/${ticket.id}/actions`)
        .send({ kind: 'hubungi_customer', note: 'PIC dihubungi', customerTicketNumber: 'INC-501' })
        .expect(201);

      const [item] = (await queue(l1, `tenantId=${tenantId}`)).items;
      expect(item).toMatchObject({
        id: ticket.id,
        number: ticket.number,
        status: 'pending_tm',
        tenantId,
        customerName: expect.stringMatching(/^Bank Antrean/),
        customerTicketNumber: 'INC-501',
        remote: { id: remote.id, code: remote.code, name: remote.name, city: 'Kendari', zone: 'WITA' },
        assignee: { id: l2Id, name: l2Name, role: 'l2' },
        pendingReason: 'Menunggu teknisi TM',
        lastAction: { kind: 'hubungi_customer', byName: l1Name },
      });
    });
  });

  describe('saringan, urutan, halaman', () => {
    it('bawaan: mulai gangguan terlama di atas; sort=terbaru: NPR terbaru dulu (T83)', async () => {
      const tenantId = await newTenant();
      const first = await ticketIn(tenantId, 'terbuka');
      const second = await ticketIn(tenantId, 'terbuka');
      const third = await ticketIn(tenantId, 'terbuka');
      await startedMinutesBefore(first.id, 10);
      await startedMinutesBefore(second.id, 300);
      await startedMinutesBefore(third.id, 60);

      const byStart = await queue(l1, `tenantId=${tenantId}`);
      expect(byStart.items.map((item) => item.id)).toEqual([second.id, third.id, first.id]);
      const newest = await queue(l1, `tenantId=${tenantId}&sort=terbaru`);
      expect(newest.items.map((item) => item.id)).toEqual([third.id, second.id, first.id]);
    });

    it('halaman: pageSize dan page; total tetap', async () => {
      const tenantId = await newTenant();
      const created = [];
      for (let index = 0; index < 5; index += 1) created.push(await ticketIn(tenantId, 'terbuka'));
      const page2 = await queue(l1, `tenantId=${tenantId}&sort=terbaru&pageSize=2&page=2`);
      expect(page2).toMatchObject({ total: 5, page: 2, pageSize: 2 });
      expect(page2.items.map((item) => item.id)).toEqual([created[2]?.id, created[1]?.id]);
      expect((await queue(l1, `tenantId=${tenantId}&pageSize=2&page=4`)).items).toEqual([]);
    });

    it('saringan kategori, system, status, dan kata kunci (no. NPR, no. tiket customer, remote)', async () => {
      const tenantId = await newTenant();
      const remote = await insertRemote(dataSource, tenantId, { name: 'ATM Pasar Sentral', city: 'Makassar' });
      const a = await ticketIn(tenantId, 'dikerjakan', { remoteId: remote.id });
      const b = await ticketIn(tenantId, 'eskalasi_sd');
      await l1
        .post(`/api/tickets/${b.id}/actions`)
        .send({ kind: 'catatan', note: 'Nomor customer', customerTicketNumber: 'INC-88_213' })
        .expect(201);
      const [refs] = (await dataSource.query('SELECT category_id, system_id FROM tickets WHERE id = $1', [b.id])) as Array<{
        category_id: string;
        system_id: string;
      }>;

      expect(idsOf(await queue(l1, `tenantId=${tenantId}&categoryId=${refs?.category_id}`))).toEqual([b.id]);
      expect(idsOf(await queue(l1, `tenantId=${tenantId}&systemId=${refs?.system_id}`))).toEqual([b.id]);
      expect(idsOf(await queue(l1, `tenantId=${tenantId}&status=dikerjakan`))).toEqual([a.id]);
      expect(idsOf(await queue(l1, `tenantId=${tenantId}&q=${encodeURIComponent(a.number)}`))).toEqual([a.id]);
      expect(idsOf(await queue(l1, `tenantId=${tenantId}&q=inc-88_2`))).toEqual([b.id]);
      expect(idsOf(await queue(l1, `tenantId=${tenantId}&q=pasar%20sentral`))).toEqual([a.id]);
      expect(idsOf(await queue(l1, `tenantId=${tenantId}&q=${remote.code.toLowerCase()}`))).toEqual([a.id]);
      expect(idsOf(await queue(l1, `tenantId=${tenantId}&q=makassar`))).toEqual([a.id]);
      // % dan _ dicari apa adanya, bukan pola.
      expect((await queue(l1, `tenantId=${tenantId}&q=%25`)).total).toBe(0);
      expect((await queue(l1, `tenantId=${tenantId}&q=INC_88`)).total).toBe(0);
      // Id saringan yang salah format: kosong, bukan galat.
      expect((await queue(l1, `tenantId=bukan-uuid`)).total).toBe(0);
    });

    it('parameter yang salah ditolak dengan pesan', async () => {
      const cases: Array<[string, RegExp]> = [
        ['view=ditutup', /view harus salah satu dari/],
        ['sort=sla', /sort harus salah satu dari/],
        ['status=selesai', /Status tidak dikenal/],
        ['pageSize=101', /pageSize harus bilangan 1–100/],
        ['page=0', /page harus bilangan/],
        ['milik=saya', /Saringan tidak dikenal: milik/],
        [`q=${'x'.repeat(101)}`, /paling panjang 100/],
        ['region=Atlantis', /region harus salah satu dari: Sumatera, Jawa/],
        [`categoryName=${'k'.repeat(81)}`, /Nama kategori paling panjang 80/],
        ['createdFrom=2026-02-30', /createdFrom harus tanggal YYYY-MM-DD yang sah/],
        ['createdTo=24-11-2026', /createdTo harus tanggal YYYY-MM-DD yang sah/],
        ['closedFrom=2026-11-2', /closedFrom harus tanggal/],
        ['createdFrom=2026-11-24&createdTo=2026-11-23', /createdFrom tidak boleh sesudah createdTo/],
        ['closedFrom=2026-11-24&closedTo=2026-11-01', /closedFrom tidak boleh sesudah closedTo/],
      ];
      for (const [query, message] of cases) {
        const res = await l1.get(`/api/tickets?${query}`).expect(400);
        expect(res.body.message).toMatch(message);
      }
    });
  });

  describe('saringan untuk angka Overview (langkah 2.1)', () => {
    /** Hari ini menurut WIB dari jam database, `YYYY-MM-DD`. */
    async function wibDate(offsetDays = 0): Promise<string> {
      const [row] = (await dataSource.query(
        `SELECT to_char((now() AT TIME ZONE 'Asia/Jakarta')::date + $1::int, 'YYYY-MM-DD') AS d`,
        [offsetDays],
      )) as Array<{ d: string }>;
      return row?.d ?? '';
    }

    it('status=semua memuat NPR Ditutup; jumlah tampilan lain tetap', async () => {
      const tenantId = await newTenant();
      const open = await ticketIn(tenantId, 'pending_tm');
      const closed = await ticketIn(tenantId, 'ditutup');
      const all = await queue(l1, `tenantId=${tenantId}&status=semua`);
      expect(idsOf(all)).toEqual([open.id, closed.id].sort());
      expect(all.counts).toEqual({ semua: 2, saya: 0, pending: 1, eskalasi: 0, siap: 0 });
      expect((await queue(l1, `tenantId=${tenantId}`)).total).toBe(1);
      // Waktu ditutup ikut di baris, agar lama gangguan NPR Ditutup tidak dihitung sampai sekarang.
      const byId = new Map(all.items.map((item) => [item.id, item]));
      expect(byId.get(open.id)?.closedAt).toBeNull();
      expect(new Date(byId.get(closed.id)?.closedAt ?? '').getTime()).toBeGreaterThan(Date.now() - 60_000);
    });

    it('remoteId: hanya NPR remote itu; id yang salah format memberi hasil kosong', async () => {
      const tenantId = await newTenant();
      const remote = await insertRemote(dataSource, tenantId);
      const a = await ticketIn(tenantId, 'terbuka', { remoteId: remote.id });
      const b = await ticketIn(tenantId, 'ditutup', { remoteId: remote.id });
      await ticketIn(tenantId, 'terbuka');
      expect(idsOf(await queue(l1, `tenantId=${tenantId}&remoteId=${remote.id}`))).toEqual([a.id]);
      expect(idsOf(await queue(l1, `tenantId=${tenantId}&remoteId=${remote.id}&status=semua`))).toEqual(
        [a.id, b.id].sort(),
      );
      expect((await queue(l1, `tenantId=${tenantId}&remoteId=bukan-uuid`)).total).toBe(0);
    });

    it('categoryName: nama kategori tanpa membedakan huruf besar/kecil, di semua customer (T114)', async () => {
      const marker = randomUUID().slice(0, 6);
      const tenantA = await newTenant();
      const tenantB = await newTenant();
      const catA = await insertMasterValue(dataSource, 'kategori', tenantA, `Remote Down ${marker}`);
      const catB = await insertMasterValue(dataSource, 'kategori', tenantB, `remote down ${marker}`);
      const other = await insertMasterValue(dataSource, 'kategori', tenantA, `Corrective ${marker}`);
      const a = await insertTicket(dataSource, tenantA, { categoryId: catA.id });
      const b = await insertTicket(dataSource, tenantB, { categoryId: catB.id });
      await insertTicket(dataSource, tenantA, { categoryId: other.id });

      const byName = await queue(l1, `categoryName=${encodeURIComponent(`REMOTE DOWN ${marker}`)}`);
      expect(idsOf(byName)).toEqual([a.id, b.id].sort());
      expect(idsOf(await queue(l1, `categoryName=${encodeURIComponent(` remote down ${marker} `)}&tenantId=${tenantB}`))).toEqual([
        b.id,
      ]);
      // Nama persis, bukan pola atau potongan.
      expect((await queue(l1, `categoryName=${encodeURIComponent(`Remote Down ${marker.slice(0, 3)}`)}`)).total).toBe(0);
      expect((await queue(l1, `categoryName=${encodeURIComponent(`Remote_Down ${marker}`)}`)).total).toBe(0);
    });

    it('region: wilayah dari provinsi remote; ejaan dirapikan; tidak dikenal atau kosong = Lainnya (T113)', async () => {
      const tenantId = await newTenant();
      const ticketAt = async (province?: string) =>
        insertTicket(dataSource, tenantId, { remoteId: (await insertRemote(dataSource, tenantId, { province })).id });
      const sulsel = await ticketAt('Sulawesi Selatan');
      const sulteng = await ticketAt('Prov. Sulawesi Tengah');
      const sultra = await ticketAt('  SULTRA ');
      const jabar = await ticketAt('Jawa Barat');
      const diy = await ticketAt('D.I. Yogyakarta');
      const blank = await ticketAt();
      const unknown = await ticketAt('Atlantis');

      const region = async (name: string) =>
        idsOf(await queue(l1, `tenantId=${tenantId}&region=${encodeURIComponent(name)}`));
      expect(await region('Sulawesi')).toEqual([sulsel.id, sulteng.id, sultra.id].sort());
      expect(await region('Jawa')).toEqual([jabar.id, diy.id].sort());
      expect(await region('Lainnya')).toEqual([blank.id, unknown.id].sort());
      expect(await region('Papua')).toEqual([]);
      expect(remoteRegionOf('Prov. Sulawesi Tengah')).toBe('Sulawesi');
      expect(remoteRegionOf('Atlantis')).toBe('Lainnya');
    });

    it('createdFrom/createdTo: tanggal dibuat menurut WIB, kedua ujung termasuk (T109)', async () => {
      const tenantId = await newTenant();
      // 23:59:59 WIB tanggal 10 dan 00:00 WIB tanggal 11 (remote WIT: sudah tanggal 11 di sana).
      const remote = await insertRemote(dataSource, tenantId, { zone: 'WIT' });
      const late = await insertTicket(dataSource, tenantId, {
        remoteId: remote.id,
        createdAt: new Date('2026-03-10T16:59:59Z'),
      });
      const midnight = await insertTicket(dataSource, tenantId, {
        remoteId: remote.id,
        createdAt: new Date('2026-03-10T17:00:00Z'),
      });
      const created = async (range: string) => idsOf(await queue(l1, `tenantId=${tenantId}&${range}`));
      expect(await created('createdFrom=2026-03-10&createdTo=2026-03-10')).toEqual([late.id]);
      expect(await created('createdFrom=2026-03-11&createdTo=2026-03-11')).toEqual([midnight.id]);
      expect(await created('createdFrom=2026-03-10&createdTo=2026-03-11')).toEqual([late.id, midnight.id].sort());
      expect(await created('createdFrom=2026-03-11')).toEqual([midnight.id]);
      expect(await created('createdTo=2026-03-10')).toEqual([late.id]);
      expect(await created('createdFrom=2026-03-12')).toEqual([]);
    });

    it('closedFrom/closedTo: tanggal ditutup menurut WIB; memuat NPR Ditutup tanpa saringan status', async () => {
      const tenantId = await newTenant();
      const closed = await ticketIn(tenantId, 'ditutup');
      await ticketIn(tenantId, 'pulih');
      const today = await wibDate();
      const yesterday = await wibDate(-1);
      expect(idsOf(await queue(l1, `tenantId=${tenantId}&status=ditutup&closedFrom=${today}&closedTo=${today}`))).toEqual([
        closed.id,
      ]);
      expect(idsOf(await queue(l1, `tenantId=${tenantId}&closedFrom=${today}`))).toEqual([closed.id]);
      expect((await queue(l1, `tenantId=${tenantId}&closedTo=${yesterday}`)).total).toBe(0);
      expect((await queue(l1, `tenantId=${tenantId}&closedFrom=${await wibDate(1)}`)).total).toBe(0);
    });
  });

  describe('Ambil (penanggung)', () => {
    it('NPR Terbuka: penanggung menjadi saya dan status menjadi Dikerjakan, tercatat di linimasa (T81, T85)', async () => {
      const tenantId = await newTenant();
      const ticket = await ticketIn(tenantId, 'terbuka');
      const res = await l1.post(`/api/tickets/${ticket.id}/take`).send({ expectedAssigneeId: null }).expect(201);
      const body = res.body as TicketTimeline;
      expect(body.ticket).toMatchObject({ status: 'dikerjakan', assignee: { id: l1Id, name: l1Name, role: 'l1' } });
      expect(body.actions[0]).toMatchObject({
        kind: 'ambil',
        note: 'Mengambil NPR.',
        assignee: { id: l1Id, name: l1Name },
        assigneeFrom: null,
        statusChange: { from: 'terbuka', to: 'dikerjakan' },
        createdBy: { id: l1Id },
      });
    });

    it('mengambil alih dari orang lain: tercatat dari siapa; status selain Terbuka tidak berubah', async () => {
      const tenantId = await newTenant();
      const ticket = await ticketIn(tenantId, 'pending_customer');
      await l1.post(`/api/tickets/${ticket.id}/take`).send({ expectedAssigneeId: null }).expect(201);
      const res = await l2.post(`/api/tickets/${ticket.id}/take`).send({ expectedAssigneeId: l1Id }).expect(201);
      const body = res.body as TicketTimeline;
      expect(body.ticket).toMatchObject({ status: 'pending_customer', assignee: { id: l2Id } });
      expect(body.actions[0]).toMatchObject({
        kind: 'ambil',
        note: `Mengambil alih NPR dari ${l1Name}.`,
        assignee: { id: l2Id },
        assigneeFrom: { id: l1Id, name: l1Name },
        statusChange: null,
      });
    });

    it('penanggung yang terlihat sudah berganti → 409; sudah penanggung → 400; NPR Ditutup → 400', async () => {
      const tenantId = await newTenant();
      const ticket = await ticketIn(tenantId, 'dikerjakan');
      await l1.post(`/api/tickets/${ticket.id}/take`).send({ expectedAssigneeId: null }).expect(201);
      const stale = await l2.post(`/api/tickets/${ticket.id}/take`).send({ expectedAssigneeId: null }).expect(409);
      expect(stale.body.message).toBe(
        `NPR ini sudah diambil ${l1Name}. Muat ulang, lalu putuskan apakah tetap mengambil alih.`,
      );
      const again = await l1.post(`/api/tickets/${ticket.id}/take`).send({ expectedAssigneeId: l1Id }).expect(400);
      expect(again.body.message).toBe(ALREADY_ASSIGNEE_MESSAGE);

      const closed = await ticketIn(tenantId, 'ditutup');
      const res = await l1.post(`/api/tickets/${closed.id}/take`).send({ expectedAssigneeId: null }).expect(400);
      expect(res.body.message).toBe(TICKET_CLOSED_MESSAGE);

      await l1.post(`/api/tickets/${ticket.id}/take`).send({}).expect(400);
      await l1.post(`/api/tickets/${ticket.id}/take`).send({ expectedAssigneeId: 'x' }).expect(400);
      await l1.post(`/api/tickets/${randomUUID()}/take`).send({ expectedAssigneeId: null }).expect(404);
    });

    it('dua operator menekan Ambil bersamaan: tepat satu menjadi penanggung', async () => {
      const tenantId = await newTenant();
      const ticket = await ticketIn(tenantId, 'terbuka');
      const results = await Promise.all(
        [l1, l2, l1, l2].map((agent) =>
          agent.post(`/api/tickets/${ticket.id}/take`).send({ expectedAssigneeId: null }),
        ),
      );
      const statuses = results.map((res) => res.status).sort();
      expect(statuses.filter((status) => status === 201)).toHaveLength(1);
      expect(statuses.filter((status) => status === 201 || status === 409 || status === 400)).toHaveLength(4);
      const [count] = (await dataSource.query(
        `SELECT count(*)::int AS n FROM ticket_actions WHERE ticket_id = $1 AND kind = 'ambil'`,
        [ticket.id],
      )) as Array<{ n: number }>;
      expect(count?.n).toBe(1);
    });

    it('jenis ambil tidak bisa dikirim lewat tambah tindakan', async () => {
      const tenantId = await newTenant();
      const ticket = await ticketIn(tenantId, 'terbuka');
      await l1.post(`/api/tickets/${ticket.id}/actions`).send({ kind: 'ambil', note: 'x' }).expect(400);
    });

    it('database: penanggung tidak bisa di-UPDATE langsung; penanggung sebelumnya diisi database', async () => {
      const tenantId = await newTenant();
      const ticket = await ticketIn(tenantId, 'dikerjakan');
      await expect(
        operatorQuery(dataSource, 'UPDATE tickets SET assignee_id = $2 WHERE id = $1', [ticket.id, l1Id]),
      ).rejects.toThrow(/hanya berubah lewat linimasa/);

      await l1.post(`/api/tickets/${ticket.id}/take`).send({ expectedAssigneeId: null }).expect(201);
      // Penulis entri mengaku penanggung sebelumnya orang lain: database mengisi yang sebenarnya.
      const forged = (await insertUser(dataSource)).id;
      await operatorQuery(
        dataSource,
        `INSERT INTO ticket_actions (tenant_id, ticket_id, kind, note, occurred_at, assignee_id, assignee_from_id,
                                     created_by)
         SELECT tenant_id, id, 'ambil', 'Ambil alih', now(), $2, $3, $2 FROM tickets WHERE id = $1`,
        [ticket.id, l2Id, forged],
      );
      const [entry] = (await dataSource.query(
        `SELECT assignee_from_id FROM ticket_actions WHERE ticket_id = $1 AND kind = 'ambil' ORDER BY seq DESC LIMIT 1`,
        [ticket.id],
      )) as Array<{ assignee_from_id: string }>;
      expect(entry?.assignee_from_id).toBe(l1Id);

      await expect(
        operatorQuery(
          dataSource,
          `INSERT INTO ticket_actions (tenant_id, ticket_id, kind, note, occurred_at, assignee_id, created_by)
           SELECT tenant_id, id, 'ambil', 'Ambil lagi', now(), $2, $2 FROM tickets WHERE id = $1`,
          [ticket.id, l2Id],
        ),
      ).rejects.toThrow(/sudah penanggung/);
    });

    it('"Milik saya" mengikuti penanggung terakhir', async () => {
      const tenantId = await newTenant();
      const ticket = await ticketIn(tenantId, 'dikerjakan');
      await l1.post(`/api/tickets/${ticket.id}/take`).send({ expectedAssigneeId: null }).expect(201);
      expect((await queue(l1, `tenantId=${tenantId}&view=saya`)).total).toBe(1);
      await l2.post(`/api/tickets/${ticket.id}/take`).send({ expectedAssigneeId: l1Id }).expect(201);
      expect((await queue(l1, `tenantId=${tenantId}&view=saya`)).total).toBe(0);
      expect((await queue(l2, `tenantId=${tenantId}&view=saya`)).total).toBe(1);
    });
  });

  it('waktu baris dalam ISO UTC; mulai gangguan sebelum waktu dibuat', async () => {
    const tenantId = await newTenant();
    const ticket = await ticketIn(tenantId, 'terbuka');
    await startedMinutesBefore(ticket.id, 30);
    const [item] = (await queue(l1, `tenantId=${tenantId}`)).items;
    expect(new Date(item?.createdAt ?? '').getTime() - new Date(item?.startedAt ?? '').getTime()).toBe(30 * MINUTE);
  });
});
