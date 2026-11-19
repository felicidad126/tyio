/**
 * Peran pengguna portal (K20, K24). L3 menyusul setelah isinya diketahui.
 * Disimpan sebagai teks di database; urutan di sini juga urutan tampilan.
 */
export const ROLES = ['l1', 'l2', 'admin'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  l1: 'L1 Monitoring',
  l2: 'L2 NOC',
  admin: 'Admin',
};

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

/** Isi `POST /api/auth/login`. Email tidak peka huruf besar/kecil. */
export interface LoginRequest {
  email: string;
  password: string;
}

/** Customer (tenant) yang boleh diakses pengguna. */
export interface TenantSummary {
  id: string;
  /** Kode pendek untuk penomoran NPR/TT, mis. `BNA`. */
  code: string;
  name: string;
}

/**
 * Pengguna yang sedang login: jawaban `POST /api/auth/login` dan `GET /api/auth/me`.
 * `allTenants` = boleh melihat semua customer (bawaan staf NOC); bila `false`, aksesnya
 * terbatas pada `tenants`. Pada keduanya, `tenants` berisi customer aktif yang boleh diakses.
 */
export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  allTenants: boolean;
  tenants: TenantSummary[];
}

/** Batas panjang masukan login; masukan lebih panjang ditolak sebelum diproses. */
export const EMAIL_MAX_LENGTH = 254;
export const PASSWORD_MAX_LENGTH = 1024;
/** Panjang minimum kata sandi baru. */
export const PASSWORD_MIN_LENGTH = 12;
