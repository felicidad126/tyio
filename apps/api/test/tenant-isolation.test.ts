import { randomUUID } from 'node:crypto';
import { DiscoveryModule } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  type AuditPage,
  type GlobalSearchResult,
  type CustomerRecord,
  MASTER_KINDS,
  type MasterKind,
  type MasterValue,
  type RemoteDetail,
  type RemoteImportReport,
  type RemotePage,
  type SessionUser,
  type TenantSummary,
  type TicketAction,
  type TicketDetail,
  type TicketQueuePage,
  type TicketSummary,
  type TicketTimeline,
  type RemoteTicketHistoryPage,
  type TroubleTicketPage,
  XLSX_MIME,
} from '@tyio/shared';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { scopeFor, scopeIncludes } from '../src/common/tenant/tenant-scope.js';
import { TENANT_NOT_FOUND_MESSAGE } from '../src/modules/tenants/tenants.controller.js';
import { CUSTOMER_ADMIN_ONLY_MESSAGE, notFoundMessage } from '../src/modules/master/master.service.js';
import { REMOTE_NOT_FOUND_MESSAGE } from '../src/modules/remotes/remotes.service.js';
import { TROUBLE_TICKET_NOT_FOUND_MESSAGE } from '../src/modules/trouble-tickets/trouble-tickets.service.js';
import {
  ATTACHMENT_NOT_FOUND_MESSAGE,
  CORRECTED_NOT_FOUND_MESSAGE,
} from '../src/modules/tickets/actions/ticket-actions.service.js';
import {
  CATEGORY_NOT_FOUND_MESSAGE,
  SYSTEM_NOT_FOUND_MESSAGE,
  TICKET_NOT_FOUND_MESSAGE,
} from '../src/modules/tickets/tickets.service.js';
import { createTestApp } from './create-test-app.js';
import {
  buildXlsx,
  insertMasterValue,
  insertNoteWithAttachment,
  insertRemote,
  insertTenant,
  insertTicket,
  insertTroubleTicket,
  insertUser,
  moveTicketDirect,
  operatorQuery,
  TEST_PASSWORD,
} from './fixtures.js';
import { type RegisteredRoute, registeredRoutes } from './routes.js';

// Isolasi tenant (langkah 0.4): pengguna yang dibatasi ke customer A tidak bisa membaca
// data customer B lewat endpoint mana pun. Uji ini membaca daftar endpoint dari aplikasi,
// jadi endpoint baru otomatis ikut diperiksa dan wajib punya uji lintas-tenant di PROBES.

type Agent = ReturnType<typeof request.agent>;
type Tenant = { id: string; code: string; name: string };

interface Fixture {
  server: ReturnType<NestExpressApplication['getHttpServer']>;
  tenantA: Tenant;
  tenantB: Tenant;
  /** L1 yang hanya boleh melihat customer A. */
  operatorA: { email: string; agent: Agent };
  /** Admin yang hanya boleh melihat customer A. */
  adminA: { email: string; agent: Agent };
  /** Admin semua customer, untuk kontrol pada endpoint yang ditolak bagi admin terbatas. */
  adminAll: { email: string; agent: Agent };
  dataSource: DataSource;
}

const ids = (items: Array<{ id: string }>) => items.map((item) => item.id);

/** Uji lintas-tenant yang sama untuk kategori, system, dan jarkom (langkah 1.1). */
function masterValueProbes(kind: MasterKind): Record<string, (fx: Fixture) => Promise<void>> {
  const base = `/api/master/${kind}`;
  const body = (tenantId: string) => ({
    tenantId,
    name: `Baru ${randomUUID().slice(0, 8)}`,
    ...(kind === 'jarkom' ? { code: `J${randomUUID().slice(0, 6).toUpperCase().replace(/-/g, '')}` } : {}),
  });

  return {
    [`GET ${base}`]: async (fx) => {
      const ownValue = await insertMasterValue(fx.dataSource, kind, fx.tenantA.id);
      const otherValue = await insertMasterValue(fx.dataSource, kind, fx.tenantB.id);

      const all = (await fx.operatorA.agent.get(base).expect(200)).body as MasterValue[];
      expect(new Set(all.map((value) => value.tenantId))).toEqual(new Set([fx.tenantA.id]));
      expect(ids(all)).toContain(ownValue.id);
      expect(ids(all)).not.toContain(otherValue.id);

      const other = await fx.operatorA.agent.get(`${base}?tenantId=${fx.tenantB.id}`).expect(200);
      expect(other.body).toEqual([]);
    },

    [`POST ${base}`]: async (fx) => {
      const other = await fx.adminA.agent.post(base).send(body(fx.tenantB.id)).expect(404);
      expect(other.body.message).toBe(TENANT_NOT_FOUND_MESSAGE);
      const count = (await fx.dataSource.query(
        `SELECT count(*)::int AS n FROM audit_log WHERE tenant_id = $1 AND actor_label = $2`,
        [fx.tenantB.id, fx.adminA.email],
      )) as Array<{ n: number }>;
      expect(count[0]?.n).toBe(0);

      const own = await fx.adminA.agent.post(base).send(body(fx.tenantA.id)).expect(201);
      expect((own.body as MasterValue).tenantId).toBe(fx.tenantA.id);
    },

    [`PATCH ${base}/:id`]: async (fx) => {
      const otherValue = await insertMasterValue(fx.dataSource, kind, fx.tenantB.id);
      const other = await fx.adminA.agent.patch(`${base}/${otherValue.id}`).send({ active: false }).expect(404);
      expect(other.body.message).toBe(notFoundMessage(kind));
      const [stored] = (await fx.dataSource.query(
        `SELECT active FROM ${TABLES[kind]} WHERE id = $1`,
        [otherValue.id],
      )) as Array<{ active: boolean }>;
      expect(stored?.active).toBe(true);

      const ownValue = await insertMasterValue(fx.dataSource, kind, fx.tenantA.id);
      const own = await fx.adminA.agent.patch(`${base}/${ownValue.id}`).send({ active: false }).expect(200);
      expect((own.body as MasterValue).active).toBe(false);
    },

    [`DELETE ${base}/:id`]: async (fx) => {
      const otherValue = await insertMasterValue(fx.dataSource, kind, fx.tenantB.id);
      const other = await fx.adminA.agent.delete(`${base}/${otherValue.id}`).expect(404);
      expect(other.body.message).toBe(notFoundMessage(kind));
      const remaining = (await fx.dataSource.query(`SELECT id FROM ${TABLES[kind]} WHERE id = $1`, [
        otherValue.id,
      ])) as unknown[];
      expect(remaining).toHaveLength(1);

      const ownValue = await insertMasterValue(fx.dataSource, kind, fx.tenantA.id);
      await fx.adminA.agent.delete(`${base}/${ownValue.id}`).expect(204);
    },
  };
}

