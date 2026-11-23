import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  TICKET_CLOSE_CAUSES,
  TICKET_RESOLUTION_MAX_LENGTH,
  type RemoteTicketHistoryPage,
  type TicketTimeline,
  type TroubleTicketPage,
} from '@tyio/shared';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  CLOSE_FROM_PULIH_MESSAGE,
  CLOSE_OPEN_TT_MESSAGE,
  CLOSE_WITH_TT_ROLE_MESSAGE,
  TICKET_CLOSED_MESSAGE,
} from '../src/modules/tickets/actions/ticket-actions.service.js';
import {
  TICKET_CLOSED_FOR_TT_MESSAGE,
  TT_CLOSE_ROLE_MESSAGE,
  TT_CLOSED_FOR_COPY_MESSAGE,
  TT_CLOSED_MESSAGE,
} from '../src/modules/trouble-tickets/trouble-tickets.service.js';
import { createTestApp } from './create-test-app.js';
import {
  closeTroubleTicketDirect,
  insertRemote,
  insertTenant,
  insertTicket,
  insertTroubleTicket,
  insertUser,
  moveTicketDirect,
  operatorQuery,
  TEST_PASSWORD,
} from './fixtures.js';

// Aturan penutupan (langkah 1.6): L1 menutup NPR tanpa TT; NPR yang punya TT dan TT itu sendiri
// hanya L2/admin (K21, ditolak API dan database); penutupan NPR wajib penyebab dari daftar tetap
// dan penyelesaian (T98); NPR tidak bisa ditutup selama masih ada TT yang belum ditutup (T99);
// TT ditutup dengan hasil kunjungan / penyelesaian (T100); riwayat NPR di halaman remote (T101).

type Agent = ReturnType<typeof request.agent>;

const CLOSE_BODY = { cause: 'listrik', resolution: 'PLN menyalakan kembali listrik gedung; remote up 15:10' };

