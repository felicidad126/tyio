import type { RemoteRegion } from './regions.js';
import type { RemoteDetail, RemoteZone } from './remotes.js';

/**
 * Tiket (langkah 1.3). NPR = catatan downtime satu remote beserta penyebabnya (K16).
 * Nomornya `NPR/JARKOM/CUSTOMER/TAHUN/BULAN/urut`: TAHUN/BULAN menurut zona waktu remote
 * saat NPR disimpan (T55), urut mulai dari 0001 setiap bulan untuk setiap jarkom setiap
 * customer (T56). TT (1.5b) memakai penghitung yang sama dengan jenis `TT`.
 */

/**
 * Status NPR (T63, ATURAN.md §3). Kandidat dan Bukan gangguan dari mockup tidak dipakai:
 * alert otomatis (R6) dihapus dari rencana (T126).
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

/**
 * Status tujuan yang bisa dipilih di panel "Tambah tindakan". Ditutup tidak termasuk: NPR
 * ditutup lewat tombol "Tutup NPR" dengan penyebab dan penyelesaian wajib (1.6, T98).
 */
export function selectableNextStatuses(from: TicketStatus): TicketStatus[] {
  return TICKET_STATUSES.filter((to) => to !== 'ditutup' && isTicketTransitionAllowed(from, to));
}

/**
 * Jenis entri linimasa (T67). `dibuat` hanya ditulis sistem saat NPR dibuat; `koreksi`
 * merujuk entri lama, yang tetap ada dan ditandai "dikoreksi". Eskalasi adalah perpindahan
 * status, bukan jenis tindakan. `tutup` (NPR ditutup, 1.6) dan `tt_ditutup` (TT ditutup) ditulis
 * lewat tombol penutupan masing-masing, bukan dipilih di panel "Tambah tindakan".
 */
export const TICKET_ACTION_KINDS = [
  'dibuat',
  'cek_jaringan',
  'cek_lokasi',
  'hubungi_customer',
  'catatan',
  'koreksi',
  'ambil',
  'tt_dibuat',
  'tt_disalin',
  'tutup',
  'tt_ditutup',
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
  ambil: 'Ambil',
  tt_dibuat: 'TT dibuat',
  tt_disalin: 'Salin ringkasan TT',
  tutup: 'NPR ditutup',
  tt_ditutup: 'TT ditutup',
};

export function isTicketActionKind(value: unknown): value is TicketActionKind {
  return typeof value === 'string' && (TICKET_ACTION_KINDS as readonly string[]).includes(value);
}

export const TICKET_ACTION_NOTE_MAX_LENGTH = 2000;

/**
 * Penyebab gangguan saat NPR ditutup (T98): daftar tetap untuk semua customer (sama dengan
 * dialog tutup Gamas di mockup), agar laporan dan Overview bisa dikelompokkan per penyebab.
 */
export const TICKET_CLOSE_CAUSES = ['link', 'listrik', 'cuaca', 'perangkat', 'lainnya'] as const;
export type TicketCloseCause = (typeof TICKET_CLOSE_CAUSES)[number];

export const TICKET_CLOSE_CAUSE_LABELS: Record<TicketCloseCause, string> = {
  link: 'Link/jarkom',
  listrik: 'Listrik',
  cuaca: 'Cuaca',
  perangkat: 'Perangkat',
  lainnya: 'Lainnya',
};

export function isTicketCloseCause(value: unknown): value is TicketCloseCause {
  return typeof value === 'string' && (TICKET_CLOSE_CAUSES as readonly string[]).includes(value);
}