const TABLES: Record<MasterKind, string> = {
  kategori: 'master_categories',
  system: 'master_systems',
  jarkom: 'master_networks',
};

/**
 * Daftar customer untuk admin. Admin terbatas hanya melihat customer-nya dan tidak bisa
 * mengubah daftar customer sama sekali: jawabannya 403 untuk customer A maupun B, jadi
 * keberadaan B tidak terbaca. Admin semua customer menjadi kontrolnya.
 */
const CUSTOMER_PROBES: Record<string, (fx: Fixture) => Promise<void>> = {
  'GET /api/master/customer': async (fx) => {
    const res = await fx.adminA.agent.get('/api/master/customer').expect(200);
    expect(ids(res.body as CustomerRecord[])).toEqual([fx.tenantA.id]);
  },

  'POST /api/master/customer': async (fx) => {
    const code = `C${randomUUID().slice(0, 6).replace(/-/g, '').toUpperCase()}`;
    const denied = await fx.adminA.agent.post('/api/master/customer').send({ code, name: 'Bank Baru' }).expect(403);
    expect(denied.body.message).toBe(CUSTOMER_ADMIN_ONLY_MESSAGE);

    await fx.adminAll.agent.post('/api/master/customer').send({ code, name: 'Bank Baru' }).expect(201);
  },

  'PATCH /api/master/customer/:id': async (fx) => {
    for (const tenant of [fx.tenantB, fx.tenantA]) {
      const res = await fx.adminA.agent.patch(`/api/master/customer/${tenant.id}`).send({ name: 'Diubah' }).expect(403);
      expect(res.body.message).toBe(CUSTOMER_ADMIN_ONLY_MESSAGE);
    }
    const names = (await fx.dataSource.query('SELECT name FROM tenants WHERE id = ANY($1) ORDER BY name', [
      [fx.tenantA.id, fx.tenantB.id],
    ])) as Array<{ name: string }>;
    expect(names.map((row) => row.name)).toEqual([fx.tenantA.name, fx.tenantB.name]);

    await fx.adminAll.agent.patch(`/api/master/customer/${fx.tenantB.id}`).send({ name: fx.tenantB.name }).expect(200);
  },

  'DELETE /api/master/customer/:id': async (fx) => {
    const spare = await insertTenant(fx.dataSource, 'Bank Cadangan');
    for (const tenant of [fx.tenantB, spare]) {
      const res = await fx.adminA.agent.delete(`/api/master/customer/${tenant.id}`).expect(403);
      expect(res.body.message).toBe(CUSTOMER_ADMIN_ONLY_MESSAGE);
    }
    await fx.adminAll.agent.delete(`/api/master/customer/${spare.id}`).expect(204);
  },
};

