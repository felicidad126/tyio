import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type {
  RemoteDetail,
  Role,
  RemoteZone,
  TroubleTicket,
  TroubleTicketCopied,
  TroubleTicketPage,
  TroubleTicketQueueItem,
  TroubleTicketStatus,
} from '@npr/shared';
import type { DataSource, EntityManager } from 'typeorm';
import { type AuditActor, auditedTransaction } from '../../common/audit/audit-context.js';
import { applyTenantScope, type TenantScope } from '../../common/tenant/tenant-scope.js';

export const TROUBLE_TICKET_NOT_FOUND_MESSAGE = 'TT tidak ditemukan.';
export const TICKET_CLOSED_FOR_TT_MESSAGE = 'NPR ini sudah ditutup; TT tidak bisa dibuat atau dicatat.';
export const TT_CLOSE_ROLE_MESSAGE = 'TT hanya bisa ditutup L2 atau admin.';
export const TT_CLOSED_MESSAGE = 'TT ini sudah ditutup.';
export const TT_CLOSED_FOR_COPY_MESSAGE = 'TT ini sudah ditutup; ringkasannya tidak perlu diteruskan lagi ke SD.';
/** Sama dengan pesan NPR tidak ditemukan (T29): NPR di luar cakupan diperlakukan tidak ada. */
const TICKET_NOT_FOUND_MESSAGE = 'NPR tidak ditemukan.';

export interface CreateTroubleTicketInput {
  problem: string;
  contact: string | null;
}

export interface TroubleTicketFilters {
  tenantId?: string;
  q?: string;
  page: number;
  pageSize: number;
}

interface TroubleTicketRow {
  id: string;
  number: string;
  status: TroubleTicketStatus;
  problem: string;
  contact: string | null;
  created_at: Date;
  created_by: string;
  created_by_name: string;
  copied_count: number;
  last_copied_at: Date | null;
  resolution: string | null;
  closed_at: Date | null;
  closed_by: string | null;
  closed_by_name: string | null;
  closed_by_role: string | null;
}

interface QueueRow extends TroubleTicketRow {
  ticket_id: string;
  ticket_number: string;
  tenant_id: string;
  customer_name: string;
  remote_id: string;
  remote_code: string;
  remote_name: string;
  remote_city: string | null;
  remote_zone: RemoteZone;
}

/** Kolom TT beserta jumlah salin ringkasan (K25), untuk halaman NPR dan daftar TT. */
const TT_COLUMNS = `
  tt.id, tt.number, tt.status, tt.problem, tt.contact, tt.created_at, tt.created_by, u.name AS created_by_name,
  tt.resolution, tt.closed_at, tt.closed_by, closer.name AS closed_by_name, closer.role AS closed_by_role,
  (SELECT count(*)::int FROM ticket_actions a WHERE a.trouble_ticket_id = tt.id AND a.kind = 'tt_disalin') AS copied_count,
  (SELECT max(a.created_at) FROM ticket_actions a WHERE a.trouble_ticket_id = tt.id AND a.kind = 'tt_disalin') AS last_copied_at`;

/**
 * TT ke Service Delivery (langkah 1.5b, K16, K23, K25). Semua lewat cakupan customer (T9).
 * Nomor dibuat database seperti NPR; remote dan jarkom diambil database dari NPR.
 */
