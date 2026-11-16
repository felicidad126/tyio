import type { UserRole } from '@tyio/shared';
import { EntitySchema } from 'typeorm';

export interface User {
  id: string;
  /** Selalu huruf kecil; dibandingkan tanpa membedakan huruf besar. */
  username: string;
  displayName: string;
  /** Format PHC argon2id, lihat modules/auth/password.ts. */
  passwordHash: string;
  role: UserRole;
  /** true = boleh melihat semua tenant (tim NOC); false = hanya tenant di user_tenants. */
  allTenants: boolean;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export const UserEntity = new EntitySchema<User>({
  name: 'User',
  tableName: 'users',
  columns: {
    id: {
      type: 'uuid',
      primary: true,
      default: () => 'uuidv7()',
      primaryKeyConstraintName: 'users_pkey',
    },
    username: { type: 'varchar', length: 64 },
    displayName: { name: 'display_name', type: 'varchar', length: 120 },
    passwordHash: { name: 'password_hash', type: 'text' },
    role: { type: 'varchar', length: 16 },
    allTenants: { name: 'all_tenants', type: 'boolean', default: false },
    active: { type: 'boolean', default: true },
    createdAt: { name: 'created_at', type: 'timestamptz', createDate: true },
    updatedAt: { name: 'updated_at', type: 'timestamptz', updateDate: true },
  },
  uniques: [{ name: 'users_username_key', columns: ['username'] }],
  checks: [
    { name: 'users_username_format', expression: `username ~ '^[a-z0-9._-]{3,64}$'` },
    { name: 'users_role_valid', expression: `role IN ('L1', 'L2', 'admin')` },
  ],
});