/** Remote (langkah 1.2): daftar, halaman remote, dan impor. */
const REMOTE_PROBES: Record<string, (fx: Fixture) => Promise<void>> = {
  'GET /api/remotes': async (fx) => {
    const own = await insertRemote(fx.dataSource, fx.tenantA.id);
    const other = await insertRemote(fx.dataSource, fx.tenantB.id, { name: own.name });

    const all = (await fx.operatorA.agent.get('/api/remotes?pageSize=100').expect(200)).body as RemotePage;
    expect(new Set(all.items.map((remote) => remote.tenantId))).toEqual(new Set([fx.tenantA.id]));
    // Pencarian yang cocok dengan remote customer B pun tidak menampilkannya.
    const search = (await fx.operatorA.agent.get(`/api/remotes?q=${encodeURIComponent(own.name)}`).expect(200))
      .body as RemotePage;
    expect(ids(search.items)).toEqual([own.id]);
    expect(search.total).toBe(1);
    const filtered = (await fx.operatorA.agent.get(`/api/remotes?tenantId=${fx.tenantB.id}`).expect(200))
      .body as RemotePage;
    expect(filtered).toMatchObject({ items: [], total: 0 });
    expect(ids(all.items)).not.toContain(other.id);
  },

  'GET /api/remotes/:id': async (fx) => {
    const own = await insertRemote(fx.dataSource, fx.tenantA.id);
    const other = await insertRemote(fx.dataSource, fx.tenantB.id);

    const res = await fx.operatorA.agent.get(`/api/remotes/${other.id}`).expect(404);
    expect(res.body.message).toBe(REMOTE_NOT_FOUND_MESSAGE);
    const mine = await fx.operatorA.agent.get(`/api/remotes/${own.id}`).expect(200);
    expect((mine.body as RemoteDetail).code).toBe(own.code);
  },

  'POST /api/remote-import': async (fx) => {
    const networkB = await insertMasterValue(fx.dataSource, 'jarkom', fx.tenantB.id);
    const networkA = await insertMasterValue(fx.dataSource, 'jarkom', fx.tenantA.id);
    const code = `IMP-${randomUUID().slice(0, 8).toUpperCase()}`;
    const file = (network: string | null) =>
      buildXlsx([
        ['Kode remote', 'Nama remote', 'Jarkom', 'Zona waktu'],
        [code, 'Remote impor', network, 'WIB'],
      ]);

    const other = await fx.adminA.agent
      .post(`/api/remote-import?tenantId=${fx.tenantB.id}&mode=save`)
      .set('Content-Type', XLSX_MIME)
      .send(await file(networkB.code))
      .expect(404);
    expect(other.body.message).toBe(TENANT_NOT_FOUND_MESSAGE);
    const stored = (await fx.dataSource.query('SELECT id FROM remotes WHERE code = $1', [code])) as unknown[];
    expect(stored).toEqual([]);

    // Kode jarkom customer B tidak dikenal saat impor ke customer A.
    const crossNetwork = await fx.adminA.agent
      .post(`/api/remote-import?tenantId=${fx.tenantA.id}`)
      .set('Content-Type', XLSX_MIME)
      .send(await file(networkB.code))
      .expect(200);
    expect((crossNetwork.body as RemoteImportReport).failed[0]?.errors).toEqual([
      `Jarkom ${networkB.code} tidak ada di customer ini.`,
    ]);

    const own = await fx.adminA.agent
      .post(`/api/remote-import?tenantId=${fx.tenantA.id}&mode=save`)
      .set('Content-Type', XLSX_MIME)
      .send(await file(networkA.code))
      .expect(200);
    expect((own.body as RemoteImportReport).created).toBe(1);
  },
};

/** NPR (langkah 1.3): buat, halaman NPR, dan NPR terbuka per remote. */
const TICKET_PROBES: Record<string, (fx: Fixture) => Promise<void>> = {
  'POST /api/tickets': async (fx) => {
    const otherRemote = await insertRemote(fx.dataSource, fx.tenantB.id);
    const otherCategory = await insertMasterValue(fx.dataSource, 'kategori', fx.tenantB.id);
    const otherSystem = await insertMasterValue(fx.dataSource, 'system', fx.tenantB.id);
    const body = (remoteId: string, categoryId: string, systemId: string) => ({
      remoteId,
      categoryId,
      systemId,
      description: 'Ping gagal 100%',
    });

    const other = await fx.operatorA.agent
      .post('/api/tickets')
      .send(body(otherRemote.id, otherCategory.id, otherSystem.id))
      .expect(404);
    expect(other.body.message).toBe(REMOTE_NOT_FOUND_MESSAGE);
    const stored = (await fx.dataSource.query('SELECT id FROM tickets WHERE remote_id = $1', [
      otherRemote.id,
    ])) as unknown[];
    expect(stored).toEqual([]);

    // Kategori customer B di remote customer A: jawaban sama dengan id yang tidak ada.
    const ownRemote = await insertRemote(fx.dataSource, fx.tenantA.id);
    const ownCategory = await insertMasterValue(fx.dataSource, 'kategori', fx.tenantA.id);
    const ownSystem = await insertMasterValue(fx.dataSource, 'system', fx.tenantA.id);
    const crossCategory = await fx.operatorA.agent
      .post('/api/tickets')
      .send(body(ownRemote.id, otherCategory.id, ownSystem.id))
      .expect(400);
    expect(crossCategory.body.message).toBe(CATEGORY_NOT_FOUND_MESSAGE);
    const crossSystem = await fx.operatorA.agent
      .post('/api/tickets')
      .send(body(ownRemote.id, ownCategory.id, otherSystem.id))
      .expect(400);
    expect(crossSystem.body.message).toBe(SYSTEM_NOT_FOUND_MESSAGE);

    const own = await fx.operatorA.agent
      .post('/api/tickets')
      .send(body(ownRemote.id, ownCategory.id, ownSystem.id))
      .expect(201);
    expect((own.body as TicketDetail).tenantId).toBe(fx.tenantA.id);
  },

  'GET /api/tickets/:id': async (fx) => {
    const other = await insertTicket(fx.dataSource, fx.tenantB.id);
    const res = await fx.operatorA.agent.get(`/api/tickets/${other.id}`).expect(404);
    expect(res.body.message).toBe(TICKET_NOT_FOUND_MESSAGE);

    const own = await insertTicket(fx.dataSource, fx.tenantA.id);
    const mine = await fx.operatorA.agent.get(`/api/tickets/${own.id}`).expect(200);
    expect((mine.body as TicketDetail).number).toBe(own.number);
  },

  'GET /api/remotes/:remoteId/open-tickets': async (fx) => {
    const other = await insertTicket(fx.dataSource, fx.tenantB.id);
    const res = await fx.operatorA.agent.get(`/api/remotes/${other.remoteId}/open-tickets`).expect(404);
    expect(res.body.message).toBe(REMOTE_NOT_FOUND_MESSAGE);

    const own = await insertTicket(fx.dataSource, fx.tenantA.id);
    const mine = await fx.operatorA.agent.get(`/api/remotes/${own.remoteId}/open-tickets`).expect(200);
    expect(ids(mine.body as TicketSummary[])).toEqual([own.id]);
  },
};

