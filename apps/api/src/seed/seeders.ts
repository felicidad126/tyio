import type { UserRole } from '@tyio/shared';
import type { EntityManager, EntityTarget, ObjectLiteral } from 'typeorm';
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity.js';
import { hashPassword } from '../modules/auth/password.js';
import { MASTER_ENTITIES } from '../modules/master/master.entities.js';
import { TenantEntity } from '../modules/tenants/tenant.entity.js';
import { UserTenantEntity } from '../modules/users/user-tenant.entity.js';
import { UserEntity } from '../modules/users/user.entity.js';
import type { Seeder } from './seed.js';

// Semua nama di sini rekaan (K22): bukan bank, orang, atau alamat sungguhan.
export const DEMO_TENANTS = [
  { code: 'MRS', name: 'Bank Merapi Sejahtera' },
  { code: 'BCN', name: 'Bank Cendrawasih Nusantara' },
  { code: 'BLH', name: 'Bank Lembah Hijau' },
] as const;

/**
 * Master contoh. Kategori diambil dari dashboard lama; arti "System" belum dibahas dengan
 * user dan nilai jarkom yang dipakai belum diketahui, jadi keduanya jelas bertanda contoh.
 */
export const DEMO_MASTER = {
  kategori: [
    { code: 'RD', name: 'Remote Down' },
    { code: 'CM', name: 'Corrective Maintenance' },
    { code: 'PM', name: 'Preventive Maintenance' },
  ],
  system: [
    { code: 'SYSA', name: 'System Contoh A' },
    { code: 'SYSB', name: 'System Contoh B' },
  ],
  jarkom: [
    { code: 'VSAT', name: 'VSAT' },
    { code: 'JKCA', name: 'Jarkom Contoh A' },
  ],
} as const;

export const DEMO_USERS: ReadonlyArray<{
  username: string;
  displayName: string;
  role: UserRole;
  /** Kosong = semua tenant. */
  tenantCodes?: string[];
}> = [
  { username: 'admin.contoh', displayName: 'Admin Contoh', role: 'admin' },
  { username: 'l2.contoh', displayName: 'Operator L2 Contoh', role: 'L2' },
  { username: 'l1.contoh', displayName: 'Operator L1 Contoh', role: 'L1' },
  { username: 'l1.merapi', displayName: 'Operator L1 Merapi', role: 'L1', tenantCodes: ['MRS'] },
];

/** Urutan penting: tenant lebih dulu, karena pengguna merujuk ke tenant. */
export function createSeeders(options: { password: string }): Seeder[] {
  return [
    {
      name: 'tenant contoh',
      run: async (manager) => {
        await insertIgnoringExisting(manager, TenantEntity, [...DEMO_TENANTS]);
      },
    },
    {
      name: 'master contoh',
      run: async (manager) => {
        for (const [list, rows] of Object.entries(DEMO_MASTER)) {
          await insertIgnoringExisting(manager, MASTER_ENTITIES[list as keyof typeof DEMO_MASTER], [
            ...rows,
          ]);
        }
      },
    },
    {
      name: 'pengguna contoh',
      run: async (manager) => {
        const passwordHash = await hashPassword(options.password);
        await insertIgnoringExisting(
          manager,
          UserEntity,
          DEMO_USERS.map((u) => ({
            username: u.username,
            displayName: u.displayName,
            role: u.role,
            allTenants: !u.tenantCodes,
            passwordHash,
          })),
        );
        for (const user of DEMO_USERS) {
          for (const code of user.tenantCodes ?? []) {
            const [userRow, tenantRow] = await Promise.all([
              manager.findOneByOrFail(UserEntity, { username: user.username }),
              manager.findOneByOrFail(TenantEntity, { code }),
            ]);
            await insertIgnoringExisting(manager, UserTenantEntity, [
              { userId: userRow.id, tenantId: tenantRow.id },
            ]);
          }
        }
      },
    },
  ];
}

/** Idempoten: baris yang sudah ada (mis. kata sandi yang sudah diganti) tidak ditimpa. */
async function insertIgnoringExisting<T extends ObjectLiteral>(
  manager: EntityManager,
  entity: EntityTarget<T>,
  rows: QueryDeepPartialEntity<T>[],
): Promise<void> {
  await manager.createQueryBuilder().insert().into(entity).values(rows).orIgnore().execute();
}
