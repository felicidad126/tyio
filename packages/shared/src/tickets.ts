import type { RemoteDetail } from './remotes.js';

/**
 * Tiket (langkah 1.3). NPR = catatan downtime satu remote beserta penyebabnya (K16).
 * Nomornya `NPR/JARKOM/CUSTOMER/TAHUN/BULAN/urut`: TAHUN/BULAN menurut zona waktu remote
 * saat NPR disimpan (T55), urut mulai dari 0001 setiap bulan untuk setiap jarkom setiap
 * customer (T56). TT (1.5b) memakai penghitung yang sama dengan jenis `TT`.
 */

/**
 * Status NPR (T63, ATURAN.md §3). Kandidat dan Bukan gangguan menyusul di R6 (alert).
 * Status hanya berubah lewat entri linimasa (`ticket_actions`), tidak pernah langsung.
 */
export const TICKET_STATUSES = [
  'terbuka',
  'dikerjakan',
  'pending_customer',
  'pending_tm',
  'eskalasi_l2',
  'eskalasi_sd',
  'pulih',
  'ditutup',
] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  terbuka: 'Terbuka',
  dikerjakan: 'Dikerjakan',
  pending_customer: 'Pending · Customer',
  pending_tm: 'Pending · TM',
  eskalasi_l2: 'Eskalasi · L2',
  eskalasi_sd: 'Eskalasi · SD',
  pulih: 'Pulih · siap ditutup',
  ditutup: 'Ditutup',
};

export function isTicketStatus(value: unknown): value is TicketStatus {
  return typeof value === 'string' && (TICKET_STATUSES as readonly string[]).includes(value);
}

/** Semua status selain Ditutup: NPR masih berjalan (peringatan saat membuat NPR baru). */
export const OPEN_TICKET_STATUSES: readonly TicketStatus[] = TICKET_STATUSES.filter((status) => status !== 'ditutup');

/** Status pending: pihak yang ditunggu ada di status itu sendiri, alasannya wajib (T68). */
export const PENDING_TICKET_STATUSES: readonly TicketStatus[] = ['pending_customer', 'pending_tm'];

/**
 * Perpindahan status yang sah (T64, T66). Database memakai aturan yang sama
 * (`ticket_status_transition_allowed`, diuji sama untuk semua pasangan):
 * - antar status aktif bebas, kecuali kembali ke Terbuka;
 * - Ditutup hanya dari Pulih · siap ditutup;
 * - dari Ditutup hanya dibuka kembali ke Dikerjakan (oleh L2/admin, dijaga API).
 */
export function isTicketTransitionAllowed(from: TicketStatus, to: TicketStatus): boolean {
  if (from === to || to === 'terbuka') return false;
  if (from === 'ditutup') return to === 'dikerjakan';
  if (to === 'ditutup') return from === 'pulih';
  return true;
}

/** Status tujuan yang bisa dipilih dari layar di langkah ini: penutupan menyusul di 1.6 (T69). */
export function selectableNextStatuses(from: TicketStatus): TicketStatus[] {
  return TICKET_STATUSES.filter((to) => to !== 'ditutup' && isTicketTransitionAllowed(from, to));
}

/**
 * Jenis entri linimasa (T67). `dibuat` hanya ditulis sistem saat NPR dibuat; `koreksi`
 * merujuk entri lama, yang tetap ada dan ditandai "dikoreksi". "Hasil kunjungan SD" menyusul
 * di 1.5b. Eskalasi dan penutupan adalah perpindahan status, bukan jenis tindakan.
 */
export const TICKET_ACTION_KINDS = [
  'dibuat',
  'cek_jaringan',
  'cek_lokasi',
  'hubungi_customer',
  'catatan',
  'koreksi',
] as const;
export type TicketActionKind = (typeof TICKET_ACTION_KINDS)[number];

/** Jenis yang bisa dipilih operator di formulir "Tambah tindakan" (tanpa `dibuat` dan `koreksi`). */
export const TICKET_ACTION_KINDS_SELECTABLE = ['cek_jaringan', 'cek_lokasi', 'hubungi_customer', 'catatan'] as const;

export const TICKET_ACTION_KIND_LABELS: Record<TicketActionKind, string> = {
  dibuat: 'NPR dibuat',
  cek_jaringan: 'Cek jaringan',
  cek_lokasi: 'Cek lokasi / hubungi PIC',
  hubungi_customer: 'Hubungi customer',
  catatan: 'Catatan',
  koreksi: 'Koreksi',
};

export function isTicketActionKind(value: unknown): value is TicketActionKind {
  return typeof value === 'string' && (TICKET_ACTION_KINDS as readonly string[]).includes(value);
}

export const TICKET_ACTION_NOTE_MAX_LENGTH = 2000;
export const TICKET_PENDING_REASON_MAX_LENGTH = 500;
export const CUSTOMER_TICKET_NUMBER_MAX_LENGTH = 100;

/** Lampiran (T70): disimpan di database, paling besar 10 MB, paling banyak 5 per tindakan. */
export const TICKET_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
export const TICKET_ATTACHMENTS_PER_ACTION = 5;
export const TICKET_ATTACHMENT_NAME_MAX_LENGTH = 200;

/** Jenis berkas yang diterima, menurut ekstensi. Jenis isi disimpan dari daftar ini, bukan dari peramban. */
export const TICKET_ATTACHMENT_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  pdf: 'application/pdf',
  txt: 'text/plain',
  log: 'text/plain',
  csv: 'text/csv',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
};