/** Linimasa NPR dan lampiran (langkah 1.4). */
const TICKET_ACTION_PROBES: Record<string, (fx: Fixture) => Promise<void>> = {
  'GET /api/tickets/:ticketId/actions': async (fx) => {
    const other = await insertTicket(fx.dataSource, fx.tenantB.id);
    const res = await fx.operatorA.agent.get(`/api/tickets/${other.id}/actions`).expect(404);
    expect(res.body.message).toBe(TICKET_NOT_FOUND_MESSAGE);

    const own = await insertTicket(fx.dataSource, fx.tenantA.id);
    const mine = await fx.operatorA.agent.get(`/api/tickets/${own.id}/actions`).expect(200);
    expect((mine.body as TicketAction[]).map((action) => action.kind)).toEqual(['dibuat']);
  },

  'POST /api/tickets/:ticketId/actions': async (fx) => {
    const other = await insertTicket(fx.dataSource, fx.tenantB.id);
    const body = { kind: 'catatan', note: 'Catatan lintas customer', statusFrom: 'terbuka', statusTo: 'dikerjakan' };
    const res = await fx.operatorA.agent.post(`/api/tickets/${other.id}/actions`).send(body).expect(404);
    expect(res.body.message).toBe(TICKET_NOT_FOUND_MESSAGE);
    const [stored] = (await fx.dataSource.query(
      `SELECT t.status, (SELECT count(*)::int FROM ticket_actions a WHERE a.ticket_id = t.id) AS actions
         FROM tickets t WHERE t.id = $1`,
      [other.id],
    )) as Array<{ status: string; actions: number }>;
    expect(stored).toEqual({ status: 'terbuka', actions: 1 });

    // Koreksi yang merujuk entri NPR customer B dari NPR sendiri: seperti entri yang tidak ada.
    const own = await insertTicket(fx.dataSource, fx.tenantA.id);
    const [otherEntry] = (await fx.dataSource.query('SELECT id FROM ticket_actions WHERE ticket_id = $1', [
      other.id,
    ])) as Array<{ id: string }>;
    const cross = await fx.operatorA.agent
      .post(`/api/tickets/${own.id}/actions`)
      .send({ kind: 'koreksi', note: 'Koreksi lintas', correctsId: otherEntry?.id })
      .expect(400);
    expect(cross.body.message).toBe(CORRECTED_NOT_FOUND_MESSAGE);

    const mine = await fx.operatorA.agent.post(`/api/tickets/${own.id}/actions`).send(body).expect(201);
    expect((mine.body as TicketTimeline).ticket.status).toBe('dikerjakan');
  },

  'GET /api/tickets/:ticketId/attachments/:attachmentId': async (fx) => {
    const other = await insertTicket(fx.dataSource, fx.tenantB.id);
    const otherFile = await insertNoteWithAttachment(fx.dataSource, other.id, 'rahasia customer B');
    const res = await fx.operatorA.agent
      .get(`/api/tickets/${other.id}/attachments/${otherFile.attachmentId}`)
      .expect(404);
    expect(res.body.message).toBe(ATTACHMENT_NOT_FOUND_MESSAGE);
    // Lampiran customer B lewat id NPR sendiri juga tidak terbaca.
    const own = await insertTicket(fx.dataSource, fx.tenantA.id);
    await fx.operatorA.agent.get(`/api/tickets/${own.id}/attachments/${otherFile.attachmentId}`).expect(404);

    const ownFile = await insertNoteWithAttachment(fx.dataSource, own.id, 'milik customer A');
    const mine = await fx.operatorA.agent
      .get(`/api/tickets/${own.id}/attachments/${ownFile.attachmentId}`)
      .buffer(true)
      .expect(200);
    expect(mine.text).toBe('milik customer A');
  },
};

