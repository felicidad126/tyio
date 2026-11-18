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
 * Jalur status yang bisa dipilih Helpdesk: satu-satunya sumber untuk API (menolak jalur lain)
 * dan web (hanya menawarkan jalur ini). **Eskalasi = TT dibuka, menunggu kunjungan teknisi**
 * (T69): hanya terpasang lewat "Eskalasi To SD" (buka TT), tidak dipilih manual. Dari Eskalasi,
 * setelah kunjungan: Dikerjakan, Pending (mis. part ATM belum siap), atau Selesai.
 */
export const TICKET_TRANSITIONS: Readonly<Record<TicketStatus, readonly TicketStatus[]>> = {
  terbuka: ['dikerjakan', 'pending', 'selesai'],
  dikerjakan: ['pending', 'selesai'],
  pending: ['dikerjakan'],
  eskalasi: ['dikerjakan', 'pending', 'selesai'],
  selesai: ['dikerjakan'],
};

/** TT bisa dibuka dari status mana pun yang belum Selesai, sekali per NPR (K27, K44). */
export function canOpenTroubleTicket(status: TicketStatus): boolean {
  return status !== 'selesai';
}

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

/** Kapan memilih pihak pending (K28): TM = penyedia jaringan, Customer = sisi bank/lokasi. */
export const PENDING_PARTY_HINTS: Readonly<Record<PendingParty, string>> = {
  customer: 'Listrik, obstacle, renovasi, atau part ATM belum siap',
  tm: 'Problem jaringan (jarkom) di lokasi',
};

/**
 * Jenis tindakan (Take Action sistem lama, K32). Eskalasi To SD menjadi TT (1.5b) dan Close
 * menjadi penutupan (1.6), jadi tidak ada di sini.
 */
export const TICKET_ACTION_TYPES = ['catatan', 'cek_lokasi', 'problem', 'eskalasi_sd'] as const;
export type TicketActionType = (typeof TICKET_ACTION_TYPES)[number];

/** Yang bisa dipilih di form Tambah tindakan; Eskalasi To SD dibuat sistem saat TT dibuka. */
export const MANUAL_ACTION_TYPES = ['catatan', 'cek_lokasi', 'problem'] as const satisfies readonly TicketActionType[];
export type ManualActionType = (typeof MANUAL_ACTION_TYPES)[number];

// "Bebas" mengikuti nama di sistem lama; "Catatan" sudah dipakai untuk kolom isinya.
export const TICKET_ACTION_TYPE_LABELS: Readonly<Record<TicketActionType, string>> = {
  catatan: 'Bebas',
  cek_lokasi: 'Cek lokasi',
  problem: 'Problem',
  eskalasi_sd: 'Eskalasi To SD',
};

export const TICKET_ACTION_TYPE_HINTS: Readonly<Record<ManualActionType, string>> = {
  catatan: 'Catatan bebas, perubahan status, atau lampiran.',
  cek_lokasi: 'Minta PIC di lokasi mengecek. Tulis siapa yang dihubungi dan apa yang diminta.',
  problem: 'Hasil pengecekan PIC: tulis penyebab masalahnya.',
};

/** Tanda NPR yang perlu diperbarui (K36): masih aktif dan sudah down sekian hari. */
export const TICKET_FLAG_DAYS = 7;

export function ticketNeedsUpdate(
  ticket: { status: TicketStatus; occurredAt: string },
  now: Date = new Date(),
): boolean {
  return (
    ticket.status !== 'selesai' &&
    now.getTime() - new Date(ticket.occurredAt).getTime() >= TICKET_FLAG_DAYS * 24 * 60 * 60 * 1000
  );
}

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

/** Trouble Ticket: eskalasi ke Service Delivery untuk kunjungan teknisi (K27, K44). */
export interface TroubleTicket {
  id: string;
  /** TT/<jarkom>/<customer>/<tahun>/<bulan>/<urut>, dibuat sistem (K41). */
  number: string;
  problem: string;
  createdAt: string;
  createdBy: { id: string; displayName: string };
}