@Injectable()
export class TroubleTicketsService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /** Semua peran boleh membuat TT dari NPR yang belum ditutup (T91); status NPR tetap (T90). */
  async create(scope: TenantScope, actor: AuditActor, ticketId: string, input: CreateTroubleTicketInput): Promise<string> {
    return auditedTransaction(this.dataSource, actor, async (manager) => {
      const ticket = await applyTenantScope(
        manager
          .createQueryBuilder()
          .from('tickets', 'tk')
          .select(['tk.id AS id', 'tk.tenant_id AS tenant_id', 'tk.status AS status', 'tk.remote_id AS remote_id',
            'tk.network_id AS network_id'])
          .where('tk.id = :ticketId', { ticketId })
          .setLock('pessimistic_write', undefined, ['tk']),
        scope,
        'tk.tenant_id',
      ).getRawOne<{ id: string; tenant_id: string; status: string; remote_id: string; network_id: string }>();
      if (!ticket) throw new NotFoundException(TICKET_NOT_FOUND_MESSAGE);
      if (ticket.status === 'ditutup') throw new BadRequestException(TICKET_CLOSED_FOR_TT_MESSAGE);

      const [created] = (await manager.query(
        `INSERT INTO trouble_tickets (tenant_id, ticket_id, remote_id, network_id, problem, contact, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [ticket.tenant_id, ticket.id, ticket.remote_id, ticket.network_id, input.problem, input.contact, actor.userId],
      )) as Array<{ id: string }>;
      if (!created) throw new Error('TT gagal disimpan.');
      return created.id;
    });
  }

  /**
   * TT sebuah NPR untuk halaman NPR. Dipanggil setelah NPR terbukti ada dalam cakupan;
   * ringkasan memakai data remote dan customer yang sudah dibaca halaman NPR.
   */
  async forTicket(
    ticket: { id: string; number: string; customerName: string; remote: RemoteDetail },
  ): Promise<TroubleTicket[]> {
    const rows = (await this.dataSource.query(
      `SELECT ${TT_COLUMNS} FROM trouble_tickets tt JOIN users u ON u.id = tt.created_by
         LEFT JOIN users closer ON closer.id = tt.closed_by
        WHERE tt.ticket_id = $1 ORDER BY tt.created_at, tt.number`,
      [ticket.id],
    )) as TroubleTicketRow[];
    return rows.map((row) => ({
      id: row.id,
      number: row.number,
      status: row.status,
      problem: row.problem,
      contact: row.contact,
      createdAt: row.created_at.toISOString(),
      createdBy: { id: row.created_by, name: row.created_by_name },
      copiedCount: row.copied_count,
      lastCopiedAt: row.last_copied_at?.toISOString() ?? null,
      summary: troubleTicketSummary({
        number: row.number,
        ticketNumber: ticket.number,
        customerName: ticket.customerName,
        remote: ticket.remote,
        problem: row.problem,
        contact: row.contact,
      }),
      closure:
        row.resolution && row.closed_at && row.closed_by
          ? {
              resolution: row.resolution,
              closedAt: row.closed_at.toISOString(),
              closedBy: { id: row.closed_by, name: row.closed_by_name ?? '', role: row.closed_by_role ?? '' },
            }
          : null,
    }));
  }

  /**
   * Ringkasan TT disalin untuk SD (K25): dicatat di linimasa NPR setiap kali. NPR yang sudah
   * ditutup (T74) dan TT yang sudah ditutup tidak menerima entri.
   */
  async markCopied(scope: TenantScope, actor: AuditActor, id: string): Promise<TroubleTicketCopied> {
    return auditedTransaction(this.dataSource, actor, async (manager) => {
      const tt = await lockedTroubleTicket(manager, scope, id);
      if (tt.ticket_status === 'ditutup') throw new BadRequestException(TICKET_CLOSED_FOR_TT_MESSAGE);
      if (tt.status === 'ditutup') throw new BadRequestException(TT_CLOSED_FOR_COPY_MESSAGE);

      await manager.query(
        `INSERT INTO ticket_actions (tenant_id, ticket_id, kind, note, occurred_at, trouble_ticket_id, created_by)
         VALUES ($1, $2, 'tt_disalin', $3, now(), $4, $5)`,
        [tt.tenant_id, tt.ticket_id, `Ringkasan TT disalin untuk SD: ${tt.number}.`, tt.id, actor.userId],
      );
      const [stats] = (await manager.query(
        `SELECT count(*)::int AS copied_count, max(created_at) AS last_copied_at FROM ticket_actions
          WHERE trouble_ticket_id = $1 AND kind = 'tt_disalin'`,
        [tt.id],
      )) as Array<{ copied_count: number; last_copied_at: Date }>;
      return { copiedCount: stats?.copied_count ?? 0, lastCopiedAt: (stats?.last_copied_at ?? new Date()).toISOString() };
    });
  }

  /**
   * Tutup TT (langkah 1.6): hanya L2/admin (K21), dengan hasil kunjungan / penyelesaian wajib
   * (T100). Dicatat sebagai entri `tt_ditutup` di linimasa NPR-nya; database mengisi status
   * dan isian penutupan TT dari entri itu. Mengembalikan id NPR.
   */
  async close(scope: TenantScope, actor: AuditActor, role: Role, id: string, resolution: string): Promise<string> {
    return auditedTransaction(this.dataSource, actor, async (manager) => {
      const tt = await lockedTroubleTicket(manager, scope, id);
      if (role === 'l1') throw new ForbiddenException(TT_CLOSE_ROLE_MESSAGE);
      if (tt.status === 'ditutup') throw new BadRequestException(TT_CLOSED_MESSAGE);
      if (tt.ticket_status === 'ditutup') throw new BadRequestException(TICKET_CLOSED_FOR_TT_MESSAGE);

      await manager.query(
        `INSERT INTO ticket_actions (tenant_id, ticket_id, kind, note, occurred_at, trouble_ticket_id, created_by)
         VALUES ($1, $2, 'tt_ditutup', $3, now(), $4, $5)`,
        [tt.tenant_id, tt.ticket_id, resolution, tt.id, actor.userId],
      );
      return tt.ticket_id;
    });
  }

  /** TT aktif (belum ditutup), terlama dulu: daftar terpisah dari antrean NPR. */
  async list(scope: TenantScope, filters: TroubleTicketFilters): Promise<TroubleTicketPage> {
    const query = applyTenantScope(
      this.dataSource
        .createQueryBuilder()
        .from('trouble_tickets', 'tt')
        .innerJoin('tickets', 'tk', 'tk.id = tt.ticket_id')
        .innerJoin('remotes', 'r', 'r.id = tt.remote_id')
        .where(`tt.status <> 'ditutup'`),
      scope,
      'tt.tenant_id',
    );
    if (filters.tenantId) query.andWhere('tt.tenant_id = :tenantId', { tenantId: filters.tenantId });
    if (filters.q) {
      // Huruf %, _, dan \ di kata kunci dicari apa adanya, bukan sebagai pola.
      const pattern = `%${filters.q.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
      query.andWhere(
        '(tt.number ILIKE :pattern OR tk.number ILIKE :pattern OR r.code ILIKE :pattern OR r.name ILIKE :pattern)',
        { pattern },
      );
    }
    const total = await query.clone().select('count(*)::int', 'total').getRawOne<{ total: number }>();
    const ids = await query
      .select('tt.id AS id')
      .orderBy('tt.created_at', 'ASC')
      .addOrderBy('tt.number', 'ASC')
      .offset((filters.page - 1) * filters.pageSize)
      .limit(filters.pageSize)
      .getRawMany<{ id: string }>();

    let items: TroubleTicketQueueItem[] = [];
    if (ids.length > 0) {
      const rows = (await this.dataSource.query(
        `SELECT ${TT_COLUMNS}, tk.id AS ticket_id, tk.number AS ticket_number, tt.tenant_id, t.name AS customer_name,
                r.id AS remote_id, r.code AS remote_code, r.name AS remote_name, r.city AS remote_city,
                r.time_zone AS remote_zone
           FROM trouble_tickets tt
           JOIN users u ON u.id = tt.created_by
           LEFT JOIN users closer ON closer.id = tt.closed_by
           JOIN tickets tk ON tk.id = tt.ticket_id
           JOIN tenants t ON t.id = tt.tenant_id
           JOIN remotes r ON r.id = tt.remote_id
          WHERE tt.id = ANY($1::uuid[])`,
        [ids.map((row) => row.id)],
      )) as QueueRow[];
      const byId = new Map(rows.map((row) => [row.id, row]));
      items = ids.flatMap(({ id }) => {
        const row = byId.get(id);
        return row ? [toQueueItem(row)] : [];
      });
    }
    return { items, total: total?.total ?? 0, page: filters.page, pageSize: filters.pageSize };
  }
}

interface LockedTroubleTicket {
  id: string;
  number: string;
  status: TroubleTicketStatus;
  ticket_id: string;
  tenant_id: string;
  ticket_status: string;
}

/**
 * TT dalam cakupan beserta status NPR-nya, dibaca setelah baris NPR lalu baris TT dikunci
 * (urutan kunci sama dengan trigger linimasa, jadi tidak saling menunggu).
 */
async function lockedTroubleTicket(manager: EntityManager, scope: TenantScope, id: string): Promise<LockedTroubleTicket> {
  const found = await applyTenantScope(
    manager.createQueryBuilder().from('trouble_tickets', 'tt').select('tt.ticket_id AS ticket_id').where('tt.id = :id', { id }),
    scope,
    'tt.tenant_id',
  ).getRawOne<{ ticket_id: string }>();
  if (!found) throw new NotFoundException(TROUBLE_TICKET_NOT_FOUND_MESSAGE);
  const [ticket] = (await manager.query('SELECT status FROM tickets WHERE id = $1 FOR UPDATE', [found.ticket_id])) as Array<{
    status: string;
  }>;
  const [tt] = (await manager.query(
    'SELECT id, number, status, ticket_id, tenant_id FROM trouble_tickets WHERE id = $1 FOR UPDATE',
    [id],
  )) as Array<Omit<LockedTroubleTicket, 'ticket_status'>>;
  if (!ticket || !tt) throw new NotFoundException(TROUBLE_TICKET_NOT_FOUND_MESSAGE);
  return { ...tt, ticket_status: ticket.status };
}

function toQueueItem(row: QueueRow): TroubleTicketQueueItem {
  return {
    id: row.id,
    number: row.number,
    status: row.status,
    ticket: { id: row.ticket_id, number: row.ticket_number },
    tenantId: row.tenant_id,
    customerName: row.customer_name,
    remote: { id: row.remote_id, code: row.remote_code, name: row.remote_name, city: row.remote_city, zone: row.remote_zone },
    problem: row.problem,
    createdAt: row.created_at.toISOString(),
    createdByName: row.created_by_name,
    copiedCount: row.copied_count,
    lastCopiedAt: row.last_copied_at?.toISOString() ?? null,
  };
}

/**
 * Teks siap tempel ke chat SD (K25, mockup DetailTiket): no. TT dan NPR, remote, lokasi
 * dengan zona waktu, problem jarkom, dan kontak di lokasi.
 */
export function troubleTicketSummary(input: {
  number: string;
  ticketNumber: string;
  customerName: string;
  remote: Pick<RemoteDetail, 'code' | 'name' | 'address' | 'city' | 'province' | 'zone'>;
  problem: string;
  contact: string | null;
}): string {
  const { remote } = input;
  const address = remote.address ?? '';
  const place = [address, ...[remote.city, remote.province].filter((part) => part && !address.includes(part))]
    .filter(Boolean)
    .join(', ');
  return [
    `${input.number} (${input.ticketNumber})`,
    `Remote: ${remote.name}, ${input.customerName} (${remote.code})`,
    `Lokasi: ${place || 'alamat belum diisi'} · ${remote.zone}`,
    `Problem: ${input.problem}`,
    `Kontak: ${input.contact ?? 'belum ada'}`,
  ].join('\n');
}