/** Antrean, penanggung, dan pencarian global (langkah 1.5). */
const QUEUE_PROBES: Record<string, (fx: Fixture) => Promise<void>> = {
  'GET /api/tickets': async (fx) => {
    const other = await insertTicket(fx.dataSource, fx.tenantB.id);
    const own = await insertTicket(fx.dataSource, fx.tenantA.id);
    const all = (await fx.operatorA.agent.get('/api/tickets?pageSize=100&sort=terbaru').expect(200)).body as TicketQueuePage;
    expect(new Set(all.items.map((item) => item.tenantId))).toEqual(new Set([fx.tenantA.id]));
    expect(ids(all.items)).toContain(own.id);
    expect(ids(all.items)).not.toContain(other.id);
    // Saringan customer B atau kata kunci nomor NPR B: kosong, jumlah tiap tampilan nol.
    const byTenant = (await fx.operatorA.agent.get(`/api/tickets?tenantId=${fx.tenantB.id}`).expect(200))
      .body as TicketQueuePage;
    expect(byTenant.items).toEqual([]);
    expect(Object.values(byTenant.counts).every((count) => count === 0)).toBe(true);
    const byNumber = (await fx.operatorA.agent.get(`/api/tickets?q=${encodeURIComponent(other.number)}`).expect(200))
      .body as TicketQueuePage;
    expect(byNumber.total).toBe(0);
  },

  'POST /api/tickets/:ticketId/take': async (fx) => {
    const other = await insertTicket(fx.dataSource, fx.tenantB.id);
    const res = await fx.operatorA.agent
      .post(`/api/tickets/${other.id}/take`)
      .send({ expectedAssigneeId: null })
      .expect(404);
    expect(res.body.message).toBe(TICKET_NOT_FOUND_MESSAGE);
    const [stored] = (await fx.dataSource.query('SELECT assignee_id, status FROM tickets WHERE id = $1', [
      other.id,
    ])) as Array<{ assignee_id: string | null; status: string }>;
    expect(stored).toEqual({ assignee_id: null, status: 'terbuka' });

    const own = await insertTicket(fx.dataSource, fx.tenantA.id);
    const mine = await fx.operatorA.agent.post(`/api/tickets/${own.id}/take`).send({ expectedAssigneeId: null }).expect(201);
    expect((mine.body as TicketTimeline).ticket.assignee?.name).toBeTruthy();
  },

  'GET /api/search': async (fx) => {
    const marker = `ISO${randomUUID().slice(0, 6)}`;
    const otherRemote = await insertRemote(fx.dataSource, fx.tenantB.id, { name: `Remote ${marker} B` });
    await insertTicket(fx.dataSource, fx.tenantB.id, { remoteId: otherRemote.id });
    const ownRemote = await insertRemote(fx.dataSource, fx.tenantA.id, { name: `Remote ${marker} A` });
    const own = await insertTicket(fx.dataSource, fx.tenantA.id, { remoteId: ownRemote.id });

    const res = (await fx.operatorA.agent.get(`/api/search?q=${marker}`).expect(200)).body as GlobalSearchResult;
    expect(ids(res.tickets)).toEqual([own.id]);
    expect(ids(res.remotes)).toEqual([ownRemote.id]);

    // TT (1.5b): nomor TT customer B tidak ditemukan; TT sendiri ditemukan.
    const otherTt = await insertTroubleTicket(fx.dataSource, (await insertTicket(fx.dataSource, fx.tenantB.id)).id);
    const byOther = (await fx.operatorA.agent.get(`/api/search?q=${encodeURIComponent(otherTt.number)}`).expect(200))
      .body as GlobalSearchResult;
    expect(byOther.troubleTickets).toEqual([]);
    const ownTt = await insertTroubleTicket(fx.dataSource, own.id);
    const byOwn = (await fx.operatorA.agent.get(`/api/search?q=${encodeURIComponent(ownTt.number)}`).expect(200))
      .body as GlobalSearchResult;
    expect(ids(byOwn.troubleTickets)).toEqual([ownTt.id]);
  },
};

