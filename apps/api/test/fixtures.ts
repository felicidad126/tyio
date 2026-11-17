import type { UserRole } from '@tyio/shared';
import type { DataSource } from 'typeorm';
import { type Actor, withActor } from '../src/common/audit/actor.js';
import type { MasterRow } from '../src/db/master-entity.js';
import { hashPassword } from '../src/modules/auth/password.js';
import { JarkomEntity, TicketCategoryEntity } from '../src/modules/master/master.entities.js';
import { RemoteEntity, type Remote } from '../src/modules/remotes/remote.entity.js';
import { TicketEntity, type Ticket } from '../src/modules/tickets/ticket.entity.js';
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
    displayName?: string;
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
      displayName: options.displayName ?? `Pengguna ${options.username}`,
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

/** Kategori tiket uji; dibuat sekali per kode. */
export async function ensureCategory(ds: DataSource, code = 'RD', name = `Kategori ${code}`): Promise<MasterRow> {
  const existing = await ds.getRepository(TicketCategoryEntity).findOneBy({ code });
  return existing ?? withActor(ds, TEST_ACTOR, (m) => m.getRepository(TicketCategoryEntity).save({ code, name }));
}

/** Tiket uji langsung di database (tanpa API), dengan nomor yang diberikan. */
export async function createTicket(
  ds: DataSource,
  remote: Remote,
  number: string,
  overrides: Partial<Ticket> = {},
): Promise<Ticket> {
  const category = await ensureCategory(ds);
  const creator =
    (await ds.getRepository(UserEntity).findOneBy({ username: 'pembuat.uji' })) ??
    (await createUser(ds, { username: 'pembuat.uji' }));
  return withActor(ds, TEST_ACTOR, (m) =>
    m.getRepository(TicketEntity).save({
      tenantId: remote.tenantId,
      remoteId: remote.id,
      number,
      categoryId: category.id,
      occurredAt: new Date('2026-11-01T01:00:00Z'),
      problem: 'Remote down (uji)',
      createdById: creator.id,
      ...overrides,
    }),
  );
}
