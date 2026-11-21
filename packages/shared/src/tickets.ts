import type { RemoteDetail } from './remotes.js';

/**
 * Tiket (langkah 1.3). NPR = catatan downtime satu remote beserta penyebabnya (K16).
 * Nomornya `NPR/JARKOM/CUSTOMER/TAHUN/BULAN/urut`: TAHUN/BULAN menurut zona waktu remote
 * saat NPR disimpan (T55), urut mulai dari 0001 setiap bulan untuk setiap jarkom setiap
 * customer (T56). TT (1.5b) memakai penghitung yang sama dengan jenis `TT`.
 */

/** Status tiket. 1.3 hanya membuat NPR "Terbuka"; alur status lengkap menyusul di 1.4. */
export const TICKET_STATUSES = ['terbuka'] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  terbuka: 'Terbuka',
};

/** Status yang dihitung "masih terbuka" untuk peringatan saat membuat NPR baru. */
export const OPEN_TICKET_STATUSES: readonly TicketStatus[] = ['terbuka'];

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
