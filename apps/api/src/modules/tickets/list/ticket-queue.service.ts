import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  OPEN_TICKET_STATUSES,
  PENDING_TICKET_STATUSES,
  type RemoteRegion,
  type RemoteZone,
  TICKET_QUEUE_STATUS_ALL,
  TICKET_QUEUE_VIEWS,
  type TicketActionKind,
  type TicketQueueFilter,
  type TicketQueueItem,
  type TicketQueuePage,
  type TicketQueueSort,
  type TicketQueueStatusFilter,
  type TicketQueueView,
  type TicketStatus,
} from '@npr/shared';
import type { DataSource, ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import { applyTenantScope, type TenantScope } from '../../../common/tenant/tenant-scope.js';
import { remoteRegionSql } from '../../remotes/remote-region.js';
import { wibDayStartSql } from './wib-day.js';

/**
 * Syarat antrean (tampilan + saringan) tanpa urutan dan halaman; id berformat UUID huruf kecil.
 * Overview (2.1) menghitung angkanya dengan syarat yang sama (`matching`).
 */
export interface TicketQueueCriteria {
  view: TicketQueueView;
  tenantId?: string;
  categoryId?: string;
  /** Nama kategori tanpa membedakan huruf besar/kecil, di semua customer (T114). */
  categoryName?: string;
  systemId?: string;
  status?: TicketQueueStatusFilter;
  remoteId?: string;
  region?: RemoteRegion;
  q?: string;
  /** Tanggal `YYYY-MM-DD` menurut WIB (T109), termasuk. */
  createdFrom?: string;
  createdTo?: string;
  closedFrom?: string;
  closedTo?: string;
}

/** Saringan antrean yang sudah dibaca controller. */
export interface TicketQueueFilters extends TicketQueueCriteria {
  sort: TicketQueueSort;
  page: number;
  pageSize: number;
}

/** Saringan yang memuat NPR Ditutup di "Semua terbuka": status apa pun, atau tanggal ditutup. */
export function includesClosed(filters: Pick<TicketQueueCriteria, 'status' | 'closedFrom' | 'closedTo'>): boolean {
  return filters.status !== undefined || filters.closedFrom !== undefined || filters.closedTo !== undefined;
}

/** Syarat antrean sebagai parameter `GET /api/tickets` (untuk tautan angka Overview). */
export function toQueueFilter(criteria: TicketQueueCriteria): TicketQueueFilter {
  const { view, ...rest } = criteria;
  const filter: TicketQueueFilter = view === 'semua' ? {} : { view };
  for (const [key, value] of Object.entries(rest) as Array<[keyof typeof rest, string | undefined]>) {
    if (value !== undefined && value !== '') Object.assign(filter, { [key]: value });
  }
  return filter;
}


interface QueueRow {
  id: string;
  number: string;
  status: TicketStatus;
  tenant_id: string;
  customer_name: string;
  category_name: string;
  system_name: string;
  customer_ticket_number: string | null;
  remote_id: string;
  remote_code: string;
  remote_name: string;
  remote_city: string | null;
  remote_zone: RemoteZone;
  started_at: Date;
  closed_at: Date | null;
  created_at: Date;
  assignee_id: string | null;
  assignee_name: string | null;
  assignee_role: string | null;
  pending_reason: string | null;
  last_kind: TicketActionKind;
  last_at: Date;
  last_by: string;
}

const ESCALATED: TicketStatus[] = ['eskalasi_l2', 'eskalasi_sd'];
const list = (values: readonly string[]) => values.map((value) => `'${value}'`).join(', ');

/**
 * Syarat SQL tiap tampilan bawaan (T82). Nilainya tetap (tidak dari masukan), aman dirangkai.
 * "Semua terbuka" tidak memuat NPR Ditutup, kecuali saringan status meminta status tertentu.
 */
function viewCondition(view: TicketQueueView, hasStatusFilter: boolean): string {
  switch (view) {
    case 'semua':
      return hasStatusFilter ? 'true' : `tk.status IN (${list(OPEN_TICKET_STATUSES)})`;
    case 'saya':
      return `tk.assignee_id = :me AND tk.status IN (${list(OPEN_TICKET_STATUSES)})`;
    case 'pending':
      return `tk.status IN (${list(PENDING_TICKET_STATUSES)})`;
    case 'eskalasi':
      return `tk.status IN (${list(ESCALATED)})`;
    case 'siap':
      return `tk.status = 'pulih'`;
  }
}

/**
 * Antrean NPR (langkah 1.5). Lewat cakupan customer pengguna (T9). Dua langkah: id satu
 * halaman (saringan, urutan, halaman), lalu detail baris itu termasuk tindakan terakhir.
 */
@Injectable()
export class TicketQueueService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async list(scope: TenantScope, me: string, filters: TicketQueueFilters): Promise<TicketQueuePage> {
    const base = () => this.filtered(scope, me, filters);

    const countSelect = TICKET_QUEUE_VIEWS.map(
      (view) => `count(*) FILTER (WHERE ${viewCondition(view, includesClosed(filters))})::int AS "${view}"`,
    ).join(', ');
    const counts = (await base().select(countSelect).getRawOne<Record<TicketQueueView, number>>()) ?? {
      semua: 0,
      saya: 0,
      pending: 0,
      eskalasi: 0,
      siap: 0,
    };

    const page = this.matching(scope, me, filters);
    if (filters.sort === 'terbaru') {
      page.orderBy('tk.created_at', 'DESC').addOrderBy('tk.id', 'DESC');
    } else {
      page.orderBy('tk.started_at', 'ASC').addOrderBy('tk.created_at', 'ASC').addOrderBy('tk.id', 'ASC');
    }
    const ids = await page
      .select('tk.id AS id')
      .offset((filters.page - 1) * filters.pageSize)
      .limit(filters.pageSize)
      .getRawMany<{ id: string }>();

    return {
      items: await this.rows(ids.map((row) => row.id)),
      total: counts[filters.view],
      page: filters.page,
      pageSize: filters.pageSize,
      counts,
    };
  }

  /**
   * NPR yang dihitung sebagai `total` antrean untuk syarat ini, tanpa urutan dan halaman.
   * Alias: `tk` (tickets), `r` (remotes). Overview mengelompokkan query ini, jadi angkanya
   * dan daftar yang dibuka dari angka itu memakai syarat yang sama persis.
   */
  matching(scope: TenantScope, me: string, criteria: TicketQueueCriteria): SelectQueryBuilder<ObjectLiteral> {
    return this.filtered(scope, me, criteria).andWhere(viewCondition(criteria.view, includesClosed(criteria)));
  }

  private filtered(scope: TenantScope, me: string, filters: TicketQueueCriteria): SelectQueryBuilder<ObjectLiteral> {
    const query = applyTenantScope(
      this.dataSource
        .createQueryBuilder()
        .from('tickets', 'tk')
        .innerJoin('remotes', 'r', 'r.id = tk.remote_id')
        .setParameter('me', me),
      scope,
      'tk.tenant_id',
    );
    if (filters.tenantId) query.andWhere('tk.tenant_id = :tenantId', { tenantId: filters.tenantId });
    if (filters.categoryId) query.andWhere('tk.category_id = :categoryId', { categoryId: filters.categoryId });
    if (filters.systemId) query.andWhere('tk.system_id = :systemId', { systemId: filters.systemId });
    if (filters.status && filters.status !== TICKET_QUEUE_STATUS_ALL) {
      query.andWhere('tk.status = :status', { status: filters.status });
    }
    if (filters.categoryName) {
      query.andWhere(
        `EXISTS (SELECT 1 FROM master_categories c WHERE c.id = tk.category_id AND lower(c.name) = lower(:categoryName))`,
        { categoryName: filters.categoryName },
      );
    }
    if (filters.remoteId) query.andWhere('tk.remote_id = :remoteId', { remoteId: filters.remoteId });
    if (filters.region) query.andWhere(`${remoteRegionSql('r.province')} = :region`, { region: filters.region });
    if (filters.createdFrom) {
      query.andWhere(`tk.created_at >= ${wibDayStartSql('createdFrom')}`, { createdFrom: filters.createdFrom });
    }
    if (filters.createdTo) query.andWhere(`tk.created_at < ${wibDayStartSql('createdTo', true)}`, { createdTo: filters.createdTo });
    if (filters.closedFrom) query.andWhere(`tk.closed_at >= ${wibDayStartSql('closedFrom')}`, { closedFrom: filters.closedFrom });
    if (filters.closedTo) query.andWhere(`tk.closed_at < ${wibDayStartSql('closedTo', true)}`, { closedTo: filters.closedTo });
    if (filters.q) {
      // Huruf %, _, dan \ di kata kunci dicari apa adanya, bukan sebagai pola.
      const pattern = `%${filters.q.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
      query.andWhere(
        `(tk.number ILIKE :pattern OR tk.customer_ticket_number ILIKE :pattern
          OR r.code ILIKE :pattern OR r.name ILIKE :pattern OR r.city ILIKE :pattern
          OR EXISTS (SELECT 1 FROM trouble_tickets tt WHERE tt.ticket_id = tk.id AND tt.number ILIKE :pattern))`,
        { pattern },
      );
    }
    return query;
  }

  /** Detail baris untuk id yang sudah lolos cakupan, dalam urutan id. */
  private async rows(ids: string[]): Promise<TicketQueueItem[]> {
    if (ids.length === 0) return [];
    const rows = (await this.dataSource.query(
      `SELECT tk.id, tk.number, tk.status, tk.tenant_id, t.name AS customer_name, c.name AS category_name,
              s.name AS system_name, tk.customer_ticket_number, r.id AS remote_id, r.code AS remote_code,
              r.name AS remote_name, r.city AS remote_city, r.time_zone AS remote_zone, tk.started_at, tk.closed_at,
              tk.created_at, tk.assignee_id, asg.name AS assignee_name, asg.role AS assignee_role,
              CASE WHEN tk.status IN (${list(PENDING_TICKET_STATUSES)}) THEN
                (SELECT a.pending_reason FROM ticket_actions a
                  WHERE a.ticket_id = tk.id AND a.status_to = tk.status
                  ORDER BY a.created_at DESC, a.seq DESC LIMIT 1)
              END AS pending_reason,
              last.kind AS last_kind, last.created_at AS last_at, last.by_name AS last_by
         FROM tickets tk
         JOIN tenants t ON t.id = tk.tenant_id
         JOIN remotes r ON r.id = tk.remote_id
         JOIN master_categories c ON c.id = tk.category_id
         JOIN master_systems s ON s.id = tk.system_id
         LEFT JOIN users asg ON asg.id = tk.assignee_id
         CROSS JOIN LATERAL (
           SELECT a.kind, a.created_at, u.name AS by_name FROM ticket_actions a JOIN users u ON u.id = a.created_by
            WHERE a.ticket_id = tk.id ORDER BY a.created_at DESC, a.seq DESC LIMIT 1) last
        WHERE tk.id = ANY($1::uuid[])`,
      [ids],
    )) as QueueRow[];
    const byId = new Map(rows.map((row) => [row.id, row]));
    return ids.flatMap((id) => {
      const row = byId.get(id);
      return row ? [toItem(row)] : [];
    });
  }
}

function toItem(row: QueueRow): TicketQueueItem {
  return {
    id: row.id,
    number: row.number,
    status: row.status,
    tenantId: row.tenant_id,
    customerName: row.customer_name,
    categoryName: row.category_name,
    systemName: row.system_name,
    customerTicketNumber: row.customer_ticket_number,
    remote: {
      id: row.remote_id,
      code: row.remote_code,
      name: row.remote_name,
      city: row.remote_city,
      zone: row.remote_zone,
    },
    startedAt: row.started_at.toISOString(),
    closedAt: row.closed_at ? row.closed_at.toISOString() : null,
    createdAt: row.created_at.toISOString(),
    assignee:
      row.assignee_id && row.assignee_name && row.assignee_role
        ? { id: row.assignee_id, name: row.assignee_name, role: row.assignee_role }
        : null,
    pendingReason: row.pending_reason,
    lastAction: { kind: row.last_kind, at: row.last_at.toISOString(), byName: row.last_by },
  };
}
