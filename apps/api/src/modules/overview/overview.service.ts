import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  OPEN_TICKET_STATUSES,
  OVERVIEW_FREQUENT_LIMIT,
  OVERVIEW_URGENT_LIMIT,
  type Overview,
  type OverviewCount,
  type OverviewDay,
  type OverviewPeriod,
  REMOTE_REGIONS,
  type RemoteRegion,
  type RemoteZone,
  type TicketStatus,
} from '@npr/shared';
import type { DataSource } from 'typeorm';
import { applyTenantScope, type TenantScope } from '../../common/tenant/tenant-scope.js';
import { remoteRegionSql } from '../remotes/remote-region.js';
import {
  type TicketQueueCriteria,
  TicketQueueService,
  toQueueFilter,
} from '../tickets/list/ticket-queue.service.js';
import { wibDateSql } from '../tickets/list/wib-day.js';
import { TroubleTicketsService } from '../trouble-tickets/trouble-tickets.service.js';

export interface OverviewInput {
  period: OverviewPeriod;
  tenantId?: string;
}

/**
 * Nama tampilan kategori yang digabung: ejaan terkecil menurut urutan byte ("Remote Down"
 * sebelum "remote down"). Tanpa `COLLATE "C"` pilihannya ikut collation database, dan berbeda
 * antara server (CI run #151: en_US memilih "remote down").
 */
const DISPLAY_NAME = 'min(c.name COLLATE "C")';

interface Clock {
  now: Date;
  today: string;
  from: string;
}

/**
 * Overview (langkah 2.1). Setiap angka dihitung dengan `TicketQueueService.matching` memakai
 * syarat yang sama dengan antrean, lalu dikelompokkan; syarat itu ikut dikirim sebagai
 * `filter`, jadi daftar yang dibuka dari angka mana pun berisi jumlah yang sama persis.
 */
