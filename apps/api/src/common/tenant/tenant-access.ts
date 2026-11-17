import type { SessionUser } from '@tyio/shared';

/** Tenant yang boleh dibaca dalam satu permintaan. */
export type TenantAccess = { all: true } | { all: false; tenantIds: string[] };

/** Tanpa pengguna (seharusnya tidak terjadi di rute yang dilindungi): tidak melihat apa pun. */
export function tenantAccessOf(user: SessionUser | undefined): TenantAccess {
  if (!user) return { all: false, tenantIds: [] };
  const scope = user.tenantScope;
  return scope.all ? { all: true } : { all: false, tenantIds: scope.tenants.map((t) => t.id) };
}
