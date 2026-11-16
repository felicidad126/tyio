import { EntitySchema } from 'typeorm';
import { TenantEntity } from '../tenants/tenant.entity.js';
import { UserEntity } from './user.entity.js';

/** Tenant yang boleh dilihat pengguna yang `allTenants = false`. */
export interface UserTenant {
  userId: string;
  tenantId: string;
}

export const UserTenantEntity = new EntitySchema<UserTenant>({
  name: 'UserTenant',
  tableName: 'user_tenants',
  columns: {
    userId: {
      name: 'user_id',
      type: 'uuid',
      primary: true,
      primaryKeyConstraintName: 'user_tenants_pkey',
      foreignKey: { target: UserEntity, name: 'user_tenants_user_id_fkey', onDelete: 'CASCADE' },
    },
    tenantId: {
      name: 'tenant_id',
      type: 'uuid',
      primary: true,
      primaryKeyConstraintName: 'user_tenants_pkey',
      foreignKey: {
        target: TenantEntity,
        name: 'user_tenants_tenant_id_fkey',
        onDelete: 'RESTRICT',
      },
    },
  },
  indices: [{ name: 'user_tenants_tenant_id_idx', columns: ['tenantId'] }],
});