/** Penyelesaian NPR dan hasil kunjungan TT: catatan entri penutupnya, sama panjangnya. */
export const TICKET_RESOLUTION_MAX_LENGTH = TICKET_ACTION_NOTE_MAX_LENGTH;
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
  /** Penanggung sekarang (T81), diganti lewat "Ambil". */
  assignee: TicketPerson | null;
  /** TT ke SD dari NPR ini (1.5b), terlama dulu. */
  troubleTickets: TroubleTicket[];
  /** Isian penutupan (1.6); `null` selama NPR belum ditutup (dikosongkan saat dibuka kembali). */
  closure: TicketClosure | null;
  category: { id: string; name: string };
  system: { id: string; name: string };
  /** Jarkom saat NPR dibuat; kodenya ada di nomor NPR. */
  network: { id: string; code: string; name: string };
  createdBy: { id: string; name: string };
  /** Data remote terkini (lokasi, jaringan, kontak). */
  remote: RemoteDetail;
}

/** Penutupan NPR (T98): penyebab dari daftar tetap, penyelesaian teks bebas. */
export interface TicketClosure {
  cause: TicketCloseCause;
  resolution: string;
  closedAt: string;
  closedBy: TicketPerson;
}

/** Isi `POST /api/tickets/:id/close`. NPR hanya ditutup dari Pulih · siap ditutup. */
export interface CloseTicket {
  cause: TicketCloseCause;
  resolution: string;
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
  /** Entri `ambil`: penanggung baru dan penanggung sebelumnya (diisi database). */
  assignee: { id: string; name: string } | null;
  assigneeFrom: { id: string; name: string } | null;
  /** Entri `tt_dibuat`, `tt_disalin`, dan `tt_ditutup`: TT yang dirujuk. */
  troubleTicket: { id: string; number: string } | null;
  /** Entri `tutup`: penyebab gangguan; penyelesaiannya di `note`. */
  closeCause: TicketCloseCause | null;
  attachments: TicketAttachment[];
}

/**
 * Isi `POST /api/tickets/:id/actions` (JSON, atau multipart dengan bagian `data` berisi JSON
 * ini dan berkas di bagian `lampiran`).
 */
