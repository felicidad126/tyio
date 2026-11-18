import type { TenantRef } from './auth.js';
import type { MasterRef, TicketRemote, TicketStatus } from './tickets.js';

/**
 * Overview (langkah 2.1): kondisi tiket sekarang dan analitik kejadian. Setiap angka punya
 * pasangan di daftar Tiket dengan saringan yang menghasilkan jumlah yang sama persis.
 * Hari dihitung menurut WIB, seperti bulan pada nomor tiket.
 */
export const OVERVIEW_TREND_DAYS = 14;
export const OVERVIEW_TOP_REMOTE_DAYS = 30;
export const OVERVIEW_TOP_REMOTES = 10;

export type ActiveTicketStatus = Exclude<TicketStatus, 'selesai'>;

export interface OverviewResponse {
  /** Waktu angka dihitung (UTC ISO). */
  generatedAt: string;
  /** Tanggal hari ini menurut WIB (YYYY-MM-DD). */
  today: string;
  /** Tiket yang belum Selesai. */
  active: {
    total: number;
    byStatus: Record<ActiveTicketStatus, number>;
    /** NPR aktif yang punya TT (tab TT aktif). */
    tt: number;
    /** NPR aktif yang kejadiannya 7 hari atau lebih (tanda "Down ≥ 7 hari"). */
    flagged: number;
  };
  /** Tiket aktif per kategori, terbanyak dulu; kategori tanpa tiket aktif tidak ikut. */
  byCategory: Array<{ category: MasterRef; count: number }>;
  /** Tiket aktif per customer, terbanyak dulu. */
  byCustomer: Array<{ tenant: TenantRef; count: number }>;
  /**
   * Per hari WIB, `OVERVIEW_TREND_DAYS` hari sampai hari ini (urut lama → baru, hari kosong
   * ikut): NPR menurut tanggal kejadian, dan NPR yang Selesai menurut tanggal online kembali.
   */
  trend: Array<{ date: string; opened: number; closed: number }>;
  /** Remote dengan NPR terbanyak menurut tanggal kejadian dalam rentang ini. */
  topRemotes: {
    from: string;
    to: string;
    items: Array<{ remote: Pick<TicketRemote, 'id' | 'siteId' | 'name' | 'city'>; tenant: TenantRef; count: number }>;
  };
}

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Tanggal WIB (YYYY-MM-DD) dari sebuah waktu. */
export function wibDate(at: Date | string): string {
  return new Date(new Date(at).getTime() + WIB_OFFSET_MS).toISOString().slice(0, 10);
}

/** Awal hari WIB (pukul 00.00 WIB) dari tanggal YYYY-MM-DD, sebagai waktu UTC. */
export function wibDayStart(date: string): Date {
  return new Date(Date.parse(`${date}T00:00:00Z`) - WIB_OFFSET_MS);
}

/** Tanggal YYYY-MM-DD digeser sejumlah hari. */
export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Tanggal YYYY-MM-DD yang benar-benar ada di kalender. */
export function isDateString(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}
