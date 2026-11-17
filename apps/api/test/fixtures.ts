import type { UserRole } from '@tyio/shared';
import type { DataSource } from 'typeorm';
import { type Actor, withActor } from '../src/common/audit/actor.js';
import type { MasterRow } from '../src/db/master-entity.js';
import { hashPassword } from '../src/modules/auth/password.js';
import { JarkomEntity } from '../src/modules/master/master.entities.js';
import { RemoteEntity, type Remote } from '../src/modules/remotes/remote.entity.js';
import { TenantEntity, type Tenant } from '../src/modules/tenants/tenant.entity.js';
import { UserTenantEntity } from '../src/modules/users/user-tenant.entity.js';
import { UserEntity, type User } from '../src/modules/users/user.entity.js';

export const TEST_PASSWORD = 'sandi-uji-yang-panjang';
export const TEST_ACTOR: Actor = { name: 'uji' };

export async function createTenant(ds: DataSource, code: string, name = `Bank ${code}`): Promise<Tenant> {
  return withActor(ds, TEST_ACTOR, (m) => m.getRepository(TenantEntity).save({ code, name }));
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
  const passwordHash = await hashPassword(options.password ?? TEST_PASSWORD);
  return withActor(ds, TEST_ACTOR, async (m) => {
    const user = await m.getRepository(UserEntity).save({
      username: options.username,
      displayName: `Pengguna ${options.username}`,
      passwordHash,
      role: options.role ?? 'L1',
      allTenants: options.allTenants ?? true,
      active: options.active ?? true,
    });
    for (const tenant of options.tenants ?? []) {
      await m.getRepository(UserTenantEntity).save({ userId: user.id, tenantId: tenant.id });
    }
    return user;
  });
}

/** Mengubah data di luar aplikasi (mis. menonaktifkan pengguna) dengan pelaku uji. */
export function asTester<T>(ds: DataSource, work: Parameters<typeof withActor<T>>[2]): Promise<T> {
  return withActor(ds, TEST_ACTOR, work);
}

/** Mengambil nilai cookie sesi dari header Set-Cookie jawaban login. */
export function sessionCookieFrom(setCookie: string | string[] | undefined): string {
  const header = [setCookie ?? []].flat().find((c) => c.includes('tyio_sid='));
  if (!header) throw new Error('Jawaban tidak memasang cookie sesi');
  return header.split(';')[0] ?? '';
}

/** Jarkom uji; dibuat sekali per kode. */
export async function ensureJarkom(ds: DataSource, code = 'UJI', name = `Jarkom ${code}`): Promise<MasterRow> {
  const existing = await ds.getRepository(JarkomEntity).findOneBy({ code });
  return existing ?? withActor(ds, TEST_ACTOR, (m) => m.getRepository(JarkomEntity).save({ code, name }));
}

/** Remote uji minimal milik `tenant`; kolom lain bisa ditimpa lewat `overrides`. */
export async function createRemote(
  ds: DataSource,
  tenant: Tenant,
  siteId: string,
  overrides: Partial<Remote> = {},
): Promise<Remote> {
  const jarkom = await ensureJarkom(ds);
  return withActor(ds, TEST_ACTOR, (m) =>
    m.getRepository(RemoteEntity).save({
      tenantId: tenant.id,
      siteId,
      name: `Remote ${siteId}`,
      jarkomId: jarkom.id,
      city: 'Kota Uji',
      province: 'Jawa Timur',
      timeZone: 'Asia/Jakarta',
      ...overrides,
    }),
  );
}
