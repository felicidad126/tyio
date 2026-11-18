import type { MasterRef, ReplacedPart, TicketStatus } from './tickets.js';

/**
 * Laporan rekap NPR (langkah 4.2, bagian tanpa SLA): NPR menurut tanggal kejadian WIB dalam
 * satu periode, dengan saringan yang sama seperti daftar Tiket sehingga setiap angka cocok.
 */
export const REPORT_MAX_DAYS = 366;
export const REPORT_PAGE_SIZE = 50;
/** Batas baris ekspor Excel dalam satu unduhan. */
export const REPORT_EXPORT_MAX_ROWS = 100_000;

export const REPORT_STATUS_FILTERS = ['semua', 'aktif', 'selesai'] as const;
export type ReportStatusFilter = (typeof REPORT_STATUS_FILTERS)[number];
export const REPORT_STATUS_LABELS: Readonly<Record<ReportStatusFilter, string>> = {
  semua: 'Semua',
  aktif: 'Masih aktif',
  selesai: 'Selesai',
};

export interface NprReportQuery {
  /** Tanggal kejadian WIB, YYYY-MM-DD, termasuk kedua ujungnya. Bawaan: bulan ini sampai hari ini. */
  from?: string;
  to?: string;
  tenantId?: string;
  categoryId?: string;
  jarkomId?: string;
  status?: ReportStatusFilter;
  page?: number;
}

/** Ringkasan satu kelompok (atau seluruhnya). Lama gangguan dalam menit, hanya NPR Selesai. */
export interface NprReportFigures {
  total: number;
  closed: number;
  active: number;
  /** NPR dengan TT (ada kunjungan teknisi). */
  withTt: number;
  avgMinutes: number | null;
  medianMinutes: number | null;
}

export interface NprReportGroup extends NprReportFigures {
  ref: MasterRef;
}

export interface NprReportRow {
  id: string;
  number: string;
  ttNumber: string | null;
  customerTicketNumber: string | null;
  tenant: string;
  siteId: string;
  remote: string;
  city: string;
  category: string;
  jarkom: string;
  status: TicketStatus;
  occurredAt: string;
  closedAt: string | null;
  durationMinutes: number | null;
  problem: string;
  /** Catatan dan part dari tindakan Close terakhir. */
  closeNote: string | null;
  replacedParts: ReplacedPart[] | null;
}

export interface NprReportResponse {
  from: string;
  to: string;
  summary: NprReportFigures;
  byCustomer: NprReportGroup[];
  byCategory: NprReportGroup[];
  /** Part yang diganti teknisi (dari tindakan Close), menurut urutan daftar part. */
  parts: Array<{ part: ReplacedPart; count: number }>;
  topRemotes: Array<{ id: string; siteId: string; name: string; tenant: string; total: number }>;
  items: NprReportRow[];
  page: number;
  pageSize: number;
}