export const TT_PROBLEM_MIN = 3;
export const TT_PROBLEM_MAX = 2000;

/** Isian "Eskalasi To SD". */
export interface OpenTroubleTicketRequest {
  /** Problem jarkom yang perlu dikerjakan teknisi. */
  problem: string;
  /** Status yang dilihat Helpdesk; bila sudah berubah, API menjawab 409. */
  expectedStatus: TicketStatus;
}

/** Teks ringkasan TT siap tempel ke chat SD; penyalinannya tercatat di linimasa (K25). */
export interface TroubleTicketSummaryResponse {
  text: string;
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
  /** TT tiket ini, bila sudah dieskalasi ke SD (paling banyak satu). */
  tt: TroubleTicket | null;
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
  type: TicketActionType;
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
  /** Bawaan "catatan". Cek lokasi dan Problem wajib berisi catatan. Tidak untuk koreksi. */
  type?: ManualActionType;
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

/**
 * Tampilan daftar tiket (tab di halaman Tiket). "Aktif" = belum Selesai; "Milik saya" = tiket
 * aktif yang saya buat atau pernah saya beri tindakan.
 */
export const TICKET_VIEWS = ['aktif', 'saya', 'pending', 'eskalasi', 'tt', 'selesai', 'semua'] as const;
export type TicketView = (typeof TICKET_VIEWS)[number];

export const TICKET_VIEW_LABELS: Readonly<Record<TicketView, string>> = {
  aktif: 'Aktif',
  saya: 'Milik saya',
  pending: 'Pending',
  eskalasi: 'Eskalasi',
  tt: 'TT aktif',
  selesai: 'Selesai',
  semua: 'Semua',
};

/**
 * Tampilan antrean: jumlahnya selalu tampil di tab. Selesai dan Semua (riwayat) hanya dihitung
 * saat dibuka, karena jumlahnya terus bertambah dan tidak perlu dipantau.
 */
export const TICKET_QUEUE_VIEWS = ['aktif', 'saya', 'pending', 'eskalasi', 'tt'] as const satisfies readonly TicketView[];
export type TicketQueueView = (typeof TICKET_QUEUE_VIEWS)[number];

/** Status yang masih perlu ditangani. */
export const ACTIVE_TICKET_STATUSES: readonly TicketStatus[] = ['terbuka', 'dikerjakan', 'pending', 'eskalasi'];

export const TICKET_PAGE_SIZE = 50;
/** Panjang potongan catatan tindakan terakhir di daftar. */
export const TICKET_LIST_NOTE_EXCERPT = 140;

/** Parameter daftar tiket (query string). */
export interface TicketListQuery {
  view?: TicketView;
  /** Cari di no. NPR, no. TT, no. tiket customer, Site ID, nama, kota, dan kanca remote. */
  q?: string;
  tenantId?: string;
  categoryId?: string;
  jarkomId?: string;
  page?: number;
}

/** Satu baris daftar tiket: yang perlu terlihat di antrean tanpa membuka tiketnya. */
export interface TicketListItem extends TicketSummary {
  remote: Pick<TicketRemote, 'id' | 'siteId' | 'name' | 'city' | 'timeZone'>;
  customerTicketNumber: string | null;
  /** Nomor TT, bila ada. */
  tt: { number: string } | null;
  pending: { party: PendingParty; reason: string } | null;
  createdBy: { id: string; displayName: string };
  /** Entri linimasa terbaru menurut waktu tindakan; catatan dipotong. */
  lastAction: {
    type: TicketActionType;
    occurredAt: string;
    createdBy: { id: string; displayName: string };
    statusTo: TicketStatus | null;
    note: string | null;
  } | null;
}

export interface TicketListResponse {
  items: TicketListItem[];
  total: number;
  page: number;
  pageSize: number;
  /** Jumlah per tampilan antrean dengan saringan dan pencarian yang sama. */
  counts: Record<TicketQueueView, number>;
}
