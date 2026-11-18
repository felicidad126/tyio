import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { verifyPassword } from '../src/modules/auth/password.js';
import { TenantEntity } from '../src/modules/tenants/tenant.entity.js';
import { UserTenantEntity } from '../src/modules/users/user-tenant.entity.js';
import { UserEntity } from '../src/modules/users/user.entity.js';
import { DEV_SEED_PASSWORD, seedPassword } from '../src/seed/seed-password.js';
import { seed } from '../src/seed/seed.js';
import { createSeeders, DEMO_MASTER, DEMO_TENANTS, DEMO_USERS } from '../src/seed/seeders.js';
import { findProvince, TIME_ZONES } from '@tyio/shared';
import { MASTER_ENTITIES } from '../src/modules/master/master.entities.js';
import { RemoteEntity } from '../src/modules/remotes/remote.entity.js';
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

  it('mengisi tenant samaran dan pengguna contoh untuk setiap peran', async () => {
    await seed(ds, 'development', createSeeders({ password: 'sandi-contoh-panjang' }));

    const tenants = await ds.getRepository(TenantEntity).find({ order: { code: 'ASC' } });
    expect(tenants.map((t) => t.code)).toEqual(['BCN', 'BLH', 'MRS']);
    const users = await ds.getRepository(UserEntity).find();
    expect(new Set(users.map((u) => u.role))).toEqual(new Set(['admin', 'helpdesk']));
    for (const user of users) {
      expect(await verifyPassword('sandi-contoh-panjang', user.passwordHash)).toBe(true);
    }
  });

  it('mengisi master contoh: kategori dari "Remote Status" dashboard lama, system dan jarkom contoh', async () => {
    await seed(ds, 'development', createSeeders({ password: 'sandi-contoh-panjang' }));

    const codes = async (list: 'kategori' | 'system' | 'jarkom') =>
      (await ds.getRepository(MASTER_ENTITIES[list]).find({ order: { code: 'ASC' } })).map((r) => r.code);
    expect(await codes('kategori')).toEqual(['PM', 'RD', 'REL', 'REP']);
    expect(await codes('system')).toEqual(['SYSA', 'SYSB']);
    expect(await codes('jarkom')).toEqual(['JKCA', 'VSAT']);
  });

  it('mengisi 25 remote rekaan per customer contoh, lengkap dengan zona waktu dari provinsinya', async () => {
    await seed(ds, 'development', createSeeders({ password: 'sandi-contoh-panjang' }));

    const remotes = await ds.getRepository(RemoteEntity).find();
    expect(remotes).toHaveLength(DEMO_TENANTS.length * 25);
    for (const remote of remotes) {
      expect(remote.timeZone).toBe(TIME_ZONES[findProvince(remote.province)?.zone ?? 'WIB']);
      expect(remote.contacts.length).toBeGreaterThan(0);
    }
    expect(new Set(remotes.map((r) => r.timeZone)).size).toBe(3);
  });

  it('pengguna helpdesk.merapi hanya terikat ke tenant MRS', async () => {
    await seed(ds, 'development', createSeeders({ password: 'sandi-contoh-panjang' }));

    const merapi = await ds.getRepository(UserEntity).findOneByOrFail({ username: 'helpdesk.merapi' });
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
    expect(await ds.getRepository(RemoteEntity).count()).toBe(DEMO_TENANTS.length * 25);
    for (const [list, rows] of Object.entries(DEMO_MASTER)) {
      expect(await ds.getRepository(MASTER_ENTITIES[list as keyof typeof DEMO_MASTER]).count()).toBe(
        rows.length,
      );
    }
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
