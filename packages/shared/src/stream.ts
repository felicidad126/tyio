/**
 * Pembaruan langsung (langkah 2.2): `GET /api/stream` adalah aliran server-sent events (T6).
 * Isinya hanya pemberitahuan bahwa sesuatu berubah; layar memuat ulang datanya lewat API biasa,
 * jadi aturan cakupan dan peran tetap dijaga endpoint masing-masing.
 */

/** Nama event di aliran. */
export const STREAM_EVENTS = {
  /** Pertama kali tersambung: `StreamHello`. */
  hello: 'tersambung',
  /** Entri linimasa baru di NPR (termasuk NPR baru dan TT): `TicketChangeEvent`. */
  ticket: 'perubahan',
  /** Detak berkala: `StreamBeat`. Tanpa detak terlalu lama = sambungan dianggap putus. */
  beat: 'detak',
  /** Server mungkin melewatkan perubahan (sambungan ke database sempat putus): muat ulang semua. */
  resync: 'segarkan',
} as const;

export interface StreamHello {
  at: string;
  /** Jeda detak dalam milidetik. */
  heartbeatMs: number;
}

export interface StreamBeat {
  at: string;
}

/** NPR `ticketId` milik customer `tenantId` mendapat entri linimasa jenis `kind`. */
export interface TicketChangeEvent {
  tenantId: string;
  ticketId: string;
  kind: string;
}
