import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  isTicketTransitionAllowed,
  OPEN_TICKET_STATUSES,
  selectableNextStatuses,
  TICKET_STATUSES,
  type TicketAction,
  type TicketStatus,
  type TicketTimeline,
} from '@tyio/shared';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  CLOSE_NOT_YET_MESSAGE,
  REOPEN_ROLE_MESSAGE,
  TICKET_CLOSED_MESSAGE,
} from '../src/modules/tickets/actions/ticket-actions.service.js';
import { createTestApp } from './create-test-app.js';
import { insertTenant, insertTicket, insertUser, operatorQuery, TEST_PASSWORD } from './fixtures.js';

// Mesin status NPR (langkah 1.4): delapan status (T63), perpindahan bebas antar status
// aktif kecuali kembali ke Terbuka, Ditutup hanya dari Pulih (T64), semua peran memindahkan
// eskalasi (T65), buka kembali hanya L2/admin (T66), pending wajib alasan (T68), penutupan
// lewat API menyusul di 1.6 (T69). Status hanya berubah lewat entri linimasa.

type Agent = ReturnType<typeof request.agent>;

/** Jalan dari Terbuka ke setiap status, lewat perpindahan yang sah. */
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

const pendingReason = (status: TicketStatus) =>
  status === 'pending_customer' || status === 'pending_tm' ? 'Menunggu konfirmasi PIC' : null;

