/**
 * Pembaruan langsung (langkah 2.2) lewat `GET /api/stream` (Server-Sent Events). Isinya hanya
 * penanda "tiket ini berubah"; halaman lalu memuat ulang datanya lewat API biasa, sehingga
 * aturan akses tetap satu tempat.
 *
 * Event: `ready` (StreamReady) saat tersambung · `change` (StreamChange) · `resync` saat
 * kabar mungkin ada yang terlewat (muat ulang semua) · `ping` (StreamPing) detak berkala ·
 * `bye` sebelum server menutup koneksi dengan rapi (sambung ulang segera).
 */
export const STREAM_CHANGE_KINDS = ['tickets', 'ticket_actions', 'trouble_tickets'] as const;
export type StreamChangeKind = (typeof STREAM_CHANGE_KINDS)[number];

export interface StreamReady {
  /** Waktu server (UTC ISO). */
  at: string;
  /** Jarak detak; browser menganggap koneksi mati bila lama tidak ada kabar. */
  heartbeatMs: number;
}

export interface StreamChange {
  ticketId: string;
  kind: StreamChangeKind;
}

export interface StreamPing {
  at: string;
}
