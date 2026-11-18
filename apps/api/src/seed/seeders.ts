import { findProvince, TIME_ZONES, type UserRole } from '@tyio/shared';
import type { EntityManager, EntityTarget, ObjectLiteral } from 'typeorm';
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity.js';
import { hashPassword } from '../modules/auth/password.js';
import { JarkomEntity, MASTER_ENTITIES } from '../modules/master/master.entities.js';
import { RemoteEntity, type Remote } from '../modules/remotes/remote.entity.js';
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
    // Nilai "Remote Status" dari form NPR lama, yang menggantikan kategori (K43).
    { code: 'RD', name: 'Remote Down' },
    { code: 'REL', name: 'Relokasi' },
    { code: 'REP', name: 'Reposisi' },
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

/**
 * Kota tempat remote rekaan tiap customer contoh, dengan koordinat kira-kira. Dipilih
 * tersebar di ketiga zona waktu. Nama remote, kontak, dan alamat IP semuanya rekaan.
 */
const DEMO_CITIES: Record<string, Array<[city: string, province: string, lat: number, lon: number]>> = {
  MRS: [
    ['Yogyakarta', 'DI Yogyakarta', -7.797, 110.37],
    ['Sleman', 'DI Yogyakarta', -7.716, 110.355],
    ['Magelang', 'Jawa Tengah', -7.47, 110.217],
    ['Klaten', 'Jawa Tengah', -7.706, 110.606],
    ['Boyolali', 'Jawa Tengah', -7.533, 110.596],
  ],
  BCN: [
    ['Jayapura', 'Papua', -2.533, 140.718],
    ['Merauke', 'Papua Selatan', -8.493, 140.401],
    ['Sorong', 'Papua Barat Daya', -0.876, 131.255],
    ['Ambon', 'Maluku', -3.695, 128.181],
    ['Ternate', 'Maluku Utara', 0.79, 127.384],
  ],
  BLH: [
    ['Malang', 'Jawa Timur', -7.983, 112.621],
    ['Denpasar', 'Bali', -8.65, 115.216],
    ['Makassar', 'Sulawesi Selatan', -5.148, 119.432],
    ['Balikpapan', 'Kalimantan Timur', -1.265, 116.831],
    ['Medan', 'Sumatera Utara', 3.595, 98.672],
  ],
};
const DEMO_PLACES = ['Pasar Raya', 'Kantor Cabang', 'Terminal', 'Rumah Sakit', 'Kampus'];

function demoRemotes(tenantId: string, code: string, tenantIndex: number, jarkomIds: string[]): Array<Partial<Remote>> {
  return Array.from({ length: 25 }, (_, n) => {
    const i = n + 1;
    const [city, province, lat, lon] = DEMO_CITIES[code]![n % 5]!;
    const zone = findProvince(province)!.zone;
    return {
      tenantId,
      siteId: `${code}-${String(i).padStart(3, '0')}`,
      name: `ATM ${DEMO_PLACES[Math.floor(n / 5)]} ${city}`,
      jarkomId: jarkomIds[i % 4 === 0 ? 1 : 0],
      status: i % 20 === 0 ? 'dibongkar' : i % 12 === 0 ? 'nonaktif' : 'aktif',
      address: `Jl. Contoh No. ${i}, ${city}`,
      city,
      province,
      timeZone: TIME_ZONES[zone],
      latitude: (lat + n * 0.001).toFixed(6),
      longitude: (lon + n * 0.001).toFixed(6),
      ipSnmp: `10.${10 + tenantIndex}.0.${i}`,
      ipLan: `10.${100 + tenantIndex}.${i}.0/29`,
      kanwil: `Kanwil Contoh ${tenantIndex + 1}`,
      kanca: `KC ${city}`,
      onlineDate: `2023-${String((n % 12) + 1).padStart(2, '0')}-15`,
      contacts: [
        { name: `Petugas Contoh ${i}`, role: 'Pengelola', phone: `021-0000-${String(i).padStart(4, '0')}`, email: null },
      ],
    };
  });
}

export const DEMO_USERS: ReadonlyArray<{
  username: string;
  displayName: string;
  role: UserRole;
  /** Kosong = semua tenant. */
  tenantCodes?: string[];
}> = [
  { username: 'admin.contoh', displayName: 'Admin Contoh', role: 'admin' },
  { username: 'helpdesk.contoh', displayName: 'Helpdesk Contoh', role: 'helpdesk' },
  { username: 'helpdesk.merapi', displayName: 'Helpdesk Merapi', role: 'helpdesk', tenantCodes: ['MRS'] },
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
      name: 'remote contoh',
      run: async (manager) => {
        const jarkoms = await Promise.all(
          DEMO_MASTER.jarkom.map((j) => manager.findOneByOrFail(JarkomEntity, { code: j.code })),
        );
        for (const [index, demo] of DEMO_TENANTS.entries()) {
          const tenant = await manager.findOneByOrFail(TenantEntity, { code: demo.code });
          await insertIgnoringExisting(
            manager,
            RemoteEntity,
            demoRemotes(tenant.id, demo.code, index, jarkoms.map((j) => j.id)),
          );
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
