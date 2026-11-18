import { BadRequestException, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import {
  type MasterRef,
  type NprReportFigures,
  type NprReportGroup,
  type NprReportResponse,
  type NprReportRow,
  REPLACED_PARTS,
  REPORT_EXPORT_MAX_ROWS,
  REPORT_PAGE_SIZE,
  type ReplacedPart,
  type TicketStatus,
} from '@tyio/shared';
import { DataSource, In, type ObjectLiteral, type QueryRunner, type SelectQueryBuilder } from 'typeorm';
import type { TenantAccess } from '../../common/tenant/tenant-access.js';
import { JarkomEntity, TicketCategoryEntity } from '../master/master.entities.js';
import { TenantEntity } from '../tenants/tenant.entity.js';
import { TicketsService, VIEW_CONDITIONS, viewParams } from '../tickets/tickets.service.js';
import type { ParsedReportQuery } from './report-query.js';

/** Lama gangguan dalam menit, dari menit yang tampil (detik diabaikan, T78). */
const DURATION = `EXTRACT(EPOCH FROM date_trunc('minute', t.closed_at) - date_trunc('minute', t.occurred_at)) / 60`;
/** Baris yang dibaca dari cursor ekspor sekali jalan. */
const EXPORT_BATCH = 500;

interface FiguresRaw {
  total: string;
  closed: string;
  active: string;
  withTt: string;
  avg: string | null;
  median: string | number | null;
}

interface RowRaw {
  id: string;
  number: string;
  tt_number: string | null;
  customer_ticket_number: string | null;
  tenant: string;
  site_id: string;
  remote: string;
  city: string;
  category: string;
  jarkom: string;
  status: TicketStatus;
  occurred_at: Date;
  closed_at: Date | null;
  duration: string | null;
  problem: string;
  close_note: string | null;
  replaced_parts: ReplacedPart[] | null;
}

/** Penulis berkas ekspor: dipanggil setelah semua pemeriksaan lolos, dalam snapshot yang sama. */
export type ReportExportWriter = (
  report: NprReportResponse,
  names: ReportFilterNames,
  rows: AsyncIterable<NprReportRow[]>,
) => Promise<void>;

export interface ReportFilterNames {
  tenant?: string;
  category?: string;
  jarkom?: string;
}

/**
 * Laporan rekap NPR (4.2): semua angka dari query dasar daftar Tiket (`filteredQuery`), jadi
 * sama persis dengan daftar yang dituju tautannya; dibatasi customer seperti daftar.
 */
@Injectable()
export class ReportsService {
  /** Batas ekspor: baris per berkas dan unduhan yang berjalan bersamaan (masing-masing memegang satu koneksi database). */
  readonly exportLimits = { rows: REPORT_EXPORT_MAX_ROWS, concurrent: 2 };
  private exporting = 0;

  constructor(
    private readonly dataSource: DataSource,
    private readonly tickets: TicketsService,
  ) {}

  async report(access: TenantAccess, query: ParsedReportQuery, runner?: QueryRunner): Promise<NprReportResponse> {
    // Tanpa snapshot: bagian-bagian dibaca bersamaan dari pool. Dalam snapshot ekspor: berurutan,
    // karena semuanya memakai satu koneksi.
    const parts = [
      () =>
        this.figures(this.base(access, query, runner).select([]))
          .getRawOne<FiguresRaw>()
          .then((r) => toFigures(r!)),
      () => this.groups(access, query, 'tenant_id', TenantEntity, runner),
      () => this.groups(access, query, 'category_id', TicketCategoryEntity, runner),
      () => this.parts(access, query, runner),
      () => this.topRemotes(access, query, runner),
      // Ekspor menulis semua baris dari cursor; halaman tidak perlu dibaca.
      () => (runner ? Promise.resolve([]) : this.page(access, query)),
    ] as const;
    const results = runner ? [] : await Promise.all(parts.map((read) => read()));
    if (runner) for (const read of parts) results.push(await read());
    const [summary, byCustomer, byCategory, replaced, topRemotes, items] = results as [
      NprReportFigures,
      NprReportGroup[],
      NprReportGroup[],
      NprReportResponse['parts'],
      NprReportResponse['topRemotes'],
      NprReportRow[],
    ];
    return {
      from: query.from,
      to: query.to,
      summary,
      byCustomer,
      byCategory,
      parts: replaced,
      topRemotes,
      items,
      page: query.page,
      pageSize: REPORT_PAGE_SIZE,
    };
  }

  /**
   * Ekspor: rekap dan semua baris dibaca dalam satu snapshot (REPEATABLE READ, hanya baca), jadi
   * jumlah di lembar rekap selalu sama dengan banyak baris daftar walau ada NPR baru selama
   * unduhan. Baris dibaca bertahap lewat cursor database; `write` menulis berkas sambil membaca.
   * Ditolak sebelum berkas dimulai bila terlalu banyak baris atau terlalu banyak unduhan berjalan.
   */
  async export(access: TenantAccess, query: ParsedReportQuery, write: ReportExportWriter): Promise<void> {
    if (this.exporting >= this.exportLimits.concurrent) {
      throw new HttpException(
        { statusCode: HttpStatus.TOO_MANY_REQUESTS, message: 'Unduhan Excel lain sedang berjalan. Coba lagi sebentar lagi.' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    this.exporting++;
    const runner = this.dataSource.createQueryRunner();
    try {
      await runner.connect();
      await runner.startTransaction('REPEATABLE READ');
      await runner.query('SET TRANSACTION READ ONLY');
      // JIT PostgreSQL menambah ~0,4 dtk pada cursor 100 ribu baris tanpa membuatnya lebih cepat.
      await runner.query('SET LOCAL jit = off');
      const report = await this.report(access, { ...query, page: 1 }, runner);
      if (report.summary.total > this.exportLimits.rows) {
        throw new BadRequestException({
          statusCode: HttpStatus.BAD_REQUEST,
          message: `Lebih dari ${this.exportLimits.rows.toLocaleString('id-ID')} NPR dalam satu unduhan; persempit periode atau saringan.`,
        });
      }
      const names = await this.filterNames(query, runner);
      const [ids, params] = this.base(access, query).select('t.id', 'id').getQueryAndParameters();
      await runner.query(`DECLARE npr_export NO SCROLL CURSOR FOR ${detailSql(ids)}`, params);
      // Kelompok berikutnya sudah diminta dari database selagi kelompok ini ditulis.
      const fetch = () => {
        const next: Promise<RowRaw[]> = runner.query(`FETCH ${EXPORT_BATCH} FROM npr_export`);
        next.catch(() => undefined); // ditangani saat ditunggu; jangan jadi penolakan tak tertangani
        return next;
      };
      async function* batches(): AsyncGenerator<NprReportRow[]> {
        let next = fetch();
        for (;;) {
          const raw = await next;
          if (raw.length === 0) return;
          next = fetch();
          yield raw.map(toRow);
        }
      }
      await write(report, names, batches());
      await runner.commitTransaction();
    } catch (err) {
      if (runner.isTransactionActive) await runner.rollbackTransaction().catch(() => undefined);
      throw err;
    } finally {
      this.exporting--;
      await runner.release();
    }
  }

  /** NPR dalam periode dan saringan laporan (alias `t`). */
  private base(access: TenantAccess, query: ParsedReportQuery, runner?: QueryRunner): SelectQueryBuilder<ObjectLiteral> {
    const qb = this.tickets.filteredQuery(access, {
      occurredFrom: query.from,
      occurredTo: query.to,
      tenantId: query.tenantId,
      categoryId: query.categoryId,
      jarkomId: query.jarkomId,
      status: query.status === 'selesai' ? 'selesai' : undefined,
    }) as unknown as SelectQueryBuilder<ObjectLiteral>;
    if (query.status === 'aktif') qb.andWhere(VIEW_CONDITIONS.aktif!, viewParams(''));
    if (runner) qb.setQueryRunner(runner);
    return qb;
  }

  private figures<T extends ObjectLiteral>(qb: SelectQueryBuilder<T>): SelectQueryBuilder<T> {
    return qb
      .addSelect('COUNT(*)', 'total')
      .addSelect(`COUNT(*) FILTER (WHERE t.status = 'selesai')`, 'closed')
      .addSelect(`COUNT(*) FILTER (WHERE t.status <> 'selesai')`, 'active')
      .addSelect('COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM trouble_tickets x WHERE x.ticket_id = t.id))', 'withTt')
      .addSelect(`AVG(${DURATION})`, 'avg')
      .addSelect(`percentile_cont(0.5) WITHIN GROUP (ORDER BY ${DURATION})`, 'median');
  }

  /** Nama customer, kategori, dan jarkom yang dipakai saringan (untuk judul laporan). */
  private async filterNames(query: ParsedReportQuery, runner: QueryRunner): Promise<ReportFilterNames> {
    const m = runner.manager;
    const [tenant, category, jarkom] = await Promise.all([
      query.tenantId ? m.getRepository(TenantEntity).findOneBy({ id: query.tenantId }) : null,
      query.categoryId ? m.getRepository(TicketCategoryEntity).findOneBy({ id: query.categoryId }) : null,
      query.jarkomId ? m.getRepository(JarkomEntity).findOneBy({ id: query.jarkomId }) : null,
    ]);
    return { tenant: tenant?.name, category: category?.name, jarkom: jarkom?.name };
  }

  private async groups(
    access: TenantAccess,
    query: ParsedReportQuery,
    column: 'tenant_id' | 'category_id',
    entity: typeof TenantEntity | typeof TicketCategoryEntity,
    runner?: QueryRunner,
  ): Promise<NprReportGroup[]> {
    const raw = await this.figures(this.base(access, query, runner).select(`t.${column}`, 'id'))
      .groupBy(`t.${column}`)
      .getRawMany<FiguresRaw & { id: string }>();
    if (raw.length === 0) return [];
    const refs = await (runner?.manager ?? this.dataSource.manager)
      .getRepository(entity)
      .findBy({ id: In(raw.map((r) => r.id)) });
    const byId = new Map(refs.map((r) => [r.id, r]));
    return raw
      .map((r) => {
        const row = byId.get(r.id)!;
        return { ref: { id: row.id, code: row.code, name: row.name } satisfies MasterRef, ...toFigures(r) };
      })
      .sort((a, b) => b.total - a.total || a.ref.name.localeCompare(b.ref.name, 'id'));
  }

  private async parts(access: TenantAccess, query: ParsedReportQuery, runner?: QueryRunner): Promise<NprReportResponse['parts']> {
    const [ids, params] = this.base(access, query).select('t.id').getQueryAndParameters();
    const raw: Array<{ part: ReplacedPart; count: string }> = await (runner ?? this.dataSource).query(
      `SELECT p.part, COUNT(*) AS count
       FROM ticket_actions a CROSS JOIN LATERAL unnest(a.replaced_parts) AS p(part)
       WHERE a.action_type = 'close' AND a.ticket_id IN (${ids})
       GROUP BY p.part`,
      params,
    );
    const counts = new Map(raw.map((r) => [r.part, Number(r.count)]));
    return REPLACED_PARTS.filter((p) => counts.has(p)).map((part) => ({ part, count: counts.get(part)! }));
  }

  private async topRemotes(
    access: TenantAccess,
    query: ParsedReportQuery,
    runner?: QueryRunner,
  ): Promise<NprReportResponse['topRemotes']> {
    const raw = await this.base(access, query, runner)
      .innerJoin('Remote', 'rr', 'rr.id = t.remoteId')
      .innerJoin('Tenant', 'tn2', 'tn2.id = t.tenantId')
      .select('t.remote_id', 'id')
      .addSelect('rr.site_id', 'siteId')
      .addSelect('rr.name', 'name')
      .addSelect('tn2.name', 'tenant')
      .addSelect('COUNT(*)', 'total')
      .groupBy('t.remote_id')
      .addGroupBy('rr.site_id')
      .addGroupBy('rr.name')
      .addGroupBy('tn2.name')
      .orderBy('total', 'DESC')
      .addOrderBy('rr.site_id', 'ASC')
      .limit(10)
      .getRawMany<{ id: string; siteId: string; name: string; tenant: string; total: string }>();
    return raw.map((r) => ({ ...r, total: Number(r.total) }));
  }

  /** Satu halaman baris rinci: id halaman dipilih dulu (indeks waktu kejadian), baru dirinci. */
  private async page(access: TenantAccess, query: ParsedReportQuery): Promise<NprReportRow[]> {
    const [ids, params] = this.base(access, query)
      .select('t.id', 'id')
      .orderBy('t.occurredAt', 'DESC')
      .addOrderBy('t.id', 'DESC')
      .limit(REPORT_PAGE_SIZE)
      .offset((query.page - 1) * REPORT_PAGE_SIZE)
      .getQueryAndParameters();
    const raw: RowRaw[] = await this.dataSource.query(detailSql(ids), params);
    return raw.map(toRow);
  }
}

/**
 * Baris rinci NPR untuk id dari `ids` (query yang memilih `id`), terbaru menurut waktu kejadian,
 * dengan TT dan tindakan Close terakhir (catatan dan part hanya untuk NPR Selesai).
 */
function detailSql(ids: string): string {
  return `WITH page AS (${ids})
    SELECT t.id, t.number, tt.number AS tt_number, t.customer_ticket_number, tn.name AS tenant,
           r.site_id, r.name AS remote, r.city, c.name AS category, j.name AS jarkom, t.status,
           t.occurred_at, t.closed_at, ${DURATION} AS duration, t.problem,
           CASE WHEN t.status = 'selesai' THEN cl.note END AS close_note,
           CASE WHEN t.status = 'selesai' THEN cl.replaced_parts END AS replaced_parts
    FROM page
    JOIN tickets t ON t.id = page.id
    JOIN remotes r ON r.id = t.remote_id
    JOIN tenants tn ON tn.id = t.tenant_id
    JOIN ticket_categories c ON c.id = t.category_id
    JOIN jarkoms j ON j.id = r.jarkom_id
    LEFT JOIN trouble_tickets tt ON tt.ticket_id = t.id
    LEFT JOIN LATERAL (
      SELECT a.note, a.replaced_parts FROM ticket_actions a
      WHERE a.ticket_id = t.id AND a.action_type = 'close'
      ORDER BY a.created_at DESC, a.id DESC LIMIT 1
    ) cl ON true
    ORDER BY t.occurred_at DESC, t.id DESC`;
}

function toRow(r: RowRaw): NprReportRow {
  return {
    id: r.id,
    number: r.number,
    ttNumber: r.tt_number,
    customerTicketNumber: r.customer_ticket_number,
    tenant: r.tenant,
    siteId: r.site_id,
    remote: r.remote,
    city: r.city,
    category: r.category,
    jarkom: r.jarkom,
    status: r.status,
    occurredAt: new Date(r.occurred_at).toISOString(),
    closedAt: r.closed_at ? new Date(r.closed_at).toISOString() : null,
    durationMinutes: r.duration === null ? null : Math.round(Number(r.duration)),
    problem: r.problem,
    closeNote: r.close_note,
    replacedParts: r.replaced_parts,
  };
}

function toFigures(r: FiguresRaw): NprReportFigures {
  const minutes = (value: string | number | null) => (value === null ? null : Math.round(Number(value)));
  return {
    total: Number(r.total),
    closed: Number(r.closed),
    active: Number(r.active),
    withTt: Number(r.withTt),
    avgMinutes: minutes(r.avg),
    medianMinutes: minutes(r.median),
  };
}
