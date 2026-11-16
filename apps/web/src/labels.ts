import type { TenantScope, UserRole } from '@tyio/shared';

/** Nama peran seperti dipakai tim (K20). */
export const ROLE_LABELS: Record<UserRole, string> = {
  L1: 'L1 Monitoring',
  L2: 'L2 NOC',
  admin: 'Admin',
};

export function tenantScopeLabel(scope: TenantScope): string {
  if (scope.all) return 'Semua customer';
  if (scope.tenants.length === 0) return 'Belum ada customer';
  return scope.tenants.map((t) => t.name).join(', ');
}
