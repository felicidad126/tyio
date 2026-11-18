import { Injectable } from '@nestjs/common';
import {
  type ActiveTicketStatus,
  addDays,
  type MasterRef,
  OVERVIEW_TOP_REMOTE_DAYS,
  OVERVIEW_TOP_REMOTES,
  OVERVIEW_TREND_DAYS,
  type OverviewResponse,
  type TenantRef,
  wibDate,
  wibDayStart,
} from '@tyio/shared';
import { DataSource, In } from 'typeorm';
import type { TenantAccess } from '../../common/tenant/tenant-access.js';
import { TicketCategoryEntity } from '../master/master.entities.js';
import { RemoteEntity } from '../remotes/remote.entity.js';
import { TenantEntity } from '../tenants/tenant.entity.js';
import { flagBefore, TicketsService, VIEW_CONDITIONS, viewParams } from '../tickets/tickets.service.js';

/** Hari WIB dari kolom waktu, sebagai teks YYYY-MM-DD (untuk mengelompokkan per hari). */
const wibDay = (column: string) => `to_char(${column} AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD')`;

/**
 * Overview (2.1): semua angka dihitung dari query dasar daftar Tiket (`filteredQuery`) dengan
 * syarat yang sama seperti tampilan dan saringan daftar, sehingga setiap angka sama persis
 * dengan jumlah di daftar yang dituju tautannya. Data dibatasi customer seperti daftar.
 */
@Injectable()
export class OverviewService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly tickets: TicketsService,
  ) {}

  async get(access: TenantAccess, userId: string, now = new Date()): Promise<OverviewResponse> {
    const today = wibDate(now);
    const params = viewParams(userId);
    const active = () => this.tickets.filteredQuery(access, {}).andWhere(VIEW_CONDITIONS.aktif!, params);

    const counts = await active()
      .select('COUNT(*)', 'total')
      .addSelect(`COUNT(*) FILTER (WHERE t.status = 'terbuka')`, 'terbuka')
      .addSelect(`COUNT(*) FILTER (WHERE t.status = 'dikerjakan')`, 'dikerjakan')
      .addSelect(`COUNT(*) FILTER (WHERE t.status = 'pending')`, 'pending')
      .addSelect(`COUNT(*) FILTER (WHERE t.status = 'eskalasi')`, 'eskalasi')
      .addSelect(`COUNT(*) FILTER (WHERE ${VIEW_CONDITIONS.tt})`, 'tt')
      .addSelect(`COUNT(*) FILTER (WHERE t.occurred_at <= :flagBefore)`, 'flagged')
      .setParameter('flagBefore', flagBefore(now))
      .getRawOne<Record<'total' | ActiveTicketStatus | 'tt' | 'flagged', string>>();

    const perColumn = (column: 'category_id' | 'tenant_id') =>
      active()
        .select(`t.${column}`, 'id')
        .addSelect('COUNT(*)', 'count')
        .groupBy(`t.${column}`)
        .getRawMany<{ id: string; count: string }>();
    const [byCategoryRaw, byCustomerRaw] = await Promise.all([perColumn('category_id'), perColumn('tenant_id')]);

    const trendFrom = addDays(today, -(OVERVIEW_TREND_DAYS - 1));
    const range = { from: wibDayStart(trendFrom), before: wibDayStart(addDays(today, 1)) };
    const perDay = (column: 'occurred_at' | 'closed_at') =>
      this.tickets
        .filteredQuery(access, {})
        .andWhere(`t.${column} >= :from AND t.${column} < :before`, range)
        .select(wibDay(`t.${column}`), 'day')
        .addSelect('COUNT(*)', 'count')
        .groupBy('day')
        .getRawMany<{ day: string; count: string }>();
    const [openedRaw, closedRaw] = await Promise.all([perDay('occurred_at'), perDay('closed_at')]);

    const topFrom = addDays(today, -(OVERVIEW_TOP_REMOTE_DAYS - 1));
    const topRaw = await this.tickets
      .filteredQuery(access, {})
      .innerJoin('Remote', 'rr', 'rr.id = t.remoteId')
      .andWhere('t.occurred_at >= :from AND t.occurred_at < :before', {
        from: wibDayStart(topFrom),
        before: range.before,
      })
      .select('t.remote_id', 'id')
      .addSelect('COUNT(*)', 'count')
      .groupBy('t.remote_id')
      .addGroupBy('rr.site_id')
      .orderBy('count', 'DESC')
      .addOrderBy('rr.site_id', 'ASC')
      .limit(OVERVIEW_TOP_REMOTES)
      .getRawMany<{ id: string; count: string }>();

    const m = this.dataSource.manager;
    const remotes = topRaw.length
      ? await m.getRepository(RemoteEntity).findBy({ id: In(topRaw.map((r) => r.id)) })
      : [];
    const tenantIds = [...new Set([...byCustomerRaw.map((r) => r.id), ...remotes.map((r) => r.tenantId)])];
    const [categories, tenants] = await Promise.all([
      byCategoryRaw.length
        ? m.getRepository(TicketCategoryEntity).findBy({ id: In(byCategoryRaw.map((r) => r.id)) })
        : [],
      tenantIds.length ? m.getRepository(TenantEntity).findBy({ id: In(tenantIds) }) : [],
    ]);
    const categoryById = new Map(categories.map((c) => [c.id, ref(c)]));
    const tenantById = new Map<string, TenantRef>(tenants.map((t) => [t.id, ref(t)]));
    const remoteById = new Map(remotes.map((r) => [r.id, r]));
    const ranked = <T extends { name: string }>(rows: Array<{ item: T; count: number }>) =>
      rows.sort((a, b) => b.count - a.count || a.item.name.localeCompare(b.item.name, 'id'));

    const openedByDay = new Map(openedRaw.map((r) => [r.day, Number(r.count)]));
    const closedByDay = new Map(closedRaw.map((r) => [r.day, Number(r.count)]));
    const c = counts!;
    return {
      generatedAt: now.toISOString(),
      today,
      active: {
        total: Number(c.total),
        byStatus: {
          terbuka: Number(c.terbuka),
          dikerjakan: Number(c.dikerjakan),
          pending: Number(c.pending),
          eskalasi: Number(c.eskalasi),
        },
        tt: Number(c.tt),
        flagged: Number(c.flagged),
      },
      byCategory: ranked(byCategoryRaw.map((r) => ({ item: categoryById.get(r.id)!, count: Number(r.count) }))).map(
        (r) => ({ category: r.item, count: r.count }),
      ),
      byCustomer: ranked(byCustomerRaw.map((r) => ({ item: tenantById.get(r.id)!, count: Number(r.count) }))).map(
        (r) => ({ tenant: r.item, count: r.count }),
      ),
      trend: Array.from({ length: OVERVIEW_TREND_DAYS }, (_, i) => {
        const date = addDays(trendFrom, i);
        return { date, opened: openedByDay.get(date) ?? 0, closed: closedByDay.get(date) ?? 0 };
      }),
      topRemotes: {
        from: topFrom,
        to: today,
        items: topRaw.map((r) => {
          const remote = remoteById.get(r.id)!;
          return {
            remote: { id: remote.id, siteId: remote.siteId, name: remote.name, city: remote.city },
            tenant: tenantById.get(remote.tenantId)!,
            count: Number(r.count),
          };
        }),
      },
    };
  }
}

function ref({ id, code, name }: { id: string; code: string; name: string }): MasterRef {
  return { id, code, name };
}
