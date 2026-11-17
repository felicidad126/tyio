import type { RemoteSummary } from './remotes.js';
import type { TicketListItem } from './tickets.js';

/** Pencarian global di header: tiket dan remote dari satu kotak cari. */
export const SEARCH_MIN_LENGTH = 2;
export const SEARCH_MAX_LENGTH = 100;
/** Hasil per jenis; sisanya dibuka lewat daftar Tiket atau Remote dengan kata yang sama. */
export const SEARCH_LIMIT = 10;

export interface SearchResponse {
  q: string;
  /** Kosong bila peran pengguna tidak boleh membuka modul Tiket. */
  tickets: TicketListItem[];
  ticketTotal: number;
  /** Kosong bila peran pengguna tidak boleh membuka modul Remote. */
  remotes: RemoteSummary[];
  remoteTotal: number;
}
