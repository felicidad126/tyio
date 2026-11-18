import { BadRequestException, HttpStatus } from '@nestjs/common';
import {
  addDays,
  isDateString,
  REPORT_MAX_DAYS,
  REPORT_STATUS_FILTERS,
  type ReportStatusFilter,
  wibDate,
} from '@tyio/shared';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED = ['from', 'to', 'tenantId', 'categoryId', 'jarkomId', 'status', 'page'];

export interface ParsedReportQuery {
  from: string;
  to: string;
  tenantId?: string;
  categoryId?: string;
  jarkomId?: string;
  status: ReportStatusFilter;
  page: number;
}

/**
 * Parameter laporan rekap NPR. Periode menurut tanggal kejadian WIB; bawaan dari tanggal 1 bulan
 * ini sampai hari ini; paling panjang REPORT_MAX_DAYS hari. Yang tidak sah dijawab 400.
 */
export function parseReportQuery(raw: Record<string, unknown>, now = new Date()): ParsedReportQuery {
  const unknown = Object.keys(raw).find((key) => !ALLOWED.includes(key));
  if (unknown) throw invalid(`Parameter tidak dikenal: ${unknown}.`);
  const value = (key: string): string | undefined => {
    const v = raw[key];
    if (v === undefined || v === '') return undefined;
    if (typeof v !== 'string') throw invalid(`Parameter ${key} hanya boleh satu nilai.`);
    return v;
  };

  const today = wibDate(now);
  const from = value('from') ?? `${today.slice(0, 8)}01`;
  const to = value('to') ?? today;
  for (const [date, label] of [
    [from, 'awal'],
    [to, 'akhir'],
  ] as const) {
    if (!isDateString(date)) throw invalid(`Tanggal ${label} periode harus berbentuk TTTT-BB-HH.`);
  }
  if (from > to) throw invalid('Tanggal awal periode tidak boleh setelah tanggal akhir.');
  if (addDays(from, REPORT_MAX_DAYS - 1) < to) {
    throw invalid(`Periode laporan paling panjang ${REPORT_MAX_DAYS} hari.`);
  }

  const query: ParsedReportQuery = { from, to, status: 'semua', page: 1 };
  const status = value('status');
  if (status !== undefined) {
    if (!REPORT_STATUS_FILTERS.includes(status as ReportStatusFilter)) {
      throw invalid(`Status harus salah satu dari: ${REPORT_STATUS_FILTERS.join(', ')}.`);
    }
    query.status = status as ReportStatusFilter;
  }
  const page = value('page');
  if (page !== undefined) {
    if (!/^\d{1,6}$/.test(page) || Number(page) < 1) throw invalid('Halaman harus bilangan bulat mulai 1.');
    query.page = Number(page);
  }
  for (const [key, label] of [
    ['tenantId', 'Customer'],
    ['categoryId', 'Kategori'],
    ['jarkomId', 'Jarkom'],
  ] as const) {
    const id = value(key);
    if (id === undefined) continue;
    if (!UUID.test(id)) throw invalid(`${label} tidak sah.`);
    query[key] = id;
  }
  return query;
}

function invalid(message: string): BadRequestException {
  return new BadRequestException({ statusCode: HttpStatus.BAD_REQUEST, message });
}