describe('mesin status NPR', () => {
  let app: NestExpressApplication;
  let dataSource: DataSource;
  let tenantId: string;
  let l1: Agent;
  let l2: Agent;
  let admin: Agent;

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
    tenantId = (await insertTenant(dataSource, 'Bank Status')).id;
    const login = async (role: 'admin' | 'l1' | 'l2') => {
      const user = await insertUser(dataSource, { role, name: `Operator ${role}` });
      const agent = request.agent(app.getHttpServer());
      await agent.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD }).expect(200);
      return agent;
    };
    l1 = await login('l1');
    l2 = await login('l2');
    admin = await login('admin');
  });

  afterAll(async () => {
    await app.close();
  });

  /** NPR baru yang dipindah langsung di database (seperti operator) ke status tertentu. */
  async function ticketIn(status: TicketStatus): Promise<string> {
    const ticket = await insertTicket(dataSource, tenantId);
    let from: TicketStatus = 'terbuka';
    for (const to of PATH_TO[status]) {
      await insertStatusAction(ticket.id, from, to);
      from = to;
    }
    return ticket.id;
  }

  function insertStatusAction(ticketId: string, from: TicketStatus, to: TicketStatus): Promise<unknown> {
    return operatorQuery(
      dataSource,
      `INSERT INTO ticket_actions (tenant_id, ticket_id, kind, note, occurred_at, status_from, status_to,
                                   pending_reason, created_by)
       SELECT tenant_id, id, 'catatan', 'Pindah status', now(), $2, $3, $4, created_by FROM tickets WHERE id = $1`,
      [ticketId, from, to, pendingReason(to)],
    );
  }

  async function statusOf(ticketId: string): Promise<TicketStatus> {
    const [row] = (await dataSource.query('SELECT status FROM tickets WHERE id = $1', [ticketId])) as Array<{
      status: TicketStatus;
    }>;
    if (!row) throw new Error('NPR uji tidak ada.');
    return row.status;
  }

  const move = (agent: Agent, ticketId: string, from: TicketStatus, to: TicketStatus, extra: object = {}) =>
    agent
      .post(`/api/tickets/${ticketId}/actions`)
      .send({ kind: 'catatan', note: `Ke ${to}`, statusFrom: from, statusTo: to, pendingReason: pendingReason(to) ?? undefined, ...extra });

  describe('tabel perpindahan', () => {
    it('aturan di database sama dengan @tyio/shared untuk semua 64 pasangan status', async () => {
      const rows = (await dataSource.query(
        `SELECT f AS "from", t AS "to", ticket_status_transition_allowed(f, t) AS allowed
           FROM unnest($1::text[]) f CROSS JOIN unnest($1::text[]) t`,
        [[...TICKET_STATUSES]],
      )) as Array<{ from: TicketStatus; to: TicketStatus; allowed: boolean }>;
      expect(rows).toHaveLength(64);
      const mismatched = rows.filter((row) => row.allowed !== isTicketTransitionAllowed(row.from, row.to));
      expect(mismatched).toEqual([]);
    });

    it('aturan T64/T66: antar aktif bebas kecuali ke Terbuka, Ditutup hanya dari Pulih, dari Ditutup hanya ke Dikerjakan', () => {
      const allowed = TICKET_STATUSES.flatMap((from) =>
        TICKET_STATUSES.filter((to) => isTicketTransitionAllowed(from, to)).map((to) => `${from}>${to}`),
      );
      const active = OPEN_TICKET_STATUSES;
      const expected = [
        ...active.flatMap((from) =>
          active.filter((to) => to !== from && to !== 'terbuka').map((to) => `${from}>${to}`),
        ),
        'pulih>ditutup',
        'ditutup>dikerjakan',
      ];
      expect(allowed.sort()).toEqual(expected.sort());
      // Layar 1.4 tidak menawarkan Ditutup (T69).
      expect(selectableNextStatuses('pulih')).not.toContain('ditutup');
      expect(selectableNextStatuses('ditutup')).toEqual(['dikerjakan']);
    });

    // Setiap pasangan lewat API: sah → 201 dan status berubah; tidak sah → ditolak, status tetap.
    const pairs = TICKET_STATUSES.flatMap((from) => TICKET_STATUSES.map((to) => [from, to] as const));
    it.for(pairs)('API %s → %s', async ([from, to]) => {
      const ticketId = await ticketIn(from);
      const res = await move(l2, ticketId, from, to);
      if (to === 'ditutup') {
        expect(res.status).toBe(400);
        expect(res.body.message).toBe(CLOSE_NOT_YET_MESSAGE);
        expect(await statusOf(ticketId)).toBe(from);
      } else if (isTicketTransitionAllowed(from, to)) {
        expect(res.status).toBe(201);
        expect((res.body as TicketTimeline).ticket.status).toBe(to);
        expect(await statusOf(ticketId)).toBe(to);
      } else {
        expect(res.status).toBe(400);
        expect(await statusOf(ticketId)).toBe(from);
      }
    });

    it.for(pairs.filter(([from, to]) => !isTicketTransitionAllowed(from, to)))(
      'database menolak %s → %s walau ditulis langsung',
      async ([from, to]) => {
        const ticketId = await ticketIn(from);
        await expect(insertStatusAction(ticketId, from, to)).rejects.toThrow(
          from === 'ditutup' ? /sudah ditutup|tidak sah/ : /tidak sah/,
        );
        expect(await statusOf(ticketId)).toBe(from);
      },
    );
  });

  describe('peran', () => {
    it('L1 memindahkan ke dan dari eskalasi L2 maupun SD (T65)', async () => {
      const ticketId = await ticketIn('dikerjakan');
      await move(l1, ticketId, 'dikerjakan', 'eskalasi_l2').expect(201);
      await move(l1, ticketId, 'eskalasi_l2', 'eskalasi_sd').expect(201);
      await move(l1, ticketId, 'eskalasi_sd', 'dikerjakan').expect(201);
      expect(await statusOf(ticketId)).toBe('dikerjakan');
    });

    it('membuka kembali NPR Ditutup: L1 ditolak 403, L2 dan admin boleh, status menjadi Dikerjakan (T66)', async () => {
      const ticketId = await ticketIn('ditutup');
      const denied = await move(l1, ticketId, 'ditutup', 'dikerjakan').expect(403);
      expect(denied.body.message).toBe(REOPEN_ROLE_MESSAGE);
      expect(await statusOf(ticketId)).toBe('ditutup');

      const reopened = await move(l2, ticketId, 'ditutup', 'dikerjakan', { note: 'Gangguan muncul lagi' }).expect(201);
      const [entry] = (reopened.body as TicketTimeline).actions;
      expect(entry).toMatchObject({ note: 'Gangguan muncul lagi', statusChange: { from: 'ditutup', to: 'dikerjakan' } });

      const other = await ticketIn('ditutup');
      await move(admin, other, 'ditutup', 'dikerjakan').expect(201);
      expect(await statusOf(other)).toBe('dikerjakan');
    });

    it('NPR Ditutup tidak menerima tindakan lain sebelum dibuka kembali, oleh peran apa pun', async () => {
      const ticketId = await ticketIn('ditutup');
      for (const agent of [l1, l2, admin]) {
        const res = await agent
          .post(`/api/tickets/${ticketId}/actions`)
          .send({ kind: 'catatan', note: 'Catatan sesudah ditutup' })
          .expect(400);
        expect(res.body.message).toBe(TICKET_CLOSED_MESSAGE);
      }
      await expect(
        operatorQuery(
          dataSource,
          `INSERT INTO ticket_actions (tenant_id, ticket_id, kind, note, occurred_at, created_by)
           SELECT tenant_id, id, 'catatan', 'Langsung', now(), created_by FROM tickets WHERE id = $1`,
          [ticketId],
        ),
      ).rejects.toThrow(/sudah ditutup/);
    });

    it('tidak ada peran yang bisa menutup NPR lewat API di langkah ini (T69)', async () => {
      for (const agent of [l1, l2, admin]) {
        const ticketId = await ticketIn('pulih');
        const res = await move(agent, ticketId, 'pulih', 'ditutup').expect(400);
        expect(res.body.message).toBe(CLOSE_NOT_YET_MESSAGE);
      }
    });
  });

  describe('pending', () => {
    it('pending wajib alasan; pihak yang ditunggu ada di status (T68)', async () => {
      const ticketId = await ticketIn('dikerjakan');
      const missing = await l1
        .post(`/api/tickets/${ticketId}/actions`)
        .send({ kind: 'hubungi_customer', note: 'Minta cek listrik', statusFrom: 'dikerjakan', statusTo: 'pending_customer' })
        .expect(400);
      expect(missing.body.message).toBe('Alasan pending wajib diisi.');
      const blank = await l1
        .post(`/api/tickets/${ticketId}/actions`)
        .send({ kind: 'catatan', note: 'x', statusFrom: 'dikerjakan', statusTo: 'pending_tm', pendingReason: '   ' })
        .expect(400);
      expect(blank.body.message).toBe('Alasan pending wajib diisi.');

      const res = await l1
        .post(`/api/tickets/${ticketId}/actions`)
        .send({
          kind: 'hubungi_customer',
          note: 'PIC cabang diminta menyalakan ulang modem',
          statusFrom: 'dikerjakan',
          statusTo: 'pending_customer',
          pendingReason: '  Menunggu PIC tiba di lokasi  ',
        })
        .expect(201);
      const [entry] = (res.body as TicketTimeline).actions;
      expect(entry).toMatchObject({
        kind: 'hubungi_customer',
        pendingReason: 'Menunggu PIC tiba di lokasi',
        statusChange: { from: 'dikerjakan', to: 'pending_customer' },
      });
    });

    it('alasan pending tanpa status pending ditolak; database juga menolaknya', async () => {
      const ticketId = await ticketIn('dikerjakan');
      const res = await l1
        .post(`/api/tickets/${ticketId}/actions`)
        .send({ kind: 'catatan', note: 'x', statusFrom: 'dikerjakan', statusTo: 'pulih', pendingReason: 'Tidak perlu' })
        .expect(400);
      expect(res.body.message).toBe('Alasan pending hanya diisi bila status menjadi pending.');
      await expect(
        operatorQuery(
          dataSource,
          `INSERT INTO ticket_actions (tenant_id, ticket_id, kind, note, occurred_at, status_from, status_to, created_by)
           SELECT tenant_id, id, 'catatan', 'x', now(), 'dikerjakan', 'pending_tm', created_by FROM tickets WHERE id = $1`,
          [ticketId],
        ),
      ).rejects.toThrow(/ticket_actions_pending_reason/);
    });
  });

  describe('tabrakan', () => {
    it('status yang dilihat operator sudah usang → 409, tidak ada yang tersimpan', async () => {
      const ticketId = await ticketIn('dikerjakan');
      const before = await countActions(ticketId);
      const res = await move(l1, ticketId, 'terbuka', 'pulih').expect(409);
      expect(res.body.message).toMatch(/sudah berubah menjadi Dikerjakan/);
      expect(await countActions(ticketId)).toBe(before);
      expect(await statusOf(ticketId)).toBe('dikerjakan');
    });

    it('statusTo tanpa statusFrom ditolak', async () => {
      const ticketId = await ticketIn('terbuka');
      await l1
        .post(`/api/tickets/${ticketId}/actions`)
        .send({ kind: 'catatan', note: 'x', statusTo: 'dikerjakan' })
        .expect(400);
    });

    it('dua operator mengubah status bersamaan dari status yang sama: tepat satu tersimpan', async () => {
      const ticketId = await ticketIn('dikerjakan');
      const targets: TicketStatus[] = ['eskalasi_l2', 'eskalasi_sd', 'pulih', 'pending_tm', 'pending_customer', 'eskalasi_l2'];
      const results = await Promise.all(
        targets.map((to, index) => move(index % 2 === 0 ? l1 : l2, ticketId, 'dikerjakan', to)),
      );
      const statuses = results.map((res) => res.status).sort();
      expect(statuses).toEqual([201, 409, 409, 409, 409, 409]);
      const winner = results.find((res) => res.status === 201)?.body as TicketTimeline;
      expect(await statusOf(ticketId)).toBe(winner.ticket.status);
      const changes = (await dataSource.query(
        'SELECT count(*)::int AS n FROM ticket_actions WHERE ticket_id = $1 AND status_to IS NOT NULL AND kind <> $2',
        [ticketId, 'dibuat'],
      )) as Array<{ n: number }>;
      expect(changes[0]?.n).toBe(2); // terbuka → dikerjakan (persiapan) + pemenang
    });
  });

  describe('status hanya berubah lewat linimasa', () => {
    it('UPDATE langsung pada status, mulai gangguan, atau nomor tiket customer ditolak database', async () => {
      const ticketId = await ticketIn('dikerjakan');
      for (const assignment of [
        `status = 'pulih'`,
        `started_at = started_at - interval '1 hour'`,
        `customer_ticket_number = 'INC-1'`,
      ]) {
        await expect(
          operatorQuery(dataSource, `UPDATE tickets SET ${assignment} WHERE id = $1`, [ticketId]),
        ).rejects.toThrow(/hanya berubah lewat linimasa/);
      }
      expect(await statusOf(ticketId)).toBe('dikerjakan');
    });

    it('kolom lain (mis. waktu diperbarui) tetap bisa diubah langsung', async () => {
      const ticketId = await ticketIn('terbuka');
      await operatorQuery(dataSource, `UPDATE tickets SET updated_at = now() WHERE id = $1`, [ticketId]);
    });

    it('status_from entri harus sama dengan status sekarang, juga bila ditulis langsung', async () => {
      const ticketId = await ticketIn('dikerjakan');
      await expect(insertStatusAction(ticketId, 'terbuka', 'pulih')).rejects.toThrow(/bukan terbuka/);
    });

    it('perpindahan status tercatat di audit dengan pelaku yang sama untuk entri dan NPR', async () => {
      const ticketId = await ticketIn('terbuka');
      await move(l2, ticketId, 'terbuka', 'eskalasi_sd').expect(201);
      const rows = (await dataSource.query(
        `SELECT table_name, action, changes, actor_label FROM audit_log
          WHERE (table_name = 'tickets' AND row_id = $1 AND action = 'update')
             OR (table_name = 'ticket_actions' AND changes ->> 'ticket_id' = $1 AND changes ->> 'status_to' = 'eskalasi_sd')
          ORDER BY id`,
        [ticketId],
      )) as Array<{ table_name: string; action: string; changes: Record<string, unknown>; actor_label: string }>;
      expect(rows.map((row) => row.table_name).sort()).toEqual(['ticket_actions', 'tickets']);
      const update = rows.find((row) => row.table_name === 'tickets');
      expect(update?.changes.status).toEqual(['terbuka', 'eskalasi_sd']);
      expect(new Set(rows.map((row) => row.actor_label)).size).toBe(1);
      expect(rows[0]?.actor_label).toMatch(/@noc\.example$/);
    });
  });

  it('linimasa menampilkan setiap perpindahan dengan status asal dan tujuan', async () => {
    const ticketId = await ticketIn('terbuka');
    await move(l1, ticketId, 'terbuka', 'dikerjakan').expect(201);
    await move(l1, ticketId, 'dikerjakan', 'pending_tm').expect(201);
    const res = await move(l1, ticketId, 'pending_tm', 'pulih').expect(201);
    const changes = (res.body as TicketTimeline).actions.map((action: TicketAction) => action.statusChange);
    expect(changes).toEqual([
      { from: 'pending_tm', to: 'pulih' },
      { from: 'dikerjakan', to: 'pending_tm' },
      { from: 'terbuka', to: 'dikerjakan' },
      { from: null, to: 'terbuka' },
    ]);
  });

  async function countActions(ticketId: string): Promise<number> {
    const [row] = (await dataSource.query('SELECT count(*)::int AS n FROM ticket_actions WHERE ticket_id = $1', [
      ticketId,
    ])) as Array<{ n: number }>;
    return row?.n ?? 0;
  }
});
