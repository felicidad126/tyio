import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { TenantAccess } from '../src/common/tenant/tenant-access.js';
import { TenantScopedRepository } from '../src/common/tenant/tenant-scoped.repository.js';
import { TenantEntity, type Tenant } from '../src/modules/tenants/tenant.entity.js';
import { resetData, testDataSource } from './db.js';
import { createTenant } from './fixtures.js';

// Penyaringan tenant ditulis di satu tempat (T9). Uji ini menjaga tempat itu dari
// tiga cara kebocoran yang nyata di query builder: where(), orWhere(), dan OR di andWhere.
describe('repositori terbatas tenant', () => {
  const ds = testDataSource();
  let scoped: TenantScopedRepository<Tenant>;
  let a: Tenant;
  let b: Tenant;

  beforeAll(async () => {
    await ds.initialize();
    scoped = new TenantScopedRepository(ds.getRepository(TenantEntity), 'id');
  });

  afterAll(async () => {
    await ds.destroy();
  });

  beforeEach(async () => {
    await resetData(ds);
    a = await createTenant(ds, 'TNA');
    b = await createTenant(ds, 'TNB');
  });

  const only = (...tenants: Tenant[]): TenantAccess => ({
    all: false,
    tenantIds: tenants.map((t) => t.id),
  });
  const codes = async (access: TenantAccess) =>
    (await scoped.query(access, 't').orderBy('t.code').getMany()).map((t) => t.code);

  it('akses semua tenant melihat semuanya; akses terbatas hanya tenant miliknya', async () => {
    expect(await codes({ all: true })).toEqual(['TNA', 'TNB']);
    expect(await codes(only(a))).toEqual(['TNA']);
    expect(await codes(only(b))).toEqual(['TNB']);
  });

  it('tanpa tenant sama sekali: tidak melihat apa pun (tanpa galat SQL)', async () => {
    expect(await codes(only())).toEqual([]);
  });

  it('kondisi tambahan berisi OR tetap terkurung di dalam filter tenant', async () => {
    const rows = await scoped
      .query(only(a), 't')
      .andWhere("t.code = 'TNA' OR t.code = 'TNB'")
      .getMany();

    expect(rows.map((t) => t.code)).toEqual(['TNA']);
  });

  it('where() dan orWhere() ditolak karena akan menghapus atau melewati filter tenant', () => {
    const qb = () => scoped.query(only(a), 't');

    expect(() => qb().where('t.active = true')).toThrow(/andWhere/);
    expect(() => qb().orWhere('t.active = true')).toThrow(/andWhere/);
    expect(() => qb().whereInIds([b.id])).toThrow(/andWhere/);
    expect(() => qb().orWhereInIds([b.id])).toThrow(/andWhere/);
  });
});