/** Nilai `accept` untuk pemilih berkas. */
export const TICKET_ATTACHMENT_ACCEPT = Object.keys(TICKET_ATTACHMENT_TYPES)
  .map((ext) => `.${ext}`)
  .join(',');

export const TICKET_DESCRIPTION_MAX_LENGTH = 2000;

/** Mulai gangguan paling lama sekian hari sebelum NPR dibuat (T57). */
export const TICKET_STARTED_MAX_AGE_DAYS = 30;

/**
 * Mulai gangguan boleh sedikit di depan jam server, karena jam perangkat operator bisa
 * lebih cepat. Nilai di depan jam server disimpan sama dengan waktu NPR dibuat.
 */
export const TICKET_STARTED_CLOCK_SKEW_MINUTES = 5;

/** Bentuk nomor NPR, mis. `NPR/VSAT/BNA/2026/11/0418`. Urut minimal 4 digit. */
export const NPR_NUMBER_PATTERN = /^NPR\/[A-Z0-9]{2,10}\/[A-Z0-9]{2,10}\/\d{4}\/(0[1-9]|1[0-2])\/\d{4,}$/;

/** Isi `POST /api/tickets`. Customer, jarkom, dan pembuat diambil dari remote dan sesi. */
export interface CreateTicket {
  remoteId: string;
  categoryId: string;
  systemId: string;
  /** ISO 8601 dengan zona, mis. `2026-11-21T14:05:00+08:00`. Tidak diisi = saat NPR disimpan. */
  startedAt?: string;
  description: string;
  /** Operator sudah melihat NPR terbuka di remote ini dan tetap membuat NPR baru. */
  acknowledgeOpenTickets?: boolean;
}

/** Satu NPR di daftar singkat (mis. NPR terbuka sebuah remote). Waktu dalam ISO 8601 UTC. */
export interface TicketSummary {
  id: string;
  number: string;
  status: TicketStatus;
  categoryName: string;
  startedAt: string;
  createdAt: string;
  createdByName: string;
  description: string;
}

/** Halaman NPR, seperti dikirim `GET /api/tickets/:id` dan `POST /api/tickets`. */
export interface TicketDetail extends TicketSummary {
  tenantId: string;
  /** Nomor tiket di sistem customer (mis. `INC-88213`), dicatat lewat linimasa. */
  customerTicketNumber: string | null;
  category: { id: string; name: string };
  system: { id: string; name: string };
  /** Jarkom saat NPR dibuat; kodenya ada di nomor NPR. */
  network: { id: string; code: string; name: string };
  createdBy: { id: string; name: string };
  /** Data remote terkini (lokasi, jaringan, kontak). */
  remote: RemoteDetail;
}

/** Isi jawaban 409 dari `POST /api/tickets` bila remote masih punya NPR terbuka. */
export interface OpenTicketsConflict {
  statusCode: 409;
  message: string;
  openTickets: TicketSummary[];
}

/** Lampiran sebuah tindakan (tanpa isi; isi diunduh lewat `url`). */
export interface TicketAttachment {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  /** `GET` alamat ini mengunduh berkasnya. */
  url: string;
}

/** Satu entri linimasa NPR. Waktu dalam ISO 8601 UTC. Entri tidak pernah diubah atau dihapus. */
export interface TicketAction {
  id: string;
  kind: TicketActionKind;
  note: string;
  /** Waktu kejadian yang dicatat (boleh sebelum waktu pencatatan). */
  occurredAt: string;
  /** Waktu pencatatan, diisi sistem. */
  createdAt: string;
  createdBy: { id: string; name: string; role: string };
  /** Perpindahan status oleh entri ini; `from` kosong untuk entri `dibuat`. */
  statusChange: { from: TicketStatus | null; to: TicketStatus } | null;
  pendingReason: string | null;
  /** Entri yang dikoreksi oleh entri ini (jenis `koreksi`). */
  correctsId: string | null;
  /** Entri-entri koreksi yang merujuk entri ini, terlama dulu. */
  correctedByIds: string[];
  /** Mulai gangguan yang baru, bila entri ini mengoreksinya. */
  startedAtCorrection: string | null;
  /** Nomor tiket customer yang dicatat entri ini; `''` berarti dikosongkan. */
  customerTicketNumber: string | null;
  attachments: TicketAttachment[];
}

/**
 * Isi `POST /api/tickets/:id/actions` (JSON, atau multipart dengan bagian `data` berisi JSON
 * ini dan berkas di bagian `lampiran`).
 */
export interface CreateTicketAction {
  kind: Exclude<TicketActionKind, 'dibuat'>;
  note: string;
  /** ISO 8601 dengan zona. Tidak diisi = saat disimpan. */
  occurredAt?: string;
  /** Status sesudah tindakan ini; tidak diisi = status tetap. */
  statusTo?: TicketStatus;
  /** Status yang dilihat operator saat mengisi; wajib bila `statusTo` diisi (cegah tabrakan). */
  statusFrom?: TicketStatus;
  /** Wajib bila `statusTo` pending (T68). */
  pendingReason?: string;
  /** Wajib untuk `koreksi`: entri yang dikoreksi. */
  correctsId?: string;
  /** Hanya untuk `koreksi`: mulai gangguan yang benar. */
  startedAt?: string;
  /** Nomor tiket customer baru; `''` mengosongkan. */
  customerTicketNumber?: string;
}

/** Jawaban `POST /api/tickets/:id/actions`: NPR terbaru dan linimasanya. */
export interface TicketTimeline {
  ticket: TicketDetail;
  actions: TicketAction[];
}