/** TT ke SD (langkah 1.5b). */
const TROUBLE_TICKET_PROBES: Record<string, (fx: Fixture) => Promise<void>> = {
  'POST /api/tickets/:ticketId/trouble-tickets': async (fx) => {
    const other = await insertTicket(fx.dataSource, fx.tenantB.id);
    const res = await fx.operatorA.agent
      .post(`/api/tickets/${other.id}/trouble-tickets`)
      .send({ problem: 'Modem mati' })
      .expect(404);
    expect(res.body.message).toBe(TICKET_NOT_FOUND_MESSAGE);
    const stored = (await fx.dataSource.query('SELECT id FROM trouble_tickets WHERE ticket_id = $1', [
      other.id,
    ])) as unknown[];
    expect(stored).toEqual([]);

    const own = await insertTicket(fx.dataSource, fx.tenantA.id);
    const mine = await fx.operatorA.agent
      .post(`/api/tickets/${own.id}/trouble-tickets`)
      .send({ problem: 'Modem mati' })
      .expect(201);
    expect((mine.body as TicketTimeline).ticket.troubleTickets).toHaveLength(1);
  },

  'GET /api/trouble-tickets': async (fx) => {
    const other = await insertTroubleTicket(fx.dataSource, (await insertTicket(fx.dataSource, fx.tenantB.id)).id);
    const own = await insertTroubleTicket(fx.dataSource, (await insertTicket(fx.dataSource, fx.tenantA.id)).id);
    const page = (await fx.operatorA.agent.get('/api/trouble-tickets?pageSize=100').expect(200)).body as TroubleTicketPage;
    expect(new Set(page.items.map((item) => item.tenantId))).toEqual(new Set([fx.tenantA.id]));
    expect(ids(page.items)).not.toContain(other.id);
    const byNumber = (await fx.operatorA.agent.get(`/api/trouble-tickets?q=${encodeURIComponent(own.number)}`).expect(200))
      .body as TroubleTicketPage;
    expect(ids(byNumber.items)).toEqual([own.id]);
    const byOtherTenant = (await fx.operatorA.agent.get(`/api/trouble-tickets?tenantId=${fx.tenantB.id}`).expect(200))
      .body as TroubleTicketPage;
    expect(byOtherTenant.items).toEqual([]);
  },

  'POST /api/trouble-tickets/:id/copied': async (fx) => {
    const other = await insertTroubleTicket(fx.dataSource, (await insertTicket(fx.dataSource, fx.tenantB.id)).id);
    const res = await fx.operatorA.agent.post(`/api/trouble-tickets/${other.id}/copied`).expect(404);
    expect(res.body.message).toBe(TROUBLE_TICKET_NOT_FOUND_MESSAGE);
    const [count] = (await fx.dataSource.query(
      `SELECT count(*)::int AS n FROM ticket_actions WHERE trouble_ticket_id = $1 AND kind = 'tt_disalin'`,
      [other.id],
    )) as Array<{ n: number }>;
    expect(count?.n).toBe(0);

    const own = await insertTroubleTicket(fx.dataSource, (await insertTicket(fx.dataSource, fx.tenantA.id)).id);
    const mine = await fx.operatorA.agent.post(`/api/trouble-tickets/${own.id}/copied`).expect(200);
    expect(mine.body).toMatchObject({ copiedCount: 1 });
  },
};

/**
 * Satu uji lintas-tenant per endpoint yang ditandai `@TenantScoped()`, dengan kunci
 * `METHOD /api/path`. Setiap uji memastikan data customer B tidak terlihat oleh pengguna A,
 * dan (sebagai kontrol) data customer A tetap terlihat.
 */
/** Penutupan NPR dan TT, riwayat remote (langkah 1.6). */
const CLOSE_PROBES: Record<string, (fx: Fixture) => Promise<void>> = {
  'POST /api/tickets/:ticketId/close': async (fx) => {
    const other = await insertTicket(fx.dataSource, fx.tenantB.id);
    await moveTicketDirect(fx.dataSource, other.id, 'pulih');
    const body = { cause: 'listrik', resolution: 'Listrik kembali menyala' };
    const res = await fx.operatorA.agent.post(`/api/tickets/${other.id}/close`).send(body).expect(404);
    expect(res.body.message).toBe(TICKET_NOT_FOUND_MESSAGE);
    const [stored] = (await fx.dataSource.query('SELECT status FROM tickets WHERE id = $1', [other.id])) as Array<{
      status: string;
    }>;
    expect(stored?.status).toBe('pulih');

    const own = await insertTicket(fx.dataSource, fx.tenantA.id);
    await moveTicketDirect(fx.dataSource, own.id, 'pulih');
    const mine = await fx.operatorA.agent.post(`/api/tickets/${own.id}/close`).send(body).expect(201);
    expect((mine.body as TicketTimeline).ticket.status).toBe('ditutup');
  },

  'POST /api/trouble-tickets/:id/close': async (fx) => {
    const other = await insertTroubleTicket(fx.dataSource, (await insertTicket(fx.dataSource, fx.tenantB.id)).id);
    const body = { resolution: 'Modem diganti teknisi SD' };
    const res = await fx.adminA.agent.post(`/api/trouble-tickets/${other.id}/close`).send(body).expect(404);
    expect(res.body.message).toBe(TROUBLE_TICKET_NOT_FOUND_MESSAGE);
    const [stored] = (await fx.dataSource.query('SELECT status FROM trouble_tickets WHERE id = $1', [other.id])) as Array<{
      status: string;
    }>;
    expect(stored?.status).toBe('menunggu_sd');

    const own = await insertTroubleTicket(fx.dataSource, (await insertTicket(fx.dataSource, fx.tenantA.id)).id);
    const mine = await fx.adminA.agent.post(`/api/trouble-tickets/${own.id}/close`).send(body).expect(201);
    expect((mine.body as TicketTimeline).ticket.troubleTickets[0]).toMatchObject({ id: own.id, status: 'ditutup' });
  },

  'GET /api/remotes/:remoteId/tickets': async (fx) => {
    const other = await insertTicket(fx.dataSource, fx.tenantB.id);
    const res = await fx.operatorA.agent.get(`/api/remotes/${other.remoteId}/tickets`).expect(404);
    expect(res.body.message).toBe(REMOTE_NOT_FOUND_MESSAGE);

    const own = await insertTicket(fx.dataSource, fx.tenantA.id);
    const page = (await fx.operatorA.agent.get(`/api/remotes/${own.remoteId}/tickets`).expect(200))
      .body as RemoteTicketHistoryPage;
    expect(ids(page.items)).toEqual([own.id]);
  },
};

