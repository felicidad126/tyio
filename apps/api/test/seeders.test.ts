import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { dataSourceOptions } from '../src/db/options.js';
import { verifyPassword } from '../src/modules/users/password.js';
import {
  createSeeders,
  DEV_SEED_PASSWORD,
  SEED_TENANTS,
  SEED_USERS,
  seedUserPassword,
} from '../src/seed/seeders.js';
import { seed } from '../src/seed/seed.js';
import { testConfig } from './test-config.js';

describe('kata sandi akun dummy', () => {
  it('memakai bawaan yang diketahui hanya di development dan test', () => {
    expect(seedUserPassword('development', {})).toBe(DEV_SEED_PASSWORD);
    expect(seedUserPassword('test', {})).toBe(DEV_SEED_PASSWORD);
  });

  it('mewajibkan SEED_USER_PASSWORD di staging', () => {
    expect(() => seedUserPassword('staging', {})).toThrow(/SEED_USER_PASSWORD wajib/);
    expect(seedUserPassword('staging', { SEED_USER_PASSWORD: 'sandi-staging-panjang' })).toBe(
      'sandi-staging-panjang',
    );
  });

  it('menolak SEED_USER_PASSWORD yang terlalu pendek', () => {
    expect(() => seedUserPassword('development', { SEED_USER_PASSWORD: 'pendek' })).toThrow(
      /minimal 12/,
    );
  });
});

describe('seeder tenant dan pengguna', () => {
  const dataSource = new DataSource(dataSourceOptions(testConfig().databaseUrl));

  beforeAll(async () => {
    await dataSource.initialize();
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  it('bisa dijalankan berulang dan membuat akun sesuai daftar', async () => {
    // Satu-satunya uji yang menyentuh email dan kode tetap dari daftar seed;
    // dijalankan dua kali untuk membuktikan seed aman diulang.
    const seeders = createSeeders({ userPassword: () => DEV_SEED_PASSWORD });
    await seed(dataSource, 'test', seeders);
    await seed(dataSource, 'test', seeders);

    const tenants: Array<{ code: string; name: string }> = await dataSource.query(
      'SELECT code, name FROM tenants WHERE code = ANY($1) ORDER BY code',
      [SEED_TENANTS.map((tenant) => tenant.code)],
    );
    expect(tenants).toEqual(
      [...SEED_TENANTS].sort((a, b) => a.code.localeCompare(b.code)).map(({ code, name }) => ({ code, name })),
    );

    const users: Array<{ email: string; role: string; all_tenants: boolean; password_hash: string; codes: string[] }> =
      await dataSource.query(
        `SELECT u.email, u.role, u.all_tenants, u.password_hash,
                coalesce(array_agg(t.code ORDER BY t.code) FILTER (WHERE t.code IS NOT NULL), '{}') AS codes
         FROM users u
         LEFT JOIN user_tenants ut ON ut.user_id = u.id
         LEFT JOIN tenants t ON t.id = ut.tenant_id
         WHERE u.email = ANY($1)
         GROUP BY u.id
         ORDER BY u.email`,
        [SEED_USERS.map((user) => user.email)],
      );
    expect(users).toHaveLength(SEED_USERS.length);

    const rudi = users.find((user) => user.email === 'rudi@noc.example');
    expect(rudi).toMatchObject({ role: 'l1', all_tenants: false, codes: ['BAD', 'BNA'] });
    const admin = users.find((user) => user.email === 'admin@noc.example');
    expect(admin).toMatchObject({ role: 'admin', all_tenants: true, codes: [] });
    expect(await verifyPassword(DEV_SEED_PASSWORD, admin?.password_hash ?? '')).toBe(true);
  });

  it('tidak membaca kata sandi bila seeder pengguna tidak dijalankan', () => {
    let read = false;
    createSeeders({
      userPassword: () => {
        read = true;
        return DEV_SEED_PASSWORD;
      },
    });

    expect(read).toBe(false);
  });
});
