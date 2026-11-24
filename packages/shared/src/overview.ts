import type { RemoteRegion } from './regions.js';
import type { RemoteZone } from './remotes.js';
import type { TicketQueueFilter, TicketQueueItem, TicketStatus } from './tickets.js';

/**
 * Overview (langkah 2.1). Setiap angka membawa saringan antrean yang menghasilkan daftar
 * dengan jumlah sama persis (`OverviewCount.filter`, parameter `GET /api/tickets`).
 * - Angka "saat ini" (per status, kategori, customer, wilayah) = NPR berjalan (T110).
 * - Periode 7 / 14 / 30 hari, bawaan 14, hanya untuk tren harian dan remote paling sering
 *   bermasalah (T108); dihitung dari waktu NPR dibuat, termasuk yang sudah Ditutup.
 * - Batas hari menurut WIB untuk semua NPR (T109).
 */
export const OVERVIEW_PERIODS = [7, 14, 30] as const;
export type OverviewPeriod = (typeof OVERVIEW_PERIODS)[number];
export const OVERVIEW_PERIOD_DEFAULT: OverviewPeriod = 14;

export function isOverviewPeriod(value: unknown): value is OverviewPeriod {
  return typeof value === 'number' && (OVERVIEW_PERIODS as readonly number[]).includes(value);
}

/** Zona batas hari Overview dan saringan tanggal antrean (T109). */
export const OVERVIEW_DAY_ZONE = 'WIB';
export const OVERVIEW_DAY_ZONE_IANA = 'Asia/Jakarta';

/** "Perlu tindakan sekarang": NPR berjalan dengan mulai gangguan terlama (T111). */
export const OVERVIEW_URGENT_LIMIT = 5;
/** "Remote paling sering bermasalah": 5 teratas menurut jumlah NPR dalam periode (T112). */
export const OVERVIEW_FREQUENT_LIMIT = 5;

/** Satu angka Overview dan saringan antrean yang memberi daftar dengan jumlah yang sama. */
export interface OverviewCount {
  count: number;
  filter: TicketQueueFilter;
}

export interface OverviewDay {
  /** `YYYY-MM-DD` menurut WIB. */
  date: string;
  total: OverviewCount;
  /** Sejajar dengan `OverviewDaily.categories`. */
  categories: OverviewCount[];
}

export interface OverviewDaily {
  /** Nama kategori yang punya NPR dalam periode, terbanyak dulu (T114). */
  categories: string[];
  days: OverviewDay[];
}

export interface OverviewRemote {
  id: string;
  code: string;
  name: string;
  city: string | null;
  zone: RemoteZone;
  customerName: string;
}

/** Jawaban `GET /api/overview?period=&tenantId=`. Waktu dalam ISO 8601 UTC. */
export interface Overview {
  generatedAt: string;
  /** Hari ini menurut WIB, `YYYY-MM-DD`. */
  today: string;
  period: { days: OverviewPeriod; from: string; to: string };
  /** Angka utama (T111). */
  open: OverviewCount;
  pending: OverviewCount;
  escalated: OverviewCount;
  ready: OverviewCount;
  createdToday: OverviewCount;
  closedToday: OverviewCount;
  /** TT yang belum Ditutup; daftarnya di halaman Tiket `?daftar=tt` (1.5b). */
  activeTroubleTickets: number;
  /** NPR berjalan per status, per kategori (nama digabung di semua customer), per customer (T110). */
  byStatus: Array<OverviewCount & { status: TicketStatus }>;
  byCategory: Array<OverviewCount & { name: string }>;
  byCustomer: Array<OverviewCount & { tenantId: string; name: string }>;
  /** Perlu tindakan sekarang (T111). */
  urgent: TicketQueueItem[];
  /** NPR berjalan per wilayah dan jumlah remote aktif di wilayah itu (T113). */
  regions: Array<OverviewCount & { region: RemoteRegion; remotes: number }>;
  daily: OverviewDaily;
  frequent: Array<OverviewCount & { remote: OverviewRemote }>;
}
