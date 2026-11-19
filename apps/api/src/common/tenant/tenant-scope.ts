import type { ObjectLiteral, SelectQueryBuilder } from 'typeorm';

/**
 * Customer yang datanya boleh dilihat pengguna (K26): semua, atau daftar tertentu.
 * Satu-satunya tempat penyaringan tenant (T9): setiap query data customer melewati
 * `applyTenantScope`, dan data di luar cakupan diperlakukan seperti tidak ada (404).
 */
export type TenantScope =
  | { readonly all: true }
  | { readonly all: false; readonly tenantIds: readonly string[] };

export const ALL_TENANTS: TenantScope = Object.freeze({ all: true });

/** Bentuk minimal pengguna yang dibutuhkan untuk menghitung cakupan. */
export interface ScopedUser {
  allTenants: boolean;
  tenants?: ReadonlyArray<{ id: string; active: boolean }>;
}

/** Cakupan pengguna: customer nonaktif tidak ikut, juga bila pernah ditautkan. */
export function scopeFor(user: ScopedUser): TenantScope {
  if (user.allTenants) return ALL_TENANTS;
  const tenantIds = (user.tenants ?? []).filter((tenant) => tenant.active).map((tenant) => tenant.id);
  return Object.freeze({ all: false, tenantIds: Object.freeze(tenantIds) });
}

export function scopeIncludes(scope: TenantScope, tenantId: string | null | undefined): boolean {
  if (scope.all) return true;
  return typeof tenantId === 'string' && scope.tenantIds.includes(tenantId);
}

/**
 * Membatasi query ke customer dalam cakupan. `column` adalah kolom tenant dengan alias,
 * mis. `remote.tenantId` atau `tenant.id`. Baris tanpa tenant (NULL) hanya terlihat oleh
 * cakupan "semua customer".
 */
export function applyTenantScope<T extends ObjectLiteral>(
  query: SelectQueryBuilder<T>,
  scope: TenantScope,
  column: string,
): SelectQueryBuilder<T> {
  if (scope.all) return query;
  if (scope.tenantIds.length === 0) return query.andWhere('1 = 0');
  // Nama parameter unik per kolom agar bisa dipakai lebih dari sekali dalam satu query.
  const param = `tenantScope_${column.replace(/\W/g, '_')}`;
  return query.andWhere(`${column} IN (:...${param})`, { [param]: [...scope.tenantIds] });
}
