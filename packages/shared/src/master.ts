/**
 * Data master per customer (langkah 1.1): pilihan yang dipakai tiket dan laporan.
 * Setiap customer punya daftarnya sendiri (T44). Nilai yang sudah dipakai tidak bisa
 * dihapus, hanya dinonaktifkan.
 *
 * - **kategori**: jenis kejadian di tiket, mis. Remote Down, Corrective, Preventive.
 * - **system**: alat monitoring sumber gangguan, mis. SNMP NOC, NMS VSAT (T43).
 * - **jarkom**: jenis jaringan komputer remote (K11), mis. VSAT, VPN. Kodenya masuk ke
 *   nomor `NPR/JARKOM/CUSTOMER/TAHUN/BULAN/urut`, jadi kode tidak bisa diubah.
 */
export const MASTER_KINDS = ['kategori', 'system', 'jarkom'] as const;
export type MasterKind = (typeof MASTER_KINDS)[number];

export const MASTER_KIND_LABELS: Record<MasterKind, string> = {
  kategori: 'Kategori',
  system: 'System',
  jarkom: 'Jarkom',
};

/** Jenis master yang punya kode untuk penomoran tiket. */
export const MASTER_KINDS_WITH_CODE: readonly MasterKind[] = ['jarkom'];

export function isMasterKind(value: unknown): value is MasterKind {
  return typeof value === 'string' && (MASTER_KINDS as readonly string[]).includes(value);
}

/** Satu nilai master, seperti dikirim `GET /api/master/<jenis>`. */
export interface MasterValue {
  id: string;
  tenantId: string;
  name: string;
  /** Hanya untuk jarkom; `null` untuk jenis lain. */
  code: string | null;
  active: boolean;
}

/** Isi `POST /api/master/<jenis>`. `code` wajib untuk jarkom dan dilarang untuk jenis lain. */
export interface CreateMasterValue {
  tenantId: string;
  name: string;
  code?: string;
}

/** Isi `PATCH /api/master/<jenis>/:id`. Customer dan kode tidak bisa diubah. */
export interface UpdateMasterValue {
  name?: string;
  active?: boolean;
}

/** Customer seperti dikelola admin (`/api/master/customer`), termasuk yang nonaktif. */
export interface CustomerRecord {
  id: string;
  code: string;
  name: string;
  active: boolean;
}

/** Isi `POST /api/master/customer`. */
export interface CreateCustomer {
  code: string;
  name: string;
}

/** Isi `PATCH /api/master/customer/:id`. Kode tidak bisa diubah (dipakai di nomor tiket). */
export interface UpdateCustomer {
  name?: string;
  active?: boolean;
}

export const MASTER_NAME_MAX_LENGTH = 80;
/** Kode customer dan jarkom: 2–10 huruf besar atau angka. */
export const MASTER_CODE_PATTERN = /^[A-Z0-9]{2,10}$/;
