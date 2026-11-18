import type { TenantRef } from './auth.js';
import type { MasterItem } from './master.js';
import type { RemoteStatus, TimeZoneName } from './remotes.js';

/**
 * Status tiket (alur disetujui user, langkah 1.4). **Selesai = NPR ditutup** lewat tindakan
 * Close (1.6, K32): waktunya (jarkom online kembali) tersimpan sebagai `closedAt`.
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
 * Jalur status: satu-satunya sumber untuk API (menolak jalur lain) dan web (hanya menawarkan
 * jalur ini). **Eskalasi = TT dibuka, menunggu kunjungan teknisi** (T69): hanya terpasang lewat
 * "Eskalasi To SD" (buka TT), tidak dipilih manual. Dari Eskalasi, setelah kunjungan:
 * Dikerjakan, Pending (mis. part ATM belum siap), atau Selesai. **Selesai hanya lewat tindakan
 * Close** (T74); Selesai → Dikerjakan membuka NPR lagi.
 */
export const TICKET_TRANSITIONS: Readonly<Record<TicketStatus, readonly TicketStatus[]>> = {
  terbuka: ['dikerjakan', 'pending', 'selesai'],
  dikerjakan: ['pending', 'selesai'],
  pending: ['dikerjakan'],
  eskalasi: ['dikerjakan', 'pending', 'selesai'],
  selesai: ['dikerjakan'],
};

/** Status yang bisa dipilih di "Ubah status"; Selesai dipasang tindakan Close (T74). */
export function manualStatusTargets(from: TicketStatus): readonly TicketStatus[] {
  return TICKET_TRANSITIONS[from].filter((to) => to !== 'selesai');
}

/** NPR yang belum Selesai bisa ditutup (Close) dari status mana pun yang punya jalur ke Selesai. */
export function canCloseTicket(status: TicketStatus): boolean {
  return TICKET_TRANSITIONS[status].includes('selesai');
}

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
 * Jenis tindakan (Take Action sistem lama, K32). Eskalasi To SD dibuat sistem saat TT dibuka
 * (1.5b); Close menutup NPR (1.6).
 */
export const TICKET_ACTION_TYPES = ['catatan', 'cek_lokasi', 'problem', 'eskalasi_sd', 'close'] as const;
export type TicketActionType = (typeof TICKET_ACTION_TYPES)[number];

/** Yang bisa dipilih di form Tambah tindakan; Eskalasi To SD dibuat sistem saat TT dibuka. */
export const MANUAL_ACTION_TYPES = ['catatan', 'cek_lokasi', 'problem', 'close'] as const satisfies readonly TicketActionType[];
export type ManualActionType = (typeof MANUAL_ACTION_TYPES)[number];

// "Bebas" mengikuti nama di sistem lama; "Catatan" sudah dipakai untuk kolom isinya.
export const TICKET_ACTION_TYPE_LABELS: Readonly<Record<TicketActionType, string>> = {
  catatan: 'Bebas',
  cek_lokasi: 'Cek lokasi',
  problem: 'Problem',
  eskalasi_sd: 'Eskalasi To SD',
  close: 'Close',
};

export const TICKET_ACTION_TYPE_HINTS: Readonly<Record<ManualActionType, string>> = {
  catatan: 'Catatan bebas, perubahan status, atau lampiran.',
  cek_lokasi: 'Minta PIC di lokasi mengecek. Tulis siapa yang dihubungi dan apa yang diminta.',
  problem: 'Hasil pengecekan PIC: tulis penyebab masalahnya.',
  close: 'Tutup NPR karena jarkom terpantau online kembali. Tulis penyelesaiannya.',
};

/**
 * Part yang diganti saat kunjungan teknisi (K32), dipilih waktu Close NPR yang punya TT.
 * Daftar kosong berarti tidak ada part yang diganti.
 */
export const REPLACED_PARTS = ['modem', 'adaptor', 'indoor', 'buc', 'lnb'] as const;
export type ReplacedPart = (typeof REPLACED_PARTS)[number];
export const REPLACED_PART_LABELS: Readonly<Record<ReplacedPart, string>> = {
  modem: 'Modem',
  adaptor: 'Adaptor',
  indoor: 'Perangkat indoor',
  buc: 'BUC',
  lnb: 'LNB',
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
  /** Waktu jarkom online kembali (UTC ISO) saat NPR ditutup; kosong selama belum Selesai. */
  closedAt: string | null;
}

/** Trouble Ticket: eskalasi ke Service Delivery untuk kunjungan teknisi (K27, K44). */
export interface TroubleTicket {
  id: string;
  /** TT/<jarkom>/<customer>/<tahun>/<bulan>/<urut>, dibuat sistem (K41). */
  number: string;
  problem: string;
  createdAt: string;
  createdBy: { id: string; displayName: string };
  /** Ditutup bersama NPR-nya (T75); kosong lagi bila NPR dibuka lagi. */
  closedAt: string | null;
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
  /** Hanya untuk Close NPR yang punya TT: part yang diganti teknisi (kosong = tidak ada). */
  replacedParts: ReplacedPart[] | null;
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
  /**
   * Bawaan "catatan". Cek lokasi, Problem, dan Close wajib berisi catatan. Close wajib bersama
   * `statusTo: 'selesai'`, dan Selesai hanya lewat Close. Tidak untuk koreksi.
   */
  type?: ManualActionType;
  /** UTC ISO; wajib kecuali untuk koreksi. Untuk Close: waktu jarkom online kembali. */
  occurredAt?: string;
  note?: string;
  statusTo?: TicketStatus;
  /**
   * Hanya untuk Close NPR yang punya TT, dan wajib di sana (bersama lampiran laporan teknisi):
   * part yang diganti, atau daftar kosong bila tidak ada.
   */
  replacedParts?: ReplacedPart[];
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
  /** Riwayat tiket satu remote (halaman remote), atau remote dari Overview. */
  remoteId?: string;
  /** Satu status (dari angka Overview). */
  status?: TicketStatus;
  /** Tanggal kejadian WIB, YYYY-MM-DD, termasuk kedua ujungnya. */
  occurredFrom?: string;
  occurredTo?: string;
  /** Tanggal online kembali (Close) WIB, YYYY-MM-DD, termasuk kedua ujungnya. */
  closedFrom?: string;
  closedTo?: string;
  /** Hanya NPR aktif yang kejadiannya `TICKET_FLAG_DAYS` hari atau lebih ("Down ≥ 7 hari"). */
  flagged?: boolean;
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
