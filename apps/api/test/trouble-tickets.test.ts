import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  type GlobalSearchResult,
  REMOTE_ZONE_IANA,
  type TicketDetail,
  type TicketQueuePage,
  type TicketTimeline,
  type TroubleTicketPage,
  TT_NUMBER_PATTERN,
} from '@npr/shared';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TICKET_CLOSED_FOR_TT_MESSAGE } from '../src/modules/trouble-tickets/trouble-tickets.service.js';
import { createTestApp } from './create-test-app.js';
import {
  CLOSE_CAUSE,
  CLOSE_KIND,
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

// TT ke Service Delivery (langkah 1.5b): nomor TT/JARKOM/CUSTOMER/TAHUN/BULAN/urut, TT di
// linimasa NPR yang sama, banyak TT per NPR, status NPR tetap (T90), semua peran (T91),
// kontak disimpan di TT (T92), daftar TT aktif, salin ringkasan tercatat (K25).

type Agent = ReturnType<typeof request.agent>;

describe('TT ke SD', () => {
  let app: NestExpressApplication;
  let dataSource: DataSource;
  let l1: Agent;
  let l1Name: string;
  let l2: Agent;
  let admin: Agent;

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
    const login = async (role: 'l1' | 'l2' | 'admin', name: string) => {
      const user = await insertUser(dataSource, { role, name });
      const agent = request.agent(app.getHttpServer());
      await agent.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD }).expect(200);
      return agent;
    };
    l1Name = `Dewi ${randomUUID().slice(0, 4)}`;
    l1 = await login('l1', l1Name);
    l2 = await login('l2', 'Arif');
    admin = await login('admin', 'Admin');
  });

  afterAll(async () => {
    await app.close();
  });

  /** Customer baru (penghitung mulai dari nol) dengan remote WITA berkontak. */
  async function newTicket(): Promise<{ id: string; number: string; tenant: { id: string; code: string; name: string }; networkCode: string; remoteCode: string }> {
    const tenant = await insertTenant(dataSource, `Bank TT ${randomUUID().slice(0, 6)}`);
    const network = await insertMasterValue(dataSource, 'jarkom', tenant.id, 'VSAT');
    const remote = await insertRemote(dataSource, tenant.id, { networkId: network.id, zone: 'WITA', name: 'ATM KCP Pasar Sentral' });
    await operatorQuery(
      dataSource,
      `UPDATE remotes SET address = 'Jl. Sulawesi No. 12', city = 'Makassar',
              contacts = '[{"name":"Hendra","role":"Kepala Unit","phone":"+62 811-0000-0217"}]'::jsonb WHERE id = $1`,
      [remote.id],
    );
    const ticket = await insertTicket(dataSource, tenant.id, { remoteId: remote.id });
    return { ...ticket, tenant, networkCode: network.code ?? '', remoteCode: remote.code };
  }

  const create = (agent: Agent, ticketId: string, body: Record<string, unknown>) =>
    agent.post(`/api/tickets/${ticketId}/trouble-tickets`).send(body);

  async function period(ttId: string): Promise<string> {
    const [row] = (await dataSource.query(
      `SELECT to_char(created_at AT TIME ZONE $2, 'YYYY/MM') AS p FROM trouble_tickets WHERE id = $1`,
      [ttId, REMOTE_ZONE_IANA.WITA],
    )) as Array<{ p: string }>;
    return row?.p ?? '';
  }

  async function statusOf(ticketId: string): Promise<string> {
    const [row] = (await dataSource.query('SELECT status FROM tickets WHERE id = $1', [ticketId])) as Array<{
      status: string;
    }>;
    return row?.status ?? '';
  }

  async function close(ticketId: string): Promise<void> {
    for (const [from, to] of [
      ['terbuka', 'pulih'],
      ['pulih', 'ditutup'],
    ]) {
      await operatorQuery(
        dataSource,
        `INSERT INTO ticket_actions (tenant_id, ticket_id, kind, note, occurred_at, status_from, status_to, close_cause,
                                     created_by)
         SELECT tenant_id, id, ${CLOSE_KIND}, 'x', now(), $2, $3, ${CLOSE_CAUSE}, created_by FROM tickets WHERE id = $1`,
        [ticketId, from, to],
      );
    }
  }

  describe('buat TT', () => {
    it('nomor TT dari jarkom, customer, bulan zona remote; TT di NPR dan linimasanya; status NPR tetap (T90)', async () => {
      const ticket = await newTicket();
      const res = await create(l1, ticket.id, {
        problem: '  Modem VSAT tidak sinkron (Rx lock hilang)  ',
        contact: ' Hendra, Kepala Unit · +62 811-0000-0217 ',
      }).expect(201);
      const body = res.body as TicketTimeline;
      const [tt] = body.ticket.troubleTickets;
      expect(tt?.number).toBe(`TT/${ticket.networkCode}/${ticket.tenant.code}/${await period(tt?.id ?? '')}/0001`);
      expect(tt?.number).toMatch(TT_NUMBER_PATTERN);
      expect(tt).toMatchObject({
        status: 'menunggu_sd',
        problem: 'Modem VSAT tidak sinkron (Rx lock hilang)',
        contact: 'Hendra, Kepala Unit · +62 811-0000-0217',
        createdBy: { name: l1Name },
        copiedCount: 0,
        lastCopiedAt: null,
      });
      expect(body.ticket.status).toBe('terbuka');
      expect(await statusOf(ticket.id)).toBe('terbuka');
      expect(body.actions[0]).toMatchObject({
        kind: 'tt_dibuat',
        note: `${tt?.number} dibuat untuk SD. Modem VSAT tidak sinkron (Rx lock hilang)`,
        troubleTicket: { id: tt?.id, number: tt?.number },
        statusChange: null,
        createdBy: { name: l1Name },
      });
    });

    it('ringkasan siap tempel: no. TT dan NPR, remote, lokasi dan zona, problem, kontak (K25)', async () => {
      const ticket = await newTicket();
      const res = await create(l1, ticket.id, { problem: 'Cek BUC/LNB', contact: 'Hendra · 0811' }).expect(201);
      const [tt] = (res.body as TicketTimeline).ticket.troubleTickets;
      expect(tt?.summary).toBe(
        [
          `${tt?.number} (${ticket.number})`,
          `Remote: ATM KCP Pasar Sentral, ${ticket.tenant.name} (${ticket.remoteCode})`,
          'Lokasi: Jl. Sulawesi No. 12, Makassar · WITA',
          'Problem: Cek BUC/LNB',
          'Kontak: Hendra · 0811',
        ].join('\n'),
      );
      const noContact = await create(l1, ticket.id, { problem: 'Kabel IFL' }).expect(201);
      const second = (noContact.body as TicketTimeline).ticket.troubleTickets[1];
      expect(second?.contact).toBeNull();
      expect(second?.summary.split('\n').at(-1)).toBe('Kontak: belum ada');
    });

    it('satu NPR banyak TT; urut lanjut; penghitung NPR terpisah', async () => {
      const ticket = await newTicket();
      for (const problem of ['Satu', 'Dua', 'Tiga']) await create(l2, ticket.id, { problem }).expect(201);
      const detail = (await l1.get(`/api/tickets/${ticket.id}`).expect(200)).body as TicketDetail;
      expect(detail.troubleTickets.map((tt) => tt.number.split('/')[5])).toEqual(['0001', '0002', '0003']);
      expect(detail.troubleTickets.map((tt) => tt.problem)).toEqual(['Satu', 'Dua', 'Tiga']);
      expect(ticket.number.split('/')[5]).toBe('0001');
    });

    it('semua peran boleh membuat TT (T91)', async () => {
      const ticket = await newTicket();
      for (const agent of [l1, l2, admin]) await create(agent, ticket.id, { problem: 'Kunjungan' }).expect(201);
    });

    it('TT serentak untuk NPR yang sama: nomor berurutan tanpa bentrok', async () => {
      const ticket = await newTicket();
      const results = await Promise.all(
        Array.from({ length: 6 }, (_, index) => create(index % 2 ? l1 : l2, ticket.id, { problem: `TT ${index}` })),
      );
      expect(results.map((res) => res.status)).toEqual(Array(6).fill(201));
      const rows = (await dataSource.query('SELECT number FROM trouble_tickets WHERE ticket_id = $1 ORDER BY number', [
        ticket.id,
      ])) as Array<{ number: string }>;
      expect(rows.map((row) => row.number.split('/')[5])).toEqual(['0001', '0002', '0003', '0004', '0005', '0006']);
    });

    it('isian salah ditolak; nomor dan NPR tidak bisa diisi dari permintaan', async () => {
      const ticket = await newTicket();
      const cases: Array<[Record<string, unknown>, string | RegExp]> = [
        [{}, 'Problem jarkom wajib diisi.'],
        [{ problem: '   ' }, 'Problem jarkom wajib diisi.'],
        [{ problem: 'x'.repeat(2001) }, 'Problem jarkom paling panjang 2000 karakter.'],
        [{ problem: 'x', contact: 'y'.repeat(301) }, 'Kontak di lokasi paling panjang 300 karakter.'],
        [{ problem: 'x', contact: 5 }, 'Kontak di lokasi harus berupa teks.'],
        [{ problem: 'x', number: 'TT/VSAT/BNA/2026/11/0001' }, /tidak bisa diisi atau diubah: number/],
        [{ problem: 'x', ticketId: randomUUID() }, /tidak bisa diisi atau diubah: ticketId/],
      ];
      for (const [body, message] of cases) {
        const res = await create(l1, ticket.id, body).expect(400);
        expect(res.body.message).toEqual(typeof message === 'string' ? message : expect.stringMatching(message));
      }
      await create(l1, randomUUID(), { problem: 'x' }).expect(404);
      await create(l1, 'bukan-uuid', { problem: 'x' }).expect(404);
    });

    it('NPR Ditutup: TT ditolak, juga bila ditulis langsung', async () => {
      const ticket = await newTicket();
      await close(ticket.id);
      const res = await create(l2, ticket.id, { problem: 'Terlambat' }).expect(400);
      expect(res.body.message).toBe(TICKET_CLOSED_FOR_TT_MESSAGE);
      await expect(insertTroubleTicket(dataSource, ticket.id)).rejects.toThrow(/TT tidak bisa dibuat/);
    });
  });

  describe('database', () => {
    it('remote dan jarkom TT selalu dari NPR, walau penulis mengisi yang lain', async () => {
      const ticket = await newTicket();
      const otherRemote = await insertRemote(dataSource, ticket.tenant.id);
      const [row] = (await operatorQuery(
        dataSource,
        `INSERT INTO trouble_tickets (tenant_id, ticket_id, remote_id, network_id, problem, created_by)
         SELECT tenant_id, id, $2, $3, 'Palsu', created_by FROM tickets WHERE id = $1 RETURNING remote_id, number`,
        [ticket.id, otherRemote.id, otherRemote.networkId],
      )) as Array<{ remote_id: string; number: string }>;
      const [npr] = (await dataSource.query('SELECT remote_id FROM tickets WHERE id = $1', [ticket.id])) as Array<{
        remote_id: string;
      }>;
      expect(row?.remote_id).toBe(npr?.remote_id);
      expect(row?.number.split('/')[1]).toBe(ticket.networkCode);
    });

    it('nomor, problem, kontak, dan NPR TT tidak bisa diubah; TT dengan linimasa tidak bisa dihapus', async () => {
      const ticket = await newTicket();
      const tt = await insertTroubleTicket(dataSource, ticket.id);
      for (const assignment of [`number = 'TT/X/Y/2026/11/0001'`, `problem = 'Lain'`, `contact = 'Lain'`]) {
        await expect(
          operatorQuery(dataSource, `UPDATE trouble_tickets SET ${assignment} WHERE id = $1`, [tt.id]),
        ).rejects.toThrow(/tidak bisa diubah/);
      }
      await expect(operatorQuery(dataSource, 'DELETE FROM trouble_tickets WHERE id = $1', [tt.id])).rejects.toThrow(
        /ticket_actions_trouble_ticket_same_ticket/,
      );
    });

    it('entri TT di linimasa wajib merujuk TT NPR yang sama', async () => {
      const ticket = await newTicket();
      const other = await newTicket();
      const otherTt = await insertTroubleTicket(dataSource, other.id);
      await expect(
        operatorQuery(
          dataSource,
          `INSERT INTO ticket_actions (tenant_id, ticket_id, kind, note, occurred_at, trouble_ticket_id, created_by)
           SELECT tenant_id, id, 'tt_disalin', 'x', now(), $2, created_by FROM tickets WHERE id = $1`,
          [ticket.id, otherTt.id],
        ),
      ).rejects.toThrow(/ticket_actions_trouble_ticket_same_ticket|ticket_actions_ticket_same_tenant/);
    });
  });

  describe('salin ringkasan (K25)', () => {
    it('setiap salin tercatat di linimasa NPR; jumlah dan waktu terakhir tampil di TT', async () => {
      const ticket = await newTicket();
      const tt = await insertTroubleTicket(dataSource, ticket.id);
      const first = await l1.post(`/api/trouble-tickets/${tt.id}/copied`).expect(200);
      expect(first.body).toMatchObject({ copiedCount: 1 });
      await l2.post(`/api/trouble-tickets/${tt.id}/copied`).expect(200);

      const detail = (await l1.get(`/api/tickets/${ticket.id}`).expect(200)).body as TicketDetail;
      expect(detail.troubleTickets[0]).toMatchObject({ copiedCount: 2, lastCopiedAt: expect.any(String) });
      const actions = (await l1.get(`/api/tickets/${ticket.id}/actions`).expect(200)).body as TicketTimeline['actions'];
      const copies = actions.filter((action) => action.kind === 'tt_disalin');
      expect(copies).toHaveLength(2);
      expect(copies[1]).toMatchObject({
        note: `Ringkasan TT disalin untuk SD: ${tt.number}.`,
        troubleTicket: { id: tt.id, number: tt.number },
        createdBy: { name: l1Name },
      });
    });

    it('TT tidak ada → 404; NPR Ditutup → 400', async () => {
      await l1.post(`/api/trouble-tickets/${randomUUID()}/copied`).expect(404);
      await l1.post('/api/trouble-tickets/x/copied').expect(404);
      const ticket = await newTicket();
      const tt = await insertTroubleTicket(dataSource, ticket.id);
      // NPR dengan TT hanya ditutup L2 setelah TT-nya ditutup (K21, T99).
      const closer = await insertUser(dataSource, { role: 'l2' });
      await closeTroubleTicketDirect(dataSource, tt.id, { closedBy: closer.id });
      await closeTicketDirect(dataSource, ticket.id, { closedBy: closer.id });
      const res = await l1.post(`/api/trouble-tickets/${tt.id}/copied`).expect(400);
      expect(res.body.message).toBe(TICKET_CLOSED_FOR_TT_MESSAGE);
    });

    it('entri sistem TT tidak bisa dikirim lewat tambah tindakan', async () => {
      const ticket = await newTicket();
      for (const kind of ['tt_dibuat', 'tt_disalin', 'ambil', 'dibuat']) {
        await l1.post(`/api/tickets/${ticket.id}/actions`).send({ kind, note: 'x' }).expect(400);
      }
    });
  });

  describe('daftar TT aktif dan pencarian', () => {
    it('TT aktif terlama dulu, dengan NPR, remote, customer, dan jumlah salin; saringan dan halaman', async () => {
      const a = await newTicket();
      const ttA = await insertTroubleTicket(dataSource, a.id, 'Pertama');
      const ttB = await insertTroubleTicket(dataSource, a.id, 'Kedua');
      await l1.post(`/api/trouble-tickets/${ttB.id}/copied`).expect(200);

      const page = (await l1.get(`/api/trouble-tickets?tenantId=${a.tenant.id}`).expect(200)).body as TroubleTicketPage;
      expect(page.total).toBe(2);
      expect(page.items.map((item) => item.id)).toEqual([ttA.id, ttB.id]);
      expect(page.items[1]).toMatchObject({
        number: ttB.number,
        status: 'menunggu_sd',
        ticket: { id: a.id, number: a.number },
        customerName: a.tenant.name,
        remote: { code: a.remoteCode, name: 'ATM KCP Pasar Sentral', city: 'Makassar', zone: 'WITA' },
        problem: 'Kedua',
        copiedCount: 1,
      });

      const second = (await l1.get(`/api/trouble-tickets?tenantId=${a.tenant.id}&pageSize=1&page=2`).expect(200))
        .body as TroubleTicketPage;
      expect(second.items.map((item) => item.id)).toEqual([ttB.id]);
      for (const q of [ttA.number, a.number, a.remoteCode.toLowerCase(), 'pasar sentral']) {
        const found = (await l1.get(`/api/trouble-tickets?tenantId=${a.tenant.id}&q=${encodeURIComponent(q)}`).expect(200))
          .body as TroubleTicketPage;
        expect(found.total).toBeGreaterThanOrEqual(1);
      }
      await l1.get('/api/trouble-tickets?status=aktif').expect(400);
      await l1.get('/api/trouble-tickets?pageSize=101').expect(400);
    });

    it('nomor TT ditemukan di pencarian global dan di kata kunci antrean NPR', async () => {
      const ticket = await newTicket();
      const tt = await insertTroubleTicket(dataSource, ticket.id);
      const result = (await l1.get(`/api/search?q=${encodeURIComponent(tt.number)}`).expect(200)).body as GlobalSearchResult;
      expect(result.troubleTickets).toEqual([
        expect.objectContaining({ id: tt.id, number: tt.number, ticketId: ticket.id, ticketNumber: ticket.number }),
      ]);
      const queue = (await l1.get(`/api/tickets?q=${encodeURIComponent(tt.number)}`).expect(200)).body as TicketQueuePage;
      expect(queue.items.map((item) => item.id)).toEqual([ticket.id]);
    });
  });
});
