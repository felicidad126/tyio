import type { UserRole } from '@tyio/shared';
import type { DataSource } from 'typeorm';
import { hashPassword } from '../src/modules/auth/password.js';
import { TenantEntity, type Tenant } from '../src/modules/tenants/tenant.entity.js';
import { UserTenantEntity } from '../src/modules/users/user-tenant.entity.js';
import { UserEntity, type User } from '../src/modules/users/user.entity.js';

export const TEST_PASSWORD = 'sandi-uji-yang-panjang';

export async function createTenant(ds: DataSource, code: string, name = `Bank ${code}`): Promise<Tenant> {
  return ds.getRepository(TenantEntity).save({ code, name });
}

export async function createUser(
  ds: DataSource,
  options: {
    username: string;
    role?: UserRole;
    password?: string;
    allTenants?: boolean;
    tenants?: Tenant[];
    active?: boolean;
  },
): Promise<User> {
  const user = await ds.getRepository(UserEntity).save({
    username: options.username,
    displayName: `Pengguna ${options.username}`,
    passwordHash: await hashPassword(options.password ?? TEST_PASSWORD),
    role: options.role ?? 'L1',
    allTenants: options.allTenants ?? true,
    active: options.active ?? true,
  });
  for (const tenant of options.tenants ?? []) {
    await ds.getRepository(UserTenantEntity).save({ userId: user.id, tenantId: tenant.id });
  }
  return user;
}

/** Mengambil nilai cookie sesi dari header Set-Cookie jawaban login. */
export function sessionCookieFrom(setCookie: string | string[] | undefined): string {
  const header = [setCookie ?? []].flat().find((c) => c.includes('tyio_sid='));
  if (!header) throw new Error('Jawaban tidak memasang cookie sesi');
  return header.split(';')[0] ?? '';
}
