import type { TenantRef } from './auth.js';
import type { MasterItem } from './master.js';
import type { RemoteStatus, TimeZoneName } from './remotes.js';

/**
 * Status tiket. 1.3 hanya membuat tiket terbuka; alur status lengkap menunggu persetujuan
 * user (langkah 1.4). "Terbuka" berarti belum ditutup, apa pun statusnya kelak.
 */
export const TICKET_STATUSES = ['terbuka'] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKET_STATUS_LABELS: Readonly<Record<TicketStatus, string>> = {
  terbuka: 'Terbuka',
};

export const TICKET_PROBLEM_MIN = 3;
export const TICKET_PROBLEM_MAX = 4000;
/** Waktu kejadian boleh sedikit di depan jam server (jam perangkat operator tidak persis sama). */
export const TICKET_FUTURE_TOLERANCE_MINUTES = 5;

export type MasterRef = Pick<MasterItem, 'id' | 'code' | 'name'>;

/** Remote yang dirujuk tiket, sebanyak yang perlu tampil di tiket. */
export interface TicketRemote {
  id: string;
  siteId: string;
  name: string;
  city: string;
  province: string;
  timeZone: TimeZoneName;
  status: RemoteStatus;
}

export interface TicketSummary {
  id: string;
  /** NPR/<jarkom>/<customer>/<tahun>/<bulan>/<urut>, dibuat sistem. */
  number: string;
  status: TicketStatus;
  tenant: TenantRef;
  category: MasterRef;
  /** Waktu kejadian (UTC ISO), diisi operator. */
  occurredAt: string;
  /** Waktu pencatatan (UTC ISO), diisi sistem. */
  createdAt: string;
}

export interface TicketDetail extends TicketSummary {
  remote: TicketRemote;
  jarkom: MasterRef;
  system: MasterRef | null;
  problem: string;
  createdBy: { id: string; displayName: string };
}

export interface CreateTicketRequest {
  remoteId: string;
  categoryId: string;
  systemId?: string | null;
  /** UTC ISO. */
  occurredAt: string;
  problem: string;
  /** Wajib true bila remote masih punya tiket terbuka. */
  confirmOpenTickets?: boolean;
}

export interface TicketResponse {
  ticket: TicketDetail;
}

export interface OpenTicketsResponse {
  tickets: TicketSummary[];
}

/** Jawaban 409 saat remote masih punya tiket terbuka dan belum dikonfirmasi. */
export interface OpenTicketsConflict {
  statusCode: 409;
  message: string;
  openTickets: TicketSummary[];
}