@Injectable()
export class OverviewService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly queue: TicketQueueService,
    private readonly troubleTickets: TroubleTicketsService,
  ) {}

  async overview(scope: TenantScope, me: string, input: OverviewInput): Promise<Overview> {
    const clock = await this.clock(input.period);
    const base: TicketQueueCriteria = input.tenantId ? { view: 'semua', tenantId: input.tenantId } : { view: 'semua' };
    const inPeriod: TicketQueueCriteria = { ...base, status: 'semua', createdFrom: clock.from, createdTo: clock.today };
    const count = async (criteria: TicketQueueCriteria): Promise<OverviewCount> => ({
      count: (await this.queue.matching(scope, me, criteria).select('count(*)::int', 'n').getRawOne<{ n: number }>())?.n ?? 0,
      filter: toQueueFilter(criteria),
    });

    const [first, createdToday, closedToday, activeTt, byStatus, byCategory, byCustomer, regions, daily, frequent] =
      await Promise.all([
        this.queue.list(scope, me, { ...base, sort: 'mulai', page: 1, pageSize: OVERVIEW_URGENT_LIMIT }),
        count({ ...base, status: 'semua', createdFrom: clock.today, createdTo: clock.today }),
        count({ ...base, status: 'ditutup', closedFrom: clock.today, closedTo: clock.today }),
        this.troubleTickets.list(scope, { tenantId: input.tenantId, page: 1, pageSize: 1 }),
        this.byStatus(scope, me, base),
        this.byCategory(scope, me, base),
        this.byCustomer(scope, me, base),
        this.regions(scope, me, base),
        this.daily(scope, me, inPeriod, clock),
        this.frequent(scope, me, inPeriod),
      ]);

    const view = (name: TicketQueueCriteria['view']): OverviewCount => ({
      count: first.counts[name],
      filter: toQueueFilter({ ...base, view: name }),
    });
    return {
      generatedAt: clock.now.toISOString(),
      today: clock.today,
      period: { days: input.period, from: clock.from, to: clock.today },
      open: view('semua'),
      pending: view('pending'),
      escalated: view('eskalasi'),
      ready: view('siap'),
      createdToday,
      closedToday,
      activeTroubleTickets: activeTt.total,
      byStatus,
      byCategory,
      byCustomer,
      urgent: first.items,
      regions,
      daily,
      frequent,
    };
  }

  /** Jam database: sekarang, hari ini menurut WIB (T109), dan hari pertama periode. */
  private async clock(period: OverviewPeriod): Promise<Clock> {
    const [row] = (await this.dataSource.query(
      `SELECT now() AS now, ${wibDateSql('now()')} AS today, ${wibDateSql('now()', '($1::int - 1)')} AS "from"`,
      [period],
    )) as Clock[];
    if (!row) throw new Error('Jam database tidak terbaca.');
    return row;
  }

  /** NPR berjalan per status, semua status berjalan termasuk yang nol (T110). */
  private async byStatus(scope: TenantScope, me: string, base: TicketQueueCriteria): Promise<Overview['byStatus']> {
    const rows = await this.queue
      .matching(scope, me, base)
      .select('tk.status', 'status')
      .addSelect('count(*)::int', 'n')
      .groupBy('tk.status')
      .getRawMany<{ status: TicketStatus; n: number }>();
    const counts = new Map(rows.map((row) => [row.status, row.n]));
    return OPEN_TICKET_STATUSES.map((status) => ({
      status,
      count: counts.get(status) ?? 0,
      filter: toQueueFilter({ ...base, status }),
    }));
  }

  /**
   * NPR berjalan per kategori; kategori customer berbeda dengan nama sama digabung (T114).
   * Nama tampilannya ejaan terkecil menurut urutan byte (`DISPLAY_NAME`), sama di server mana pun.
   */
  private async byCategory(scope: TenantScope, me: string, base: TicketQueueCriteria): Promise<Overview['byCategory']> {
    const rows = await this.queue
      .matching(scope, me, base)
      .innerJoin('master_categories', 'c', 'c.id = tk.category_id')
      .select(DISPLAY_NAME, 'name')
      .addSelect('count(*)::int', 'n')
      .groupBy('lower(c.name)')
      .orderBy('count(*)', 'DESC')
      .addOrderBy(DISPLAY_NAME, 'ASC')
      .getRawMany<{ name: string; n: number }>();
    return rows.map((row) => ({ name: row.name, count: row.n, filter: toQueueFilter({ ...base, categoryName: row.name }) }));
  }

  private async byCustomer(scope: TenantScope, me: string, base: TicketQueueCriteria): Promise<Overview['byCustomer']> {
    const rows = await this.queue
      .matching(scope, me, base)
      .innerJoin('tenants', 't', 't.id = tk.tenant_id')
      .select('t.id', 'id')
      .addSelect('t.name', 'name')
      .addSelect('count(*)::int', 'n')
      .groupBy('t.id')
      .orderBy('count(*)', 'DESC')
      .addOrderBy('t.name', 'ASC')
      .getRawMany<{ id: string; name: string; n: number }>();
    return rows.map((row) => ({
      tenantId: row.id,
      name: row.name,
      count: row.n,
      filter: toQueueFilter({ ...base, tenantId: row.id }),
    }));
  }

  /**
   * NPR berjalan per wilayah dan jumlah remote aktif tiap wilayah (T113). Wilayah tanpa
   * remote aktif dan tanpa NPR berjalan tidak ditampilkan. Terbanyak dulu, lalu barat ke timur.
   */
  private async regions(scope: TenantScope, me: string, base: TicketQueueCriteria): Promise<Overview['regions']> {
    const region = remoteRegionSql('r.province');
    const open = await this.queue
      .matching(scope, me, base)
      .select(region, 'region')
      .addSelect('count(*)::int', 'n')
      .groupBy(region)
      .getRawMany<{ region: RemoteRegion; n: number }>();
    const remotesQuery = applyTenantScope(
      this.dataSource.createQueryBuilder().from('remotes', 'r').where('r.active'),
      scope,
      'r.tenant_id',
    );
    if (base.tenantId) remotesQuery.andWhere('r.tenant_id = :tenantId', { tenantId: base.tenantId });
    const remotes = await remotesQuery
      .select(region, 'region')
      .addSelect('count(*)::int', 'n')
      .groupBy(region)
      .getRawMany<{ region: RemoteRegion; n: number }>();

    const openBy = new Map(open.map((row) => [row.region, row.n]));
    const remotesBy = new Map(remotes.map((row) => [row.region, row.n]));
    return REMOTE_REGIONS.filter((name) => openBy.has(name) || remotesBy.has(name))
      .map((name) => ({
        region: name,
        remotes: remotesBy.get(name) ?? 0,
        count: openBy.get(name) ?? 0,
        filter: toQueueFilter({ ...base, region: name }),
      }))
      .sort((a, b) => b.count - a.count || REMOTE_REGIONS.indexOf(a.region) - REMOTE_REGIONS.indexOf(b.region));
  }

  /** NPR baru per hari (WIB) dalam periode, dipecah per kategori (T108, T109, T114). */
  private async daily(
    scope: TenantScope,
    me: string,
    inPeriod: TicketQueueCriteria,
    clock: Clock,
  ): Promise<Overview['daily']> {
    const day = wibDateSql('tk.created_at');
    const rows = await this.queue
      .matching(scope, me, inPeriod)
      .innerJoin('master_categories', 'c', 'c.id = tk.category_id')
      .select(day, 'day')
      .addSelect('lower(c.name)', 'key')
      .addSelect(DISPLAY_NAME, 'name')
      .addSelect('count(*)::int', 'n')
      .groupBy(day)
      .addGroupBy('lower(c.name)')
      .getRawMany<{ day: string; key: string; name: string; n: number }>();

    // Satu nama tampilan per kategori untuk seluruh periode; terbanyak dulu.
    const totals = new Map<string, { name: string; n: number }>();
    for (const row of rows) {
      const entry = totals.get(row.key);
      if (!entry) totals.set(row.key, { name: row.name, n: row.n });
      else totals.set(row.key, { name: row.name < entry.name ? row.name : entry.name, n: entry.n + row.n });
    }
    const keys = [...totals.entries()]
      .sort(([, a], [, b]) => b.n - a.n || a.name.localeCompare(b.name, 'id'))
      .map(([key]) => key);
    const counts = new Map(rows.map((row) => [`${row.day}|${row.key}`, row.n]));

    const days: OverviewDay[] = datesBetween(clock.from, clock.today).map((date) => {
      const ofDay: TicketQueueCriteria = { ...inPeriod, createdFrom: date, createdTo: date };
      const categories = keys.map((key) => ({
        count: counts.get(`${date}|${key}`) ?? 0,
        filter: toQueueFilter({ ...ofDay, categoryName: totals.get(key)?.name ?? key }),
      }));
      return {
        date,
        total: { count: categories.reduce((sum, item) => sum + item.count, 0), filter: toQueueFilter(ofDay) },
        categories,
      };
    });
    return { categories: keys.map((key) => totals.get(key)?.name ?? key), days };
  }

  /** Remote dengan NPR terbanyak dalam periode, termasuk yang sudah Ditutup (T112). */
  private async frequent(scope: TenantScope, me: string, inPeriod: TicketQueueCriteria): Promise<Overview['frequent']> {
    const rows = await this.queue
      .matching(scope, me, inPeriod)
      .innerJoin('tenants', 't', 't.id = tk.tenant_id')
      .select('r.id', 'id')
      .addSelect('r.code', 'code')
      .addSelect('r.name', 'name')
      .addSelect('r.city', 'city')
      .addSelect('r.time_zone', 'zone')
      .addSelect('t.name', 'customer_name')
      .addSelect('count(*)::int', 'n')
      .groupBy('r.id')
      .addGroupBy('t.id')
      .orderBy('count(*)', 'DESC')
      .addOrderBy('max(tk.created_at)', 'DESC')
      .addOrderBy('r.code', 'ASC')
      .limit(OVERVIEW_FREQUENT_LIMIT)
      .getRawMany<{
        id: string;
        code: string;
        name: string;
        city: string | null;
        zone: RemoteZone;
        customer_name: string;
        n: number;
      }>();
    return rows.map((row) => ({
      remote: { id: row.id, code: row.code, name: row.name, city: row.city, zone: row.zone, customerName: row.customer_name },
      count: row.n,
      filter: toQueueFilter({ ...inPeriod, remoteId: row.id }),
    }));
  }
}

/** Tanggal `YYYY-MM-DD` dari `from` sampai `to`, termasuk keduanya. */
function datesBetween(from: string, to: string): string[] {
  const dates: string[] = [];
  for (let day = new Date(`${from}T00:00:00Z`); ; day.setUTCDate(day.getUTCDate() + 1)) {
    const date = day.toISOString().slice(0, 10);
    if (date > to) return dates;
    dates.push(date);
  }
}