describe('penutupan NPR dan TT', () => {
  let app: NestExpressApplication;
  let dataSource: DataSource;
  let tenantId: string;
  let l1: Agent;
  let l1Id: string;
  let l2: Agent;
  let l2Id: string;
  let admin: Agent;

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
    tenantId = (await insertTenant(dataSource, 'Bank Tutup')).id;
    const login = async (role: 'l1' | 'l2' | 'admin', name: string) => {
      const user = await insertUser(dataSource, { role, name });
      const agent = request.agent(app.getHttpServer());
      await agent.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD }).expect(200);
      return { agent, id: user.id };
    };
    ({ agent: l1, id: l1Id } = await login('l1', 'Dewi Tutup'));
    ({ agent: l2, id: l2Id } = await login('l2', 'Arif Tutup'));
    ({ agent: admin } = await login('admin', 'Admin Tutup'));
  });

  afterAll(async () => {
    await app.close();
  });

  /** NPR baru di customer uji, sudah dipindah ke status tertentu (bawaan Pulih · siap ditutup). */
  async function ticketIn(status = 'pulih', remoteId?: string): Promise<{ id: string; number: string; remoteId: string }> {
    const ticket = await insertTicket(dataSource, tenantId, { remoteId });
    if (status !== 'terbuka') await moveTicketDirect(dataSource, ticket.id, status);
    return ticket;
  }

  async function row(ticketId: string) {
    const [found] = (await dataSource.query(
      'SELECT status, close_cause, resolution, closed_at, closed_by FROM tickets WHERE id = $1',
      [ticketId],
    )) as Array<{ status: string; close_cause: string | null; resolution: string | null; closed_at: Date | null; closed_by: string | null }>;
    return found;
  }

  async function ttRow(id: string) {
    const [found] = (await dataSource.query(
      'SELECT status, resolution, closed_at, closed_by FROM trouble_tickets WHERE id = $1',
      [id],
    )) as Array<{ status: string; resolution: string | null; closed_at: Date | null; closed_by: string | null }>;
    return found;
  }

  const close = (agent: Agent, ticketId: string, body: Record<string, unknown> = CLOSE_BODY) =>
    agent.post(`/api/tickets/${ticketId}/close`).send(body);
  const closeTt = (agent: Agent, ttId: string, body: Record<string, unknown> = { resolution: 'Modem diganti teknisi SD' }) =>
    agent.post(`/api/trouble-tickets/${ttId}/close`).send(body);

  describe('tutup NPR', () => {
    it('L1 menutup NPR tanpa TT dari Pulih: penyebab dan penyelesaian tersimpan di NPR dan linimasa', async () => {
      const ticket = await ticketIn();
      const res = await close(l1, ticket.id).expect(201);
      const body = res.body as TicketTimeline;
      expect(body.ticket.status).toBe('ditutup');
      expect(body.ticket.closure).toMatchObject({
        cause: 'listrik',
        resolution: CLOSE_BODY.resolution,
        closedBy: { id: l1Id, name: 'Dewi Tutup', role: 'l1' },
      });
      const entry = body.actions[0];
      expect(entry).toMatchObject({
        kind: 'tutup',
        note: CLOSE_BODY.resolution,
        closeCause: 'listrik',
        statusChange: { from: 'pulih', to: 'ditutup' },
        createdBy: { id: l1Id },
      });
      expect(body.ticket.closure?.closedAt).toBe(entry?.createdAt);
      expect(await row(ticket.id)).toMatchObject({ status: 'ditutup', close_cause: 'listrik', closed_by: l1Id });
    });

    it('setiap penyebab dari daftar tetap diterima (T98); spasi di penyelesaian dirapikan', async () => {
      for (const cause of TICKET_CLOSE_CAUSES) {
        const ticket = await ticketIn();
        const res = await close(l2, ticket.id, { cause, resolution: `  Selesai ${cause}  ` }).expect(201);
        expect((res.body as TicketTimeline).ticket.closure).toMatchObject({ cause, resolution: `Selesai ${cause}` });
      }
    });

    it('isian wajib dan tidak dikenal ditolak; status tetap Pulih', async () => {
      const ticket = await ticketIn();
      const cases: Array<[Record<string, unknown>, RegExp]> = [
        [{ resolution: 'x' }, /Pilih penyebab/],
        [{ cause: 'gempa', resolution: 'x' }, /Pilih penyebab/],
        [{ cause: 'Listrik', resolution: 'x' }, /Pilih penyebab/],
        [{ cause: 'listrik' }, /Penyelesaian wajib/],
        [{ cause: 'listrik', resolution: '   ' }, /Penyelesaian wajib/],
        [{ cause: 'listrik', resolution: 5 }, /Penyelesaian harus berupa teks/],
        [{ cause: 'listrik', resolution: 'x'.repeat(TICKET_RESOLUTION_MAX_LENGTH + 1) }, /paling panjang 2000/],
        [{ ...CLOSE_BODY, statusTo: 'ditutup' }, /tidak bisa diisi/],
      ];
      for (const [body, message] of cases) {
        const res = await close(l1, ticket.id, body).expect(400);
        expect(res.body.message).toMatch(message);
      }
      expect((await row(ticket.id))?.status).toBe('pulih');
    });

    it('hanya dari Pulih · siap ditutup; NPR Ditutup ditolak; NPR tidak ada → 404', async () => {
      for (const status of ['terbuka', 'dikerjakan', 'pending_tm', 'eskalasi_sd']) {
        const ticket = await ticketIn(status === 'pending_tm' ? 'dikerjakan' : status);
        if (status === 'pending_tm') {
          await operatorQuery(
            dataSource,
            `INSERT INTO ticket_actions (tenant_id, ticket_id, kind, note, occurred_at, status_from, status_to,
                                         pending_reason, created_by)
             SELECT tenant_id, id, 'catatan', 'x', now(), 'dikerjakan', 'pending_tm', 'Tunggu TM', created_by
               FROM tickets WHERE id = $1`,
            [ticket.id],
          );
        }
        const res = await close(l2, ticket.id).expect(400);
        expect(res.body.message).toBe(CLOSE_FROM_PULIH_MESSAGE);
        expect((await row(ticket.id))?.status).toBe(status);
      }
      const closed = await ticketIn();
      await close(l1, closed.id).expect(201);
      const again = await close(l2, closed.id).expect(400);
      expect(again.body.message).toBe(TICKET_CLOSED_MESSAGE);

      await close(l1, randomUUID()).expect(404);
      await close(l1, 'bukan-uuid').expect(404);
    });

    it('NPR yang punya TT, walau TT-nya sudah ditutup, hanya ditutup L2/admin (K21)', async () => {
      const ticket = await ticketIn();
      const tt = await insertTroubleTicket(dataSource, ticket.id);
      await closeTroubleTicketDirect(dataSource, tt.id, { closedBy: l2Id });

      const denied = await close(l1, ticket.id).expect(403);
      expect(denied.body.message).toBe(CLOSE_WITH_TT_ROLE_MESSAGE);
      expect(await row(ticket.id)).toMatchObject({ status: 'pulih', closed_at: null });

      const res = await close(l2, ticket.id).expect(201);
      expect((res.body as TicketTimeline).ticket.closure?.closedBy).toMatchObject({ id: l2Id, role: 'l2' });

      const other = await ticketIn();
      await closeTroubleTicketDirect(dataSource, (await insertTroubleTicket(dataSource, other.id)).id, { closedBy: l2Id });
      await close(admin, other.id).expect(201);
    });

    it('NPR dengan TT yang belum ditutup ditolak, pesannya menyebut TT itu saja (T99)', async () => {
      const ticket = await ticketIn();
      const done = await insertTroubleTicket(dataSource, ticket.id, 'TT pertama');
      const open1 = await insertTroubleTicket(dataSource, ticket.id, 'TT kedua');
      const open2 = await insertTroubleTicket(dataSource, ticket.id, 'TT ketiga');
      await closeTroubleTicketDirect(dataSource, done.id, { closedBy: l2Id });

      const res = await close(l2, ticket.id).expect(400);
      expect(res.body.message).toBe(`${CLOSE_OPEN_TT_MESSAGE} ${open1.number}, ${open2.number}.`);
      expect((await row(ticket.id))?.status).toBe('pulih');

      // L1 tetap mendapat penolakan peran, bukan daftar TT.
      expect((await close(l1, ticket.id).expect(403)).body.message).toBe(CLOSE_WITH_TT_ROLE_MESSAGE);

      await closeTt(l2, open1.id).expect(201);
      await closeTt(admin, open2.id).expect(201);
      await close(l2, ticket.id).expect(201);
    });

    it('buka kembali mengosongkan isian penutupan; entri tutup tetap di linimasa; bisa ditutup lagi', async () => {
      const ticket = await ticketIn();
      await close(l1, ticket.id).expect(201);
      const reopened = await l2
        .post(`/api/tickets/${ticket.id}/actions`)
        .send({ kind: 'catatan', note: 'Remote turun lagi', statusFrom: 'ditutup', statusTo: 'dikerjakan' })
        .expect(201);
      const body = reopened.body as TicketTimeline;
      expect(body.ticket.closure).toBeNull();
      expect(await row(ticket.id)).toMatchObject({ status: 'dikerjakan', close_cause: null, resolution: null, closed_at: null, closed_by: null });
      expect(body.actions.filter((action) => action.kind === 'tutup')).toHaveLength(1);

      await moveTicketDirect(dataSource, ticket.id, 'pulih');
      const closedAgain = await close(l1, ticket.id, { cause: 'perangkat', resolution: 'Adaptor diganti' }).expect(201);
      expect((closedAgain.body as TicketTimeline).ticket.closure).toMatchObject({ cause: 'perangkat', resolution: 'Adaptor diganti' });
      expect((closedAgain.body as TicketTimeline).actions.filter((action) => action.kind === 'tutup')).toHaveLength(2);
    });

    it('penutupan serentak dengan pembuatan TT: tidak pernah keduanya berhasil', async () => {
      for (let round = 0; round < 4; round += 1) {
        const ticket = await ticketIn();
        const [closed, created] = await Promise.all([
          close(l2, ticket.id),
          l1.post(`/api/tickets/${ticket.id}/trouble-tickets`).send({ problem: 'Modem mati' }),
        ]);
        expect([closed.status, created.status].sort()).toEqual([201, 400]);
        const [{ n }] = (await dataSource.query('SELECT count(*)::int AS n FROM trouble_tickets WHERE ticket_id = $1', [
          ticket.id,
        ])) as [{ n: number }];
        expect((await row(ticket.id))?.status).toBe(closed.status === 201 ? 'ditutup' : 'pulih');
        expect(n).toBe(closed.status === 201 ? 0 : 1);
        if (closed.status === 400) expect(closed.body.message).toMatch(CLOSE_OPEN_TT_MESSAGE);
        else expect(created.body.message).toBe(TICKET_CLOSED_FOR_TT_MESSAGE);
      }
    });

    it('serentak: 5 penutupan NPR yang sama → tepat 1 tersimpan', async () => {
      const ticket = await ticketIn();
      const results = await Promise.all([l1, l2, admin, l1, l2].map((agent) => close(agent, ticket.id)));
      expect(results.map((res) => res.status).sort()).toEqual([201, 400, 400, 400, 400]);
      const [{ n }] = (await dataSource.query(
        `SELECT count(*)::int AS n FROM ticket_actions WHERE ticket_id = $1 AND kind = 'tutup'`,
        [ticket.id],
      )) as [{ n: number }];
      expect(n).toBe(1);
    });

    describe('dijaga database', () => {
      const insertClose = (ticketId: string, kind: string, cause: string | null, by: string | null = null) =>
        operatorQuery(
          dataSource,
          `INSERT INTO ticket_actions (tenant_id, ticket_id, kind, note, occurred_at, status_from, status_to, close_cause,
                                       created_by)
           SELECT tenant_id, id, $2, 'Langsung', now(), 'pulih', 'ditutup', $3, coalesce($4::uuid, created_by)
             FROM tickets WHERE id = $1`,
          [ticketId, kind, cause, by],
        );

      it('ke Ditutup hanya lewat entri tutup dengan penyebab dari daftar', async () => {
        const ticket = await ticketIn();
        // Dengan perpindahan ke Ditutup, trigger lebih dulu mengisi NPR, jadi isian penutupan NPR
        // yang tidak lengkap (tickets_closure) bisa menolak lebih dulu dari CHECK entri itu sendiri.
        const eitherGuard = /ticket_actions_close"|tickets_closure/;
        await expect(insertClose(ticket.id, 'catatan', null)).rejects.toThrow(eitherGuard);
        await expect(insertClose(ticket.id, 'tutup', null)).rejects.toThrow(eitherGuard);
        await expect(insertClose(ticket.id, 'catatan', 'listrik')).rejects.toThrow(eitherGuard);
        await expect(insertClose(ticket.id, 'tutup', 'gempa')).rejects.toThrow(/close_cause_valid/);
        // Tanpa perpindahan status, hanya CHECK entri yang bisa menolak.
        for (const [kind, cause] of [
          ['tutup', 'listrik'],
          ['catatan', 'listrik'],
        ]) {
          await expect(
            operatorQuery(
              dataSource,
              `INSERT INTO ticket_actions (tenant_id, ticket_id, kind, note, occurred_at, close_cause, created_by)
               SELECT tenant_id, id, $2, 'x', now(), $3, created_by FROM tickets WHERE id = $1`,
              [ticket.id, kind, cause],
            ),
          ).rejects.toThrow(/ticket_actions_close"/);
        }
        expect((await row(ticket.id))?.status).toBe('pulih');
        await insertClose(ticket.id, 'tutup', 'cuaca');
        expect(await row(ticket.id)).toMatchObject({ status: 'ditutup', close_cause: 'cuaca', resolution: 'Langsung' });
      });

      it('NPR yang punya TT: penulis L1 ditolak (K21); TT yang belum ditutup ditolak (T99)', async () => {
        const ticket = await ticketIn();
        const tt = await insertTroubleTicket(dataSource, ticket.id);
        await expect(insertClose(ticket.id, 'tutup', 'link', l2Id)).rejects.toThrow(
          new RegExp(`masih punya TT yang belum ditutup: ${tt.number.replace(/\//g, '\\/')}`),
        );
        await closeTroubleTicketDirect(dataSource, tt.id, { closedBy: l2Id });
        // Pembuat NPR uji adalah L1.
        await expect(insertClose(ticket.id, 'tutup', 'link')).rejects.toThrow(/punya TT; hanya L2 atau admin/);
        await insertClose(ticket.id, 'tutup', 'link', l2Id);
        expect((await row(ticket.id))?.status).toBe('ditutup');
      });

      it('isian penutupan NPR tidak bisa diubah langsung', async () => {
        const ticket = await ticketIn();
        await close(l1, ticket.id).expect(201);
        for (const assignment of [
          `close_cause = 'cuaca'`,
          `resolution = 'Diubah diam-diam'`,
          'closed_at = now()',
          `closed_by = '${l2Id}'`,
        ]) {
          await expect(
            operatorQuery(dataSource, `UPDATE tickets SET ${assignment} WHERE id = $1`, [ticket.id]),
          ).rejects.toThrow(/hanya berubah lewat linimasa/);
        }
        expect(await row(ticket.id)).toMatchObject({ close_cause: 'listrik', resolution: CLOSE_BODY.resolution });
      });
    });
  });

  describe('tutup TT', () => {
    it('L2 menutup TT dengan hasil kunjungan: tercatat di linimasa NPR, status NPR tetap, hilang dari TT aktif', async () => {
      const ticket = await ticketIn('eskalasi_sd');
      const tt = await insertTroubleTicket(dataSource, ticket.id);
      const resolution = 'Teknisi SD tiba 14:05; modem VSAT diganti; remote up 14:40';
      const res = await closeTt(l2, tt.id, { resolution: `  ${resolution} ` }).expect(201);
      const body = res.body as TicketTimeline;
      expect(body.ticket.status).toBe('eskalasi_sd');
      expect(body.ticket.troubleTickets[0]).toMatchObject({
        id: tt.id,
        status: 'ditutup',
        closure: { resolution, closedBy: { id: l2Id, name: 'Arif Tutup', role: 'l2' } },
      });
      expect(body.actions[0]).toMatchObject({
        kind: 'tt_ditutup',
        note: resolution,
        troubleTicket: { id: tt.id, number: tt.number },
        statusChange: null,
        createdBy: { id: l2Id },
      });
      expect(await ttRow(tt.id)).toMatchObject({ status: 'ditutup', resolution, closed_by: l2Id });

      const active = (await l2.get(`/api/trouble-tickets?q=${encodeURIComponent(tt.number)}`).expect(200))
        .body as TroubleTicketPage;
      expect(active.items).toEqual([]);
    });

    it('L1 ditolak (K21); admin boleh; TT sudah ditutup → 400; isian salah → 400; tidak ada → 404', async () => {
      const ticket = await ticketIn('dikerjakan');
      const tt = await insertTroubleTicket(dataSource, ticket.id);
      const denied = await closeTt(l1, tt.id).expect(403);
      expect(denied.body.message).toBe(TT_CLOSE_ROLE_MESSAGE);
      expect((await ttRow(tt.id))?.status).toBe('menunggu_sd');

      for (const [body, message] of [
        [{}, /wajib diisi/],
        [{ resolution: '  ' }, /wajib diisi/],
        [{ resolution: 7 }, /berupa teks/],
        [{ resolution: 'x'.repeat(TICKET_RESOLUTION_MAX_LENGTH + 1) }, /paling panjang 2000/],
        [{ resolution: 'x', cause: 'listrik' }, /tidak bisa diisi/],
      ] as Array<[Record<string, unknown>, RegExp]>) {
        expect((await closeTt(l2, tt.id, body).expect(400)).body.message).toMatch(message);
      }

      await closeTt(admin, tt.id).expect(201);
      const again = await closeTt(l2, tt.id).expect(400);
      expect(again.body.message).toBe(TT_CLOSED_MESSAGE);

      await closeTt(l2, randomUUID()).expect(404);
      await closeTt(l2, 'bukan-uuid').expect(404);
    });

    it('ringkasan TT yang sudah ditutup tidak bisa disalin lagi; NPR tetap menerima tindakan', async () => {
      const ticket = await ticketIn('dikerjakan');
      const tt = await insertTroubleTicket(dataSource, ticket.id);
      await closeTt(l2, tt.id).expect(201);
      const res = await l1.post(`/api/trouble-tickets/${tt.id}/copied`).expect(400);
      expect(res.body.message).toBe(TT_CLOSED_FOR_COPY_MESSAGE);
      await l1.post(`/api/tickets/${ticket.id}/actions`).send({ kind: 'catatan', note: 'Masih dipantau' }).expect(201);
    });

    it('serentak: 4 penutupan TT yang sama → tepat 1 tersimpan', async () => {
      const ticket = await ticketIn('dikerjakan');
      const tt = await insertTroubleTicket(dataSource, ticket.id);
      const results = await Promise.all([l2, admin, l2, admin].map((agent) => closeTt(agent, tt.id)));
      expect(results.map((res) => res.status).sort()).toEqual([201, 400, 400, 400]);
      const [{ n }] = (await dataSource.query(
        `SELECT count(*)::int AS n FROM ticket_actions WHERE trouble_ticket_id = $1 AND kind = 'tt_ditutup'`,
        [tt.id],
      )) as [{ n: number }];
      expect(n).toBe(1);
    });

    describe('dijaga database', () => {
      const insertTtEntry = (ttId: string, kind: string, by: string) =>
        operatorQuery(
          dataSource,
          `INSERT INTO ticket_actions (tenant_id, ticket_id, kind, note, occurred_at, trouble_ticket_id, created_by)
           SELECT tenant_id, ticket_id, $2, 'Langsung', now(), id, $3 FROM trouble_tickets WHERE id = $1`,
          [ttId, kind, by],
        );

      it('penulis L1 ditolak; TT yang sudah ditutup tidak menerima entri salin atau tutup', async () => {
        const ticket = await ticketIn('dikerjakan');
        const tt = await insertTroubleTicket(dataSource, ticket.id);
        await expect(insertTtEntry(tt.id, 'tt_ditutup', l1Id)).rejects.toThrow(/hanya bisa ditutup L2 atau admin/);
        await insertTtEntry(tt.id, 'tt_ditutup', l2Id);
        expect(await ttRow(tt.id)).toMatchObject({ status: 'ditutup', resolution: 'Langsung', closed_by: l2Id });
        await expect(insertTtEntry(tt.id, 'tt_ditutup', l2Id)).rejects.toThrow(/sudah ditutup/);
        await expect(insertTtEntry(tt.id, 'tt_disalin', l1Id)).rejects.toThrow(/sudah ditutup/);
      });

      it('status dan isian penutupan TT tidak bisa diubah langsung; TT baru harus Menunggu SD', async () => {
        const ticket = await ticketIn('dikerjakan');
        const tt = await insertTroubleTicket(dataSource, ticket.id);
        await expect(
          operatorQuery(
            dataSource,
            `UPDATE trouble_tickets SET status = 'ditutup', resolution = 'x', closed_at = now(), closed_by = $2 WHERE id = $1`,
            [tt.id, l2Id],
          ),
        ).rejects.toThrow(/Status dan penutupan TT hanya berubah lewat linimasa/);
        await expect(
          operatorQuery(
            dataSource,
            `INSERT INTO trouble_tickets (tenant_id, ticket_id, remote_id, network_id, problem, status, resolution,
                                          closed_at, closed_by, created_by)
             SELECT tenant_id, id, remote_id, network_id, 'x', 'ditutup', 'x', now(), $2, created_by FROM tickets WHERE id = $1`,
            [ticket.id, l2Id],
          ),
        ).rejects.toThrow(/TT baru harus berstatus menunggu_sd/);
        await closeTt(l2, tt.id).expect(201);
        await expect(
          operatorQuery(dataSource, `UPDATE trouble_tickets SET resolution = 'Diubah diam-diam' WHERE id = $1`, [tt.id]),
        ).rejects.toThrow(/Status dan penutupan TT hanya berubah lewat linimasa/);
      });
    });
  });

  describe('riwayat NPR di halaman remote (T101)', () => {
    async function history(agent: Agent, remoteId: string, query = ''): Promise<RemoteTicketHistoryPage> {
      return (await agent.get(`/api/remotes/${remoteId}/tickets${query}`).expect(200)).body as RemoteTicketHistoryPage;
    }

    async function setStarted(ticketId: string, minutesAgo: number): Promise<void> {
      await operatorQuery(
        dataSource,
        `INSERT INTO ticket_actions (tenant_id, ticket_id, kind, note, occurred_at, corrects_id, started_at_correction,
                                     created_by)
         SELECT t.tenant_id, t.id, 'koreksi', 'Mulai gangguan dari log', now(), a.id,
                t.created_at - make_interval(mins => $2), t.created_by
           FROM tickets t JOIN ticket_actions a ON a.ticket_id = t.id AND a.kind = 'dibuat' WHERE t.id = $1`,
        [ticketId, minutesAgo],
      );
    }

    it('semua NPR remote itu, mulai gangguan terbaru dulu, dengan waktu pulih, penyebab, penyelesaian, dan TT', async () => {
      const remote = await insertRemote(dataSource, tenantId, { zone: 'WITA' });
      const elsewhere = await ticketIn('dikerjakan');

      const closed = await ticketIn('dikerjakan', remote.id);
      await setStarted(closed.id, 300);
      const tt = await insertTroubleTicket(dataSource, closed.id);
      await closeTroubleTicketDirect(dataSource, tt.id, { closedBy: l2Id });
      await moveTicketDirect(dataSource, closed.id, 'pulih');
      await close(l2, closed.id, { cause: 'perangkat', resolution: 'Modem diganti' }).expect(201);

      const running = await ticketIn('dikerjakan', remote.id);
      await setStarted(running.id, 10);
      const recovered = await ticketIn('dikerjakan', remote.id);
      await setStarted(recovered.id, 60);
      // Pulih, turun lagi, lalu pulih lagi: waktu pulih dari entri Pulih terakhir.
      await moveTicketDirect(dataSource, recovered.id, 'pulih');
      await moveTicketDirect(dataSource, recovered.id, 'dikerjakan');
      await operatorQuery(
        dataSource,
        `INSERT INTO ticket_actions (tenant_id, ticket_id, kind, note, occurred_at, status_from, status_to, created_by)
         SELECT tenant_id, id, 'catatan', 'Pulih lagi', now() - interval '5 minutes', 'dikerjakan', 'pulih', created_by
           FROM tickets WHERE id = $1`,
        [recovered.id],
      );
      // Pernah pulih lalu turun lagi: gangguan masih berjalan.
      const relapsed = await ticketIn('dikerjakan', remote.id);
      await setStarted(relapsed.id, 120);
      await moveTicketDirect(dataSource, relapsed.id, 'pulih');
      await moveTicketDirect(dataSource, relapsed.id, 'eskalasi_l2');

      const page = await history(l1, remote.id);
      expect(page.total).toBe(4);
      expect(page.items.map((item) => item.id)).toEqual([running.id, recovered.id, relapsed.id, closed.id]);
      expect(page.items.map((item) => item.id)).not.toContain(elsewhere.id);

      const [runningItem, recoveredItem, relapsedItem, closedItem] = page.items;
      expect(runningItem).toMatchObject({ status: 'dikerjakan', recoveredAt: null, closeCause: null, resolution: null, troubleTickets: [] });
      expect(relapsedItem).toMatchObject({ status: 'eskalasi_l2', recoveredAt: null });
      const [pulihLagi] = (await dataSource.query(
        `SELECT occurred_at FROM ticket_actions WHERE ticket_id = $1 AND note = 'Pulih lagi'`,
        [recovered.id],
      )) as Array<{ occurred_at: Date }>;
      expect(recoveredItem).toMatchObject({ status: 'pulih', recoveredAt: pulihLagi?.occurred_at.toISOString() });
      expect(closedItem).toMatchObject({
        number: closed.number,
        status: 'ditutup',
        closeCause: 'perangkat',
        resolution: 'Modem diganti',
        troubleTickets: [{ id: tt.id, number: tt.number, status: 'ditutup' }],
      });
      expect(closedItem?.recoveredAt).not.toBeNull();
      expect(closedItem?.closedAt).not.toBeNull();
      expect(typeof closedItem?.categoryName).toBe('string');
      expect(Date.parse(closedItem?.startedAt ?? '')).toBeLessThan(Date.parse(relapsedItem?.startedAt ?? ''));
    });

    it('halaman dan ukuran halaman; parameter salah → 400; remote tidak ada → 404', async () => {
      const remote = await insertRemote(dataSource, tenantId);
      const tickets = [];
      for (let index = 0; index < 3; index += 1) {
        const ticket = await ticketIn('terbuka', remote.id);
        await setStarted(ticket.id, 10 * (index + 1));
        tickets.push(ticket);
      }
      const first = await history(l1, remote.id, '?pageSize=2');
      expect(first).toMatchObject({ total: 3, page: 1, pageSize: 2 });
      expect(first.items.map((item) => item.id)).toEqual([tickets[0]?.id, tickets[1]?.id]);
      const second = await history(l1, remote.id, '?pageSize=2&page=2');
      expect(second.items.map((item) => item.id)).toEqual([tickets[2]?.id]);

      for (const query of ['?page=0', '?pageSize=51', '?pageSize=x', '?status=ditutup']) {
        await l1.get(`/api/remotes/${remote.id}/tickets${query}`).expect(400);
      }
      await l1.get(`/api/remotes/${randomUUID()}/tickets`).expect(404);
      await l1.get('/api/remotes/bukan-uuid/tickets').expect(404);
      expect((await history(l1, (await insertRemote(dataSource, tenantId)).id)).items).toEqual([]);
    });
  });
});
