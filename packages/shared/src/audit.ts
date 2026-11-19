/** Asal perubahan yang dicatat di jejak audit. */
export const AUDIT_SOURCES = ['api', 'sistem', 'cli', 'seed', 'migrasi', 'manual'] as const;
export type AuditSource = (typeof AUDIT_SOURCES)[number];

/** Jenis catatan audit: perubahan baris data, atau peristiwa login. */
export const AUDIT_ACTIONS = ['insert', 'update', 'delete', 'login', 'login_failed', 'logout'] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/** Satu catatan jejak audit, seperti dikirim `GET /api/audit`. */
export interface AuditEntry {
  /** Bilangan bulat sebagai teks (bigint). Urutan naik = urutan kejadian. */
  id: string;
  /** ISO 8601 UTC. */
  occurredAt: string;
  /** Catatan dengan nilai yang sama berasal dari satu transaksi (satu tindakan). */
  transactionId: string;
  source: AuditSource;
  actorUserId: string | null;
  actorLabel: string | null;
  clientIp: string | null;
  action: AuditAction;
  tableName: string | null;
  rowId: string | null;
  tenantId: string | null;
  /**
   * insert/delete: isi baris; update: `{ kolom: [lama, baru] }` hanya kolom yang berubah;
   * peristiwa login: keterangan tambahan. Kolom rahasia tidak pernah berisi nilainya.
   */
  changes: unknown;
}

export interface AuditPage {
  entries: AuditEntry[];
  /** Isi ke `before` untuk halaman berikutnya; `null` bila sudah habis. */
  nextBefore: string | null;
}

export const AUDIT_PAGE_MAX = 200;
export const AUDIT_PAGE_DEFAULT = 50;
