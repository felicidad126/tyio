/** Peran yang dipasang di R0 (K24). L3 menyusul; SD tidak login (K23). */
export const USER_ROLES = ['L1', 'L2', 'admin'] as const;
export type UserRole = (typeof USER_ROLES)[number];

/** Customer (bank). Setiap remote, tiket, dan laporan milik satu tenant (R-E). */
export interface TenantRef {
  id: string;
  code: string;
  name: string;
}

/** Tenant yang boleh dilihat pengguna: semua customer (tim NOC) atau daftar tertentu. */
export type TenantScope = { all: true } | { all: false; tenants: TenantRef[] };

export interface SessionUser {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  tenantScope: TenantScope;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface SessionResponse {
  user: SessionUser;
}

/** Bentuk jawaban galat dari API. */
export interface ApiErrorBody {
  statusCode: number;
  message: string;
  /** Hanya pada 429: berapa detik lagi boleh mencoba. */
  retryAfterSeconds?: number;
  /** Kolom isian yang bermasalah, agar pesan tampil di bawah kolom itu. */
  field?: string;
}

export interface TenantListResponse {
  tenants: TenantRef[];
}

export interface TenantResponse {
  tenant: TenantRef;
}