const PROBES: Record<string, (fx: Fixture) => Promise<void>> = {
  'POST /api/auth/login': async (fx) => {
    const res = await request(fx.server)
      .post('/api/auth/login')
      .send({ email: fx.operatorA.email, password: TEST_PASSWORD })
      .expect(200);

    expect(ids((res.body as SessionUser).tenants)).toEqual([fx.tenantA.id]);
  },

  'GET /api/auth/me': async (fx) => {
    const res = await fx.operatorA.agent.get('/api/auth/me').expect(200);

    expect(ids((res.body as SessionUser).tenants)).toEqual([fx.tenantA.id]);
  },

  'GET /api/tenants': async (fx) => {
    const res = await fx.operatorA.agent.get('/api/tenants').expect(200);

    expect(ids(res.body as TenantSummary[])).toEqual([fx.tenantA.id]);
  },

  'GET /api/tenants/:id': async (fx) => {
    const other = await fx.operatorA.agent.get(`/api/tenants/${fx.tenantB.id}`).expect(404);
    expect(other.body.message).toBe(TENANT_NOT_FOUND_MESSAGE);

    const own = await fx.operatorA.agent.get(`/api/tenants/${fx.tenantA.id}`).expect(200);
    expect(own.body).toEqual({ id: fx.tenantA.id, code: fx.tenantA.code, name: fx.tenantA.name });
  },

  'GET /api/audit': async (fx) => {
    const other = await fx.adminA.agent.get(`/api/audit?tenantId=${fx.tenantB.id}`).expect(200);
    expect((other.body as AuditPage).entries).toEqual([]);

    const own = await fx.adminA.agent.get(`/api/audit?tenantId=${fx.tenantA.id}`).expect(200);
    expect((own.body as AuditPage).entries.length).toBeGreaterThan(0);

    // Tanpa filter: hanya catatan customer A; catatan global (login, pengguna) juga tidak.
    const all = await fx.adminA.agent.get('/api/audit?limit=200').expect(200);
    const tenants = new Set((all.body as AuditPage).entries.map((entry) => entry.tenantId));
    expect([...tenants]).toEqual([fx.tenantA.id]);
  },

  ...Object.assign({}, ...MASTER_KINDS.map(masterValueProbes)),
  ...CUSTOMER_PROBES,
  ...REMOTE_PROBES,
  ...TICKET_PROBES,
  ...TICKET_ACTION_PROBES,
  ...QUEUE_PROBES,
  ...TROUBLE_TICKET_PROBES,
  ...CLOSE_PROBES,
};


