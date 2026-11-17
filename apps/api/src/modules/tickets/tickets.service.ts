import { ConflictException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import {
  ACTIVE_TICKET_STATUSES,
  type MasterRef,
  type OpenTicketsConflict,
  type TenantRef,
  TICKET_LIST_NOTE_EXCERPT,
  TICKET_PAGE_SIZE,
  TICKET_QUEUE_VIEWS,
  type TicketDetail,
  type TicketListItem,
  type TicketListResponse,
  type TicketQueueView,
  type TicketStatus,
  type TicketSummary,
  type TicketView,
} from '@tyio/shared';
import { DataSource, type EntityManager, In, IsNull } from 'typeorm';
import { type Actor, withActor } from '../../common/audit/actor.js';
import type { TenantAccess } from '../../common/tenant/tenant-access.js';
import { TenantScopedRepository } from '../../common/tenant/tenant-scoped.repository.js';
import { JarkomEntity, SystemEntity, TicketCategoryEntity } from '../master/master.entities.js';
import { likePattern } from '../remotes/remote-query.js';
import { REMOTE_SEARCH_EXPRESSION, RemoteEntity } from '../remotes/remote.entity.js';
import { TenantEntity } from '../tenants/tenant.entity.js';
import { UserEntity } from '../users/user.entity.js';
import { invalid, type CreateTicketInput } from './ticket-input.js';
import { formatTicketNumber, ticketPeriod } from './ticket-number.js';
import { TicketActionEntity } from './ticket-action.entity.js';
import type { ParsedTicketListQuery } from './ticket-list-query.js';
import { type Ticket, TicketEntity, TICKET_SEARCH_EXPRESSION } from './ticket.entity.js';

/**
 * Syarat tiap tampilan daftar (T55). `:activeStatuses` dan `:me` diisi oleh list(). "Milik
 * saya" = tiket aktif yang saya buat atau pernah saya beri tindakan.
 */
const VIEW_CONDITIONS: Readonly<Record<TicketView, string | null>> = {
  aktif: 't.status IN (:...activeStatuses)',
  saya:
    't.status IN (:...activeStatuses) AND (t.created_by = :me OR EXISTS ' +
    '(SELECT 1 FROM ticket_actions ta WHERE ta.ticket_id = t.id AND ta.created_by = :me))',
  pending: "t.status = 'pending'",
  eskalasi: "t.status = 'eskalasi'",
  selesai: "t.status = 'selesai'",
  semua: null,
};

const isQueueView = (view: TicketView): view is TicketQueueView =>
  (TICKET_QUEUE_VIEWS as readonly string[]).includes(view);

@Injectable()
export class TicketsService {
  private readonly tickets: TenantScopedRepository<Ticket>;

  constructor(private readonly dataSource: DataSource) {
    this.tickets = new TenantScopedRepository(dataSource.getRepository(TicketEntity), 'tenantId');
  }

  /**
   * Membuat tiket NPR untuk remote yang boleh dilihat pengguna. Dalam satu transaksi:
   * baris remote dikunci (pembuatan tiket per remote berurutan, sehingga peringatan tiket
   * terbuka tidak bisa terlewat oleh dua operator bersamaan), lalu penghitung nomor dinaikkan
   * dan tiket disimpan. Bila apa pun gagal, nomor tidak terpakai.
   */
  async create(access: TenantAccess, userId: string, input: CreateTicketInput, actor: Actor): Promise<TicketDetail> {
    const category = await this.dataSource.getRepository(TicketCategoryEntity).findOneBy({ id: input.categoryId });
    if (!category) throw invalid('Kategori tidak ditemukan.', 'categoryId');
    if (!category.active) throw invalid(`Kategori ${category.code} nonaktif.`, 'categoryId');
    if (input.systemId) {
      const system = await this.dataSource.getRepository(SystemEntity).findOneBy({ id: input.systemId });
      if (!system) throw invalid('System tidak ditemukan.', 'systemId');
      if (!system.active) throw invalid(`System ${system.code} nonaktif.`, 'systemId');
    }

    const id = await withActor(this.dataSource, actor, async (m) => {
      const remote = await new TenantScopedRepository(m.getRepository(RemoteEntity), 'tenantId')
        .query(access, 'r')
        .andWhere('r.id = :id', { id: input.remoteId })
        .setLock('pessimistic_write')
        .getOne();
      if (!remote) throw notFound('Remote tidak ditemukan.');
      if (remote.status === 'dibongkar') {
        throw invalid(`Remote ${remote.siteId} sudah dibongkar; tiket tidak bisa dibuat.`, 'remoteId');
      }
      const tenant = await m.getRepository(TenantEntity).findOneByOrFail({ id: remote.tenantId });
      if (!tenant.active) throw invalid(`Customer ${tenant.name} nonaktif; tiket tidak bisa dibuat.`, 'remoteId');

      if (!input.confirmOpenTickets) {
        const open = await m.getRepository(TicketEntity).find({
          where: { remoteId: remote.id, closedAt: IsNull() },
          order: { createdAt: 'DESC' },
        });
        if (open.length > 0) {
          const body: OpenTicketsConflict = {
            statusCode: HttpStatus.CONFLICT,
            message: `Remote ini masih punya ${open.length} tiket terbuka. Periksa dulu, atau konfirmasi untuk tetap membuat tiket baru.`,
            openTickets: await summaries(m, open),
          };
          throw new ConflictException(body);
        }
      }

      const jarkom = await m.getRepository(JarkomEntity).findOneByOrFail({ id: remote.jarkomId });
      const period = ticketPeriod(new Date());
      const sequence = await nextSequence(m, tenant.id, jarkom.id, period);
      const saved = await m.getRepository(TicketEntity).save({
        tenantId: tenant.id,
        remoteId: remote.id,
        number: formatTicketNumber('NPR', jarkom.code, tenant.code, period, sequence),
        categoryId: category.id,
        systemId: input.systemId,
        occurredAt: input.occurredAt,
        problem: input.problem,
        createdById: userId,
      });
      // Entri pertama linimasa: tiket dibuat dengan status Terbuka.
      await m.getRepository(TicketActionEntity).save({
        tenantId: tenant.id,
        ticketId: saved.id,
        occurredAt: new Date(),
        statusTo: 'terbuka',
        createdById: userId,
      });
      return saved.id;
    });
    return this.get(access, id);
  }

  /**
   * Satu halaman daftar tiket yang boleh dilihat, terbaru menurut waktu kejadian (T56), beserta
   * jumlah per tampilan antrean dengan saringan dan pencarian yang sama. Jumlah antrean hanya
   * membaca tiket aktif (indeks status); total Selesai/Semua dihitung hanya saat dibuka. Tabel
   * remote hanya digabung untuk saringan jarkom (T58).
   */
  async list(
    access: TenantAccess,
    userId: string,
    query: ParsedTicketListQuery,
    pageSize = TICKET_PAGE_SIZE,
  ): Promise<TicketListResponse> {
    const params = { activeStatuses: [...ACTIVE_TICKET_STATUSES], me: userId };
    const filtered = () => {
      const qb = this.tickets.query(access, 't');
      if (query.jarkomId) qb.innerJoin('Remote', 'r', 'r.id = t.remoteId');
      if (query.q) {
        // Dua pencarian terpisah agar masing-masing memakai indeks trigramnya (nomor tiket, teks
        // remote), lalu digabung. Hasilnya tetap dibatasi filter tenant query luar (T58).
        qb.andWhere(
          `t.id IN (SELECT ts.id FROM tickets ts WHERE ${TICKET_SEARCH_EXPRESSION('ts')} ILIKE :q ` +
            `UNION SELECT tr.id FROM tickets tr JOIN remotes rs ON rs.id = tr.remote_id ` +
            `WHERE ${REMOTE_SEARCH_EXPRESSION('rs')} ILIKE :q)`,
          { q: likePattern(query.q) },
        );
      }
      if (query.tenantId) qb.andWhere('t.tenantId = :tenantId', { tenantId: query.tenantId });
      if (query.categoryId) qb.andWhere('t.categoryId = :categoryId', { categoryId: query.categoryId });
      if (query.systemId) qb.andWhere('t.systemId = :systemId', { systemId: query.systemId });
      if (query.jarkomId) qb.andWhere('r.jarkomId = :jarkomId', { jarkomId: query.jarkomId });
      return qb;
    };

    const countQuery = filtered().andWhere(VIEW_CONDITIONS.aktif!, params).select('COUNT(*)', 'aktif');
    for (const view of TICKET_QUEUE_VIEWS.filter((v) => v !== 'aktif')) {
      countQuery.addSelect(`COUNT(*) FILTER (WHERE ${VIEW_CONDITIONS[view]})`, view);
    }
    countQuery.setParameters(params);
    const raw = (await countQuery.getRawOne<Record<TicketQueueView, string>>())!;
    const counts = Object.fromEntries(TICKET_QUEUE_VIEWS.map((v) => [v, Number(raw[v])])) as Record<
      TicketQueueView,
      number
    >;

    const page = filtered();
    const condition = VIEW_CONDITIONS[query.view];
    if (condition) page.andWhere(condition, params);
    const total = isQueueView(query.view) ? counts[query.view] : await page.clone().getCount();
    const rows = await page
      .orderBy('t.occurredAt', 'DESC')
      .addOrderBy('t.id', 'DESC')
      .offset((query.page - 1) * pageSize)
      .limit(pageSize)
      .getMany();
    return {
      items: await listItems(this.dataSource.manager, rows),
      total,
      page: query.page,
      pageSize,
      counts,
    };
  }

  /** 404 juga untuk tiket customer lain (T27). */
  async get(access: TenantAccess, id: string): Promise<TicketDetail> {
    const ticket = await this.tickets.query(access, 't').andWhere('t.id = :id', { id }).getOne();
    if (!ticket) throw notFound('Tiket tidak ditemukan.');
    const m = this.dataSource.manager;
    const remote = await m.getRepository(RemoteEntity).findOneByOrFail({ id: ticket.remoteId });
    const [summary] = await summaries(m, [ticket]);
    const [jarkom, system, creator] = await Promise.all([
      m.getRepository(JarkomEntity).findOneByOrFail({ id: remote.jarkomId }),
      ticket.systemId ? m.getRepository(SystemEntity).findOneByOrFail({ id: ticket.systemId }) : null,
      m.getRepository(UserEntity).findOneByOrFail({ id: ticket.createdById }),
    ]);
    return {
      ...summary!,
      remote: {
        id: remote.id,
        siteId: remote.siteId,
        name: remote.name,
        city: remote.city,
        province: remote.province,
        timeZone: remote.timeZone,
        status: remote.status,
      },
      jarkom: ref(jarkom),
      system: system ? ref(system) : null,
      problem: ticket.problem,
      createdBy: { id: creator.id, displayName: creator.displayName },
      customerTicketNumber: ticket.customerTicketNumber,
      pending:
        ticket.pendingParty && ticket.pendingReason
          ? { party: ticket.pendingParty, reason: ticket.pendingReason }
          : null,
    };
  }

  /** Tiket yang belum ditutup pada satu remote (terbaru dulu), untuk peringatan di form "Buat tiket". */
  async openForRemote(access: TenantAccess, remoteId: string): Promise<TicketSummary[]> {
    const remote = await new TenantScopedRepository(this.dataSource.getRepository(RemoteEntity), 'tenantId')
      .query(access, 'r')
      .andWhere('r.id = :id', { id: remoteId })
      .getOne();
    if (!remote) throw notFound('Remote tidak ditemukan.');
    const open = await this.dataSource.getRepository(TicketEntity).find({
      where: { remoteId: remote.id, closedAt: IsNull() },
      order: { createdAt: 'DESC' },
    });
    return summaries(this.dataSource.manager, open);
  }
}

/**
 * Menaikkan penghitung nomor dan mengembalikan nilainya. SQL mentah karena ORM tidak bisa
 * menyatakan "tambah satu saat bentrok lalu kembalikan nilainya". INSERT ... ON CONFLICT
 * mengunci baris penghitung sampai transaksi selesai, jadi operator lain menunggu giliran.
 */
async function nextSequence(m: EntityManager, tenantId: string, jarkomId: string, period: string): Promise<number> {
  const rows: Array<{ last_value: number }> = await m.query(
    `INSERT INTO ticket_sequences (kind, tenant_id, jarkom_id, period, last_value)
     VALUES ('NPR', $1, $2, $3, 1)
     ON CONFLICT (kind, tenant_id, jarkom_id, period)
     DO UPDATE SET last_value = ticket_sequences.last_value + 1
     RETURNING last_value`,
    [tenantId, jarkomId, period],
  );
  return rows[0]!.last_value;
}

/**
 * Baris daftar untuk tiket yang sudah lolos filter tenant: remote, system, pembuat, dan
 * tindakan terakhir, dengan satu query per jenis untuk semua tiket.
 */
async function listItems(m: EntityManager, tickets: Ticket[]): Promise<TicketListItem[]> {
  if (tickets.length === 0) return [];
  const ticketIds = tickets.map((t) => t.id);
  const lastActions: Array<{
    ticket_id: string;
    occurred_at: Date;
    created_by: string;
    status_to: TicketStatus | null;
    note: string | null;
  }> = await m.query(
    `SELECT DISTINCT ON (ticket_id) ticket_id, occurred_at, created_by, status_to, left(note, $2) AS note
     FROM ticket_actions WHERE ticket_id = ANY($1)
     ORDER BY ticket_id, date_trunc('minute', occurred_at) DESC, created_at DESC`,
    [ticketIds, TICKET_LIST_NOTE_EXCERPT],
  );
  const systemIds = [...new Set(tickets.map((t) => t.systemId).filter((id): id is string => id !== null))];
  const userIds = [...new Set([...tickets.map((t) => t.createdById), ...lastActions.map((a) => a.created_by)])];
  const [summaryList, remotes, systems, users] = await Promise.all([
    summaries(m, tickets),
    m.getRepository(RemoteEntity).findBy({ id: In([...new Set(tickets.map((t) => t.remoteId))]) }),
    systemIds.length > 0 ? m.getRepository(SystemEntity).findBy({ id: In(systemIds) }) : [],
    m.getRepository(UserEntity).findBy({ id: In(userIds) }),
  ]);
  const remoteById = new Map(remotes.map((r) => [r.id, r]));
  const systemById = new Map(systems.map((s) => [s.id, ref(s)]));
  const userById = new Map(users.map((u) => [u.id, { id: u.id, displayName: u.displayName }]));
  const lastByTicket = new Map(lastActions.map((a) => [a.ticket_id, a]));
  return tickets.map((t, i) => {
    const remote = remoteById.get(t.remoteId)!;
    const last = lastByTicket.get(t.id);
    return {
      ...summaryList[i]!,
      remote: { id: remote.id, siteId: remote.siteId, name: remote.name, city: remote.city, timeZone: remote.timeZone },
      system: t.systemId ? (systemById.get(t.systemId) ?? null) : null,
      customerTicketNumber: t.customerTicketNumber,
      pending: t.pendingParty && t.pendingReason ? { party: t.pendingParty, reason: t.pendingReason } : null,
      createdBy: userById.get(t.createdById)!,
      lastAction: last
        ? {
            occurredAt: new Date(last.occurred_at).toISOString(),
            createdBy: userById.get(last.created_by)!,
            statusTo: last.status_to,
            note: last.note,
          }
        : null,
    };
  });
}

/** Ringkasan tiket dengan customer dan kategorinya, dalam dua query untuk semua tiket. */
async function summaries(m: EntityManager, tickets: Ticket[]): Promise<TicketSummary[]> {
  if (tickets.length === 0) return [];
  const [tenants, categories] = await Promise.all([
    m.getRepository(TenantEntity).findBy({ id: In([...new Set(tickets.map((t) => t.tenantId))]) }),
    m.getRepository(TicketCategoryEntity).findBy({ id: In([...new Set(tickets.map((t) => t.categoryId))]) }),
  ]);
  const tenantById = new Map<string, TenantRef>(tenants.map((t) => [t.id, ref(t)]));
  const categoryById = new Map<string, MasterRef>(categories.map((c) => [c.id, ref(c)]));
  return tickets.map((t) => ({
    id: t.id,
    number: t.number,
    status: t.status,
    tenant: tenantById.get(t.tenantId)!,
    category: categoryById.get(t.categoryId)!,
    occurredAt: t.occurredAt.toISOString(),
    createdAt: t.createdAt.toISOString(),
  }));
}

function ref({ id, code, name }: { id: string; code: string; name: string }): MasterRef {
  return { id, code, name };
}

function notFound(message: string): NotFoundException {
  return new NotFoundException({ statusCode: HttpStatus.NOT_FOUND, message });
}
