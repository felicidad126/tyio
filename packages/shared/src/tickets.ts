import type { TenantRef } from './auth.js';
import type { MasterItem } from './master.js';
import type { RemoteStatus, TimeZoneName } from './remotes.js';

/**
 * Status tiket (alur disetujui user, langkah 1.4). "Ditutup" menyusul bersama aturan
 * penutupan K21 (langkah 1.6); sampai itu semua tiket masih terbuka (closed_at kosong).
 */
export const TICKET_STATUSES = ['terbuka', 'dikerjakan', 'pending', 'eskalasi', 'selesai'] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKET_STATUS_LABELS: Readonly<Record<TicketStatus, string>> = {
  terbuka: 'Terbuka',
  dikerjakan: 'Dikerjakan',
  pending: 'Pending',
  eskalasi: 'Eskalasi',
  selesai: 'Selesai',
};

/**
 * Jalur status yang sah: satu-satunya sumber untuk API (menolak jalur lain) dan web
 * (hanya menawarkan jalur ini). Eskalasi = ke L2 (NOC); eskalasi ke SD lewat TT (1.5b).
 */
export const TICKET_TRANSITIONS: Readonly<Record<TicketStatus, readonly TicketStatus[]>> = {
  terbuka: ['dikerjakan', 'pending', 'eskalasi', 'selesai'],
  dikerjakan: ['pending', 'eskalasi', 'selesai'],
  pending: ['dikerjakan'],
  eskalasi: ['dikerjakan'],
  selesai: ['dikerjakan'],
};

export function canTransition(from: TicketStatus, to: TicketStatus): boolean {
  return TICKET_TRANSITIONS[from].includes(to);
}

/** Pihak yang ditunggu saat tiket pending. */
export const PENDING_PARTIES = ['customer', 'tm'] as const;
export type PendingParty = (typeof PENDING_PARTIES)[number];
export const PENDING_PARTY_LABELS: Readonly<Record<PendingParty, string>> = {
  customer: 'Customer',
  tm: 'TM',
};

export const ACTION_NOTE_MAX = 4000;
export const PENDING_REASON_MIN = 3;
export const PENDING_REASON_MAX = 500;
export const CUSTOMER_TICKET_NUMBER_MAX = 64;

/** Lampiran tindakan: gambar (mis. tangkapan layar yang ditempel) atau PDF. */
export const ATTACHMENT_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'] as const;
export type AttachmentType = (typeof ATTACHMENT_TYPES)[number];
export const ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;
export const ATTACHMENT_MAX_FILES = 5;

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
  /** Nomor tiket di sistem customer, bila ada. */
  customerTicketNumber: string | null;
  /** Terisi hanya saat status pending. */
  pending: { party: PendingParty; reason: string } | null;
}

export interface TicketAttachment {
  id: string;
  fileName: string;
  contentType: AttachmentType;
  sizeBytes: number;
}

/**
 * Satu entri linimasa. Hanya bisa ditambah; kesalahan diperbaiki dengan entri koreksi yang
 * merujuk entri lama (`correctsId`), dan entri lama mencatat siapa yang mengoreksinya.
 */
export interface TicketAction {
  id: string;
  /** Waktu tindakan (UTC ISO), diisi operator. */
  occurredAt: string;
  /** Waktu pencatatan (UTC ISO), diisi sistem. */
  createdAt: string;
  createdBy: { id: string; displayName: string };
  note: string | null;
  statusFrom: TicketStatus | null;
  statusTo: TicketStatus | null;
  pending: { party: PendingParty; reason: string } | null;
  correctsId: string | null;
  correctedBy: string[];
  attachments: TicketAttachment[];
}

export interface TicketActionsResponse {
  /** Menurut waktu tindakan, terbaru di atas. */
  actions: TicketAction[];
}

/** Isian "Tambah tindakan" (bagian `data` dari multipart; lampiran di bagian `lampiran`). */
export interface AddTicketActionRequest {
  /** UTC ISO; wajib kecuali untuk koreksi. */
  occurredAt?: string;
  note?: string;
  statusTo?: TicketStatus;
  /** Status yang dilihat operator; bila sudah berubah, API menjawab 409. Wajib bila statusTo diisi. */
  expectedStatus?: TicketStatus;
  pendingParty?: PendingParty;
  pendingReason?: string;
  /** Entri yang dikoreksi; koreksi berisi catatan saja, tanpa perubahan status. */
  correctsId?: string;
}

export interface AddTicketActionResponse {
  action: TicketAction;
  ticket: TicketDetail;
}

export interface UpdateTicketRequest {
  customerTicketNumber: string | null;
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