describe('isolasi tenant di semua endpoint', () => {
  let app: NestExpressApplication;
  let dataSource: DataSource;
  let routes: RegisteredRoute[];
  let fx: Fixture;

  beforeAll(async () => {
    app = await createTestApp(undefined, { imports: [DiscoveryModule] });
    dataSource = app.get(DataSource);
    routes = registeredRoutes(app);

    const tenantA = await insertTenant(dataSource, 'Bank Isolasi A');
    const tenantB = await insertTenant(dataSource, 'Bank Isolasi B');
    // Data customer B yang nyata di audit: pengguna yang dibatasi ke B.
    await insertUser(dataSource, { name: 'Operator B', tenantCodes: [tenantB.code] });
    const operatorA = await insertUser(dataSource, { name: 'Operator A', tenantCodes: [tenantA.code] });
    const adminA = await insertUser(dataSource, {
      name: 'Admin A',
      role: 'admin',
      tenantCodes: [tenantA.code],
    });
    const adminAll = await insertUser(dataSource, { name: 'Admin Semua', role: 'admin' });

    const login = async (email: string) => {
      const agent = request.agent(app.getHttpServer());
      await agent.post('/api/auth/login').send({ email, password: TEST_PASSWORD }).expect(200);
      return { email, agent };
    };
    fx = {
      server: app.getHttpServer(),
      tenantA,
      tenantB,
      operatorA: await login(operatorA.email),
      adminA: await login(adminA.email),
      adminAll: await login(adminAll.email),
      dataSource,
    };
  });

  afterAll(async () => {
    await app.close();
  });

  it('daftar endpoint terbaca (pemeriksa uji ini sendiri)', () => {
    expect(routes.map((route) => route.key)).toEqual(
      expect.arrayContaining(['GET /api/health', 'POST /api/auth/login', 'GET /api/tenants/:id']),
    );
  });

  it('setiap endpoint menyatakan apakah menyentuh data customer', () => {
    const undeclared = routes.filter((route) => route.tenancy === undefined).map((route) => route.key);

    // Perbaikan: beri @TenantScoped() atau @NoTenantData() pada handler atau controller-nya.
    expect(undeclared).toEqual([]);
  });

  it('setiap endpoint data customer punya uji lintas-tenant, dan sebaliknya', () => {
    const scoped = routes.filter((route) => route.tenancy === 'scoped').map((route) => route.key);

    // Perbaikan: tambahkan uji ke PROBES di berkas ini dengan kunci "METHOD /api/path".
    expect(Object.keys(PROBES).sort()).toEqual(scoped.sort());
  });

  it('setiap endpoint non-publik menolak permintaan tanpa sesi', async () => {
    const open: string[] = [];
    for (const route of routes.filter((r) => !r.isPublic)) {
      const path = route.path.replace(/:[A-Za-z]+/g, randomUUID());
      const res = await request(fx.server)[route.method.toLowerCase() as 'get'](path);
      if (res.status !== 401) open.push(`${route.key} → ${res.status}`);
    }

    expect(open).toEqual([]);
  });

  // `it.for` dievaluasi saat berkas dimuat, sebelum aplikasi menyala; daftar kunci PROBES
  // dicocokkan dengan daftar rute oleh uji di atas.
  it.for(Object.keys(PROBES))('%s tidak membocorkan data customer lain', async (key) => {
    const probe = PROBES[key];
    if (!probe) throw new Error(`Tidak ada uji untuk ${key}`);
    await probe(fx);
  });

  it('customer nonaktif keluar dari cakupan, walau masih ditautkan', async () => {
    const closing = await insertTenant(dataSource, 'Bank Tutup');
    const user = await insertUser(dataSource, { tenantCodes: [closing.code] });
    const agent = request.agent(fx.server);
    await agent.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD }).expect(200);
    await agent.get(`/api/tenants/${closing.id}`).expect(200);

    await operatorQuery(dataSource, 'UPDATE tenants SET active = false WHERE id = $1', [closing.id]);

    await agent.get(`/api/tenants/${closing.id}`).expect(404);
    expect((await agent.get('/api/tenants').expect(200)).body).toEqual([]);
    expect(((await agent.get('/api/auth/me').expect(200)).body as SessionUser).tenants).toEqual([]);
  });

  it('daftar customer urut nama seperti dibaca orang, apa pun collation database', async () => {
    const bpd = await insertTenant(dataSource, 'BPD Zeta');
    const bank = await insertTenant(dataSource, 'Bank Alfa');
    const user = await insertUser(dataSource, { tenantCodes: [bpd.code, bank.code] });
    const agent = request.agent(fx.server);
    await agent.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD }).expect(200);

    const res = await agent.get('/api/tenants').expect(200);

    // Collation "C" mengurutkan huruf besar dulu (BPD < Bank); pembaca mengharapkan Bank < BPD.
    expect((res.body as TenantSummary[]).map((tenant) => tenant.name)).toEqual(['Bank Alfa', 'BPD Zeta']);
  });

  it('id yang bukan UUID dijawab seperti id yang tidak ada', async () => {
    const res = await fx.operatorA.agent.get('/api/tenants/bukan-uuid').expect(404);

    expect(res.body.message).toBe(TENANT_NOT_FOUND_MESSAGE);
  });
});

describe('aturan skema: setiap tabel data punya tenant_id (T9)', () => {
  // Tabel tanpa tenant_id harus disebut di sini beserta alasannya.
  const GLOBAL_TABLES: Record<string, string> = {
    migrations: 'catatan migrasi TypeORM',
    tenants: 'tabel customer itu sendiri; cakupannya lewat kolom id',
    users: 'pengguna lintas customer; aksesnya di user_tenants',
    sessions: 'sesi login milik pengguna, bukan data customer',
    login_attempts: 'catatan keamanan login, bukan data customer',
  };

  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('tabel di luar daftar global wajib punya kolom tenant_id', async () => {
    const rows: Array<{ table_name: string }> = await app.get(DataSource).query(
      `SELECT t.table_name
       FROM information_schema.tables t
       WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
         AND NOT EXISTS (
           SELECT 1 FROM information_schema.columns c
           WHERE c.table_schema = 'public' AND c.table_name = t.table_name AND c.column_name = 'tenant_id')
       ORDER BY t.table_name`,
    );

    expect(rows.map((row) => row.table_name)).toEqual(Object.keys(GLOBAL_TABLES).sort());
  });
});

describe('cakupan customer pengguna', () => {
  const tenant = (id: string, active = true) => ({ id, active });

  it('semua customer bila tidak dibatasi', () => {
    const scope = scopeFor({ allTenants: true, tenants: [tenant('a')] });

    expect(scope).toEqual({ all: true });
    expect(scopeIncludes(scope, 'apa-saja')).toBe(true);
    expect(scopeIncludes(scope, null)).toBe(true);
  });

  it('hanya customer aktif yang ditautkan bila dibatasi; catatan tanpa customer tidak termasuk', () => {
    const scope = scopeFor({ allTenants: false, tenants: [tenant('a'), tenant('b', false)] });

    expect(scope).toEqual({ all: false, tenantIds: ['a'] });
    expect(scopeIncludes(scope, 'a')).toBe(true);
    expect(scopeIncludes(scope, 'b')).toBe(false);
    expect(scopeIncludes(scope, null)).toBe(false);
  });
});
