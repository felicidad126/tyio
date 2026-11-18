import { Controller, Get, HttpStatus, Query, Res } from '@nestjs/common';
import {
  type NprReportFigures,
  type NprReportResponse,
  type NprReportRow,
  REPLACED_PART_LABELS,
  REPORT_STATUS_LABELS,
  TICKET_STATUS_LABELS,
} from '@tyio/shared';
import type { Response } from 'express';
import type { TenantAccess } from '../../common/tenant/tenant-access.js';
import { CurrentTenantAccess, TenantScoped } from '../../common/tenant/tenant-policy.js';
import { RequireModule } from '../auth/auth.decorators.js';
import { type ParsedReportQuery, parseReportQuery } from './report-query.js';
import { type ReportFilterNames, ReportsService } from './reports.service.js';
import { type Cell, type Sheet, writeXlsx } from './xlsx.js';

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const FIGURE_HEADER = ['NPR', 'Selesai', 'Masih aktif', 'Dengan TT', 'Rata-rata lama (menit)', 'Median lama (menit)'];
const figureCells = (f: NprReportFigures): Cell[] => [f.total, f.closed, f.active, f.withTt, f.avgMinutes, f.medianMinutes];

/** Laporan (4.2): rekap NPR per periode, sebagai JSON untuk halaman dan sebagai berkas Excel. */
@TenantScoped()
@RequireModule('laporan')
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('npr')
  async npr(@CurrentTenantAccess() access: TenantAccess, @Query() raw: Record<string, unknown>): Promise<NprReportResponse> {
    return this.reports.report(access, parseReportQuery(raw));
  }

  /**
   * Berkas .xlsx: lembar rekap dan daftar semua NPR dalam periode (waktu dalam WIB). Dikirim
   * bertahap; kesalahan sebelum berkas dimulai dijawab JSON seperti biasa, kesalahan sesudahnya
   * memutus unduhan (berkas tidak lengkap tidak pernah tampak utuh).
   */
  @Get('npr/excel')
  async excel(
    @CurrentTenantAccess() access: TenantAccess,
    @Query() raw: Record<string, unknown>,
    @Res() res: Response,
  ): Promise<void> {
    const query = parseReportQuery(raw);
    try {
      await this.reports.export(access, query, async (report, names, rows) => {
        res.status(HttpStatus.OK).set({
          'Content-Type': XLSX_TYPE,
          'Content-Disposition': `attachment; filename="rekap-npr-${query.from}-${query.to}.xlsx"`,
          'X-Content-Type-Options': 'nosniff',
          'Cache-Control': 'private, no-store',
        });
        await writeXlsx(sheets(query, report, names, rows), (chunk) => send(res, chunk));
        res.end();
      });
    } catch (err) {
      if (!res.headersSent) throw err;
      res.destroy(err instanceof Error ? err : undefined);
    }
  }
}

function sheets(
  query: ParsedReportQuery,
  report: NprReportResponse,
  names: ReportFilterNames,
  rows: AsyncIterable<NprReportRow[]>,
): Sheet[] {
  const period = query.from === query.to ? dmy(query.from) : `${dmy(query.from)} – ${dmy(query.to)}`;
  return [
    {
      name: 'Rekap',
      widths: [32, 40],
      rows: [
        ['Laporan rekap NPR'],
        ['Periode (tanggal kejadian WIB)', period],
        ['Customer', names.tenant ?? 'Semua customer yang boleh dilihat'],
        ['Kategori', names.category ?? 'Semua kategori'],
        ['Jarkom', names.jarkom ?? 'Semua jarkom'],
        ['Status', REPORT_STATUS_LABELS[query.status]],
        ['Dibuat', new Date()],
        [],
        ['Jumlah NPR', report.summary.total],
        ['Selesai', report.summary.closed],
        ['Masih aktif', report.summary.active],
        ['Dengan TT', report.summary.withTt],
        ['Rata-rata lama gangguan (menit)', report.summary.avgMinutes],
        ['Median lama gangguan (menit)', report.summary.medianMinutes],
        [],
        ['Lama gangguan: dari waktu kejadian sampai link online lagi (waktu Close), hanya NPR Selesai.'],
      ],
    },
    {
      name: 'Per customer',
      header: ['Customer', ...FIGURE_HEADER],
      widths: [32, 10, 10, 12, 12, 22, 20],
      rows: report.byCustomer.map((g) => [g.ref.name, ...figureCells(g)]),
      table: true,
    },
    {
      name: 'Per kategori',
      header: ['Kategori', ...FIGURE_HEADER],
      widths: [32, 10, 10, 12, 12, 22, 20],
      rows: report.byCategory.map((g) => [g.ref.name, ...figureCells(g)]),
      table: true,
    },
    {
      name: 'Part diganti',
      header: ['Part', 'Jumlah'],
      widths: [20, 10],
      rows: report.parts.map((p) => [REPLACED_PART_LABELS[p.part], p.count]),
    },
    {
      name: 'Remote terbanyak',
      header: ['Site ID', 'Remote', 'Customer', 'NPR'],
      widths: [14, 32, 28, 8],
      rows: report.topRemotes.map((r) => [r.siteId, r.name, r.tenant, r.total]),
    },
    {
      name: 'Daftar NPR',
      header: [
        'No. NPR',
        'No. TT',
        'No. tiket customer',
        'Customer',
        'Site ID',
        'Remote',
        'Kota',
        'Kategori',
        'Jarkom',
        'Status',
        'Waktu kejadian (WIB)',
        'Online lagi (WIB)',
        'Lama (menit)',
        'Masalah',
        'Catatan Close',
        'Part diganti',
      ],
      widths: [26, 26, 18, 24, 12, 28, 16, 22, 12, 12, 18, 18, 12, 40, 40, 20],
      rows: mapBatches(rows, (r) => [
        r.number,
        r.ttNumber,
        r.customerTicketNumber,
        r.tenant,
        r.siteId,
        r.remote,
        r.city,
        r.category,
        r.jarkom,
        TICKET_STATUS_LABELS[r.status],
        new Date(r.occurredAt),
        r.closedAt ? new Date(r.closedAt) : null,
        r.durationMinutes,
        r.problem,
        r.closeNote,
        r.replacedParts?.map((p) => REPLACED_PART_LABELS[p]).join(', ') ?? null,
      ]),
      table: true,
    },
  ];
}

/** 2026-11-18 → 18/11/2026. */
const dmy = (date: string) => date.split('-').reverse().join('/');

async function* mapBatches<T>(batches: AsyncIterable<T[]>, map: (item: T) => Cell[]): AsyncGenerator<Cell[][]> {
  for await (const batch of batches) yield batch.map(map);
}

/** Tulis satu potongan; tunggu bila penyangga penuh, gagal bila pengunduh memutus koneksi. */
function send(res: Response, chunk: Uint8Array): Promise<void> {
  return new Promise((resolve, reject) => {
    if (res.destroyed) return reject(new Error('Unduhan diputus pengunduh.'));
    if (res.write(chunk)) return resolve();
    const done = (err?: Error) => {
      res.off('drain', onDrain);
      res.off('close', onClose);
      if (err) reject(err);
      else resolve();
    };
    const onDrain = () => done();
    const onClose = () => done(new Error('Unduhan diputus pengunduh.'));
    res.once('drain', onDrain);
    res.once('close', onClose);
  });
}
