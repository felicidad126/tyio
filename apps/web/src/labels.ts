import type { TenantScope, UserRole } from '@tyio/shared';

/** Nama peran seperti dipakai tim (K30, K46). */
export const ROLE_LABELS: Record<UserRole, string> = {
  helpdesk: 'Helpdesk',
  admin: 'Admin',
};

export function tenantScopeLabel(scope: TenantScope): string {
  if (scope.all) return 'Semua customer';
  if (scope.tenants.length === 0) return 'Belum ada customer';
  return scope.tenants.map((t) => t.name).join(', ');
}
