import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { verifyPassword } from '../src/modules/auth/password.js';
import { TenantEntity } from '../src/modules/tenants/tenant.entity.js';
import { UserTenantEntity } from '../src/modules/users/user-tenant.entity.js';
import { UserEntity } from '../src/modules/users/user.entity.js';
import { DEV_SEED_PASSWORD, seedPassword } from '../src/seed/seed-password.js';
import { seed } from '../src/seed/seed.js';
import { createSeeders, DEMO_TENANTS, DEMO_USERS } from '../src/seed/seeders.js';
import { resetData, testDataSource } from './db.js';

describe('data contoh (tenant dan pengguna)', () => {
  const ds = testDataSource();

  beforeAll(async () => {
    await ds.initialize();
  });

  afterAll(async () => {
    await ds.destroy();
  });

  beforeEach(async () => {
    await resetData(ds);
  });

  it('mengisi tenant samaran dan satu pengguna per peran R0', async () => {
    await seed(ds, 'development', createSeeders({ password: 'sandi-contoh-panjang' }));

    const tenants = await ds.getRepository(TenantEntity).find({ order: { code: 'ASC' } });
    expect(tenants.map((t) => t.code)).toEqual(['BCN', 'BLH', 'MRS']);
    const users = await ds.getRepository(UserEntity).find();
    expect(new Set(users.map((u) => u.role))).toEqual(new Set(['admin', 'L1', 'L2']));
    for (const user of users) {
      expect(await verifyPassword('sandi-contoh-panjang', user.passwordHash)).toBe(true);
    }
  });

  it('pengguna l1.merapi hanya terikat ke tenant MRS', async () => {
    await seed(ds, 'development', createSeeders({ password: 'sandi-contoh-panjang' }));

    const merapi = await ds.getRepository(UserEntity).findOneByOrFail({ username: 'l1.merapi' });
    const links = await ds.getRepository(UserTenantEntity).findBy({ userId: merapi.id });
    const mrs = await ds.getRepository(TenantEntity).findOneByOrFail({ code: 'MRS' });
    expect(merapi.allTenants).toBe(false);
    expect(links).toEqual([{ userId: merapi.id, tenantId: mrs.id }]);
  });

  it('aman dijalankan ulang: tidak menggandakan data dan tidak menimpa kata sandi', async () => {
    await seed(ds, 'staging', createSeeders({ password: 'sandi-pertama-panjang' }));
    await seed(ds, 'staging', createSeeders({ password: 'sandi-kedua-panjang' }));

    expect(await ds.getRepository(TenantEntity).count()).toBe(DEMO_TENANTS.length);
    expect(await ds.getRepository(UserEntity).count()).toBe(DEMO_USERS.length);
    expect(await ds.getRepository(UserTenantEntity).count()).toBe(1);
    const admin = await ds.getRepository(UserEntity).findOneByOrFail({ username: 'admin.contoh' });
    expect(await verifyPassword('sandi-pertama-panjang', admin.passwordHash)).toBe(true);
  });
});

describe('kata sandi seed', () => {
  it('dev dan uji boleh memakai bawaan', () => {
    expect(seedPassword('development', undefined)).toBe(DEV_SEED_PASSWORD);
    expect(seedPassword('test', '')).toBe(DEV_SEED_PASSWORD);
  });

  it('staging wajib mengisi TYIO_SEED_PASSWORD minimal 12 karakter', () => {
    expect(() => seedPassword('staging', undefined)).toThrow(/TYIO_SEED_PASSWORD wajib/);
    expect(() => seedPassword('staging', 'pendek')).toThrow(/minimal 12/);
    expect(seedPassword('staging', 'cukup-panjang-123')).toBe('cukup-panjang-123');
  });
});