export interface CreateTicketAction {
  kind: (typeof TICKET_ACTION_KINDS_SELECTABLE)[number] | 'koreksi';
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

/** Pengguna yang terlihat di NPR (pembuat, penanggung). `role`: l1, l2, admin. */
export interface TicketPerson {
  id: string;
  name: string;
  role: string;
}

/**
 * Isi `POST /api/tickets/:id/take` ("Ambil", T81): penanggung yang terlihat operator saat
 * menekan tombol (`null` = belum ada). Bila sudah berganti, jawabannya 409.
 */
export interface TakeTicket {
  expectedAssigneeId: string | null;
}

/** Tampilan bawaan antrean NPR (T82, mockup Tiket). */
export const TICKET_QUEUE_VIEWS = ['semua', 'saya', 'pending', 'eskalasi', 'siap'] as const;
export type TicketQueueView = (typeof TICKET_QUEUE_VIEWS)[number];

export const TICKET_QUEUE_VIEW_LABELS: Record<TicketQueueView, string> = {
  semua: 'Semua terbuka',
  saya: 'Milik saya',
  pending: 'Pending',
  eskalasi: 'Eskalasi',
  siap: 'Siap ditutup',
};

/** Urutan antrean (T83): mulai gangguan terlama dulu (bawaan), atau NPR terbaru dulu. */
export const TICKET_QUEUE_SORTS = ['mulai', 'terbaru'] as const;
export type TicketQueueSort = (typeof TICKET_QUEUE_SORTS)[number];

export const TICKET_PAGE_SIZE_DEFAULT = 25;
export const TICKET_PAGE_SIZE_MAX = 100;

/** Nilai saringan status antrean untuk semua status, termasuk Ditutup (langkah 2.1). */
export const TICKET_QUEUE_STATUS_ALL = 'semua';
export type TicketQueueStatusFilter = TicketStatus | typeof TICKET_QUEUE_STATUS_ALL;

/**
 * Saringan antrean NPR, sama dengan parameter `GET /api/tickets` di luar urutan dan halaman.
 * Overview (2.1) mengirim saringan ini bersama setiap angkanya, jadi angka dan daftar yang
 * dibuka selalu dihitung dengan syarat yang sama.
 * - `categoryName`: nama kategori tanpa membedakan huruf besar/kecil, di semua customer (T114).
 * - `region`: wilayah remote dari provinsinya (T113).
 * - `createdFrom`/`createdTo` (waktu NPR dibuat) dan `closedFrom`/`closedTo` (waktu ditutup):
 *   tanggal `YYYY-MM-DD` menurut WIB (T109), keduanya termasuk.
 * Tanpa saringan status, "Semua terbuka" tidak memuat NPR Ditutup (T87); `status=semua` dan
 * saringan tanggal ditutup memuatnya.
 */
export interface TicketQueueFilter {
  view?: TicketQueueView;
  tenantId?: string;
  categoryId?: string;
  categoryName?: string;
  systemId?: string;
  status?: TicketQueueStatusFilter;
  remoteId?: string;
  region?: RemoteRegion;
  q?: string;
  createdFrom?: string;
  createdTo?: string;
  closedFrom?: string;
  closedTo?: string;
}

/** Pola tanggal saringan antrean (`YYYY-MM-DD`, WIB). */
export const QUEUE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Satu baris antrean NPR. Waktu dalam ISO 8601 UTC. */
export interface TicketQueueItem {
  id: string;
  number: string;
  status: TicketStatus;
  tenantId: string;
  customerName: string;
  categoryName: string;
  systemName: string;
  customerTicketNumber: string | null;
  remote: { id: string; code: string; name: string; city: string | null; zone: RemoteZone };
  startedAt: string;
  createdAt: string;
  /** Waktu ditutup, bila status Ditutup (langkah 1.6). */
  closedAt: string | null;
  assignee: TicketPerson | null;
  /** Alasan pending terakhir, bila status sekarang pending. */
  pendingReason: string | null;
  /** Entri linimasa terakhir. */
  lastAction: { kind: TicketActionKind; at: string; byName: string };
}

/**
 * `GET /api/tickets`: satu halaman antrean. `counts` = jumlah NPR tiap tampilan bawaan
 * dengan saringan lain yang sama (customer, kategori, system, status, kata kunci).
 */
export interface TicketQueuePage {
  items: TicketQueueItem[];
  total: number;
  page: number;
  pageSize: number;
  counts: Record<TicketQueueView, number>;
}

/** Pencarian global (T84): paling sedikit 2 huruf. */
export const SEARCH_MIN_LENGTH = 2;
export const SEARCH_MAX_LENGTH = 100;

export interface SearchTicketHit {
  id: string;
  number: string;
  status: TicketStatus;
  customerTicketNumber: string | null;
  customerName: string;
  remote: { code: string; name: string };
}

export interface SearchTroubleTicketHit {
  id: string;
  number: string;
  status: TroubleTicketStatus;
  ticketId: string;
  ticketNumber: string;
  customerName: string;
  remote: { code: string; name: string };
}

export interface SearchRemoteHit {
  id: string;
  code: string;
  name: string;
  city: string | null;
  customerName: string;
}

/** Jawaban `GET /api/search?q=`: NPR (termasuk yang ditutup) dan remote, masing-masing terbatas. */
export interface GlobalSearchResult {
  tickets: SearchTicketHit[];
  troubleTickets: SearchTroubleTicketHit[];
  remotes: SearchRemoteHit[];
}

/**
 * Status TT (ATURAN.md §3): "Menunggu SD" sejak dibuat (1.5b), "Ditutup" oleh L2/admin (1.6,
 * T100). "Hasil masuk" menyusul di R3 (T93).
 */
export const TROUBLE_TICKET_STATUSES = ['menunggu_sd', 'ditutup'] as const;
export type TroubleTicketStatus = (typeof TROUBLE_TICKET_STATUSES)[number];

export const TROUBLE_TICKET_STATUS_LABELS: Record<TroubleTicketStatus, string> = {
  menunggu_sd: 'Menunggu SD',
  ditutup: 'Ditutup',
};

export const TROUBLE_TICKET_PROBLEM_MAX_LENGTH = 2000;
export const TROUBLE_TICKET_CONTACT_MAX_LENGTH = 300;

/** Bentuk nomor TT, mis. `TT/VSAT/BNA/2026/11/0093`. */
export const TT_NUMBER_PATTERN = /^TT\/[A-Z0-9]{2,10}\/[A-Z0-9]{2,10}\/\d{4}\/(0[1-9]|1[0-2])\/\d{4,}$/;

/** Isi `POST /api/tickets/:ticketId/trouble-tickets`. */
export interface CreateTroubleTicket {
  problem: string;
  /** Kontak di lokasi (T92); kosong = tanpa kontak. */
  contact?: string;
}

/** TT seperti tampil di halaman NPR. Waktu dalam ISO 8601 UTC. */
export interface TroubleTicket {
  id: string;
  number: string;
  status: TroubleTicketStatus;
  problem: string;
  contact: string | null;
  createdAt: string;
  createdBy: { id: string; name: string };
  /** Berapa kali ringkasan disalin untuk SD, dan kapan terakhir (K25). */
  copiedCount: number;
  lastCopiedAt: string | null;
  /** Teks siap tempel ke chat SD: no. TT, remote, lokasi, problem, kontak. */
  summary: string;
  /** Penutupan TT (T100): hasil kunjungan / penyelesaian; `null` selama TT belum ditutup. */
  closure: TroubleTicketClosure | null;
}

export interface TroubleTicketClosure {
  resolution: string;
  closedAt: string;
  closedBy: TicketPerson;
}

/** Isi `POST /api/trouble-tickets/:id/close` (hanya L2/admin, K21). */
export interface CloseTroubleTicket {
  resolution: string;
}

/** Satu baris daftar TT aktif. */
export interface TroubleTicketQueueItem {
  id: string;
  number: string;
  status: TroubleTicketStatus;
  ticket: { id: string; number: string };
  tenantId: string;
  customerName: string;
  remote: { id: string; code: string; name: string; city: string | null; zone: RemoteZone };
  problem: string;
  createdAt: string;
  createdByName: string;
  copiedCount: number;
  lastCopiedAt: string | null;
}

/** `GET /api/trouble-tickets`: satu halaman TT aktif, terlama dulu. */
export interface TroubleTicketPage {
  items: TroubleTicketQueueItem[];
  total: number;
  page: number;
  pageSize: number;
}

/** Jawaban `POST /api/trouble-tickets/:id/copied`. */
export interface TroubleTicketCopied {
  copiedCount: number;
  lastCopiedAt: string;
}

/** Satu NPR di riwayat halaman remote (T101). Waktu dalam ISO 8601 UTC. */
export interface RemoteTicketHistoryItem {
  id: string;
  number: string;
  status: TicketStatus;
  categoryName: string;
  startedAt: string;
  /**
   * Waktu remote pulih (waktu kejadian entri terakhir yang memindahkan NPR ke Pulih), bila
   * status sekarang Pulih atau Ditutup; `null` = gangguan masih berjalan.
   */
  recoveredAt: string | null;
  closeCause: TicketCloseCause | null;
  resolution: string | null;
  closedAt: string | null;
  troubleTickets: Array<{ id: string; number: string; status: TroubleTicketStatus }>;
}

/** `GET /api/remotes/:remoteId/tickets`: semua NPR remote itu, mulai gangguan terbaru dulu. */
export interface RemoteTicketHistoryPage {
  items: RemoteTicketHistoryItem[];
  total: number;
  page: number;
  pageSize: number;
}

export const REMOTE_HISTORY_PAGE_SIZE_DEFAULT = 10;
export const REMOTE_HISTORY_PAGE_SIZE_MAX = 50;
