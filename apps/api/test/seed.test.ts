import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { dataSourceOptions } from '../src/db/options.js';
import { seed, type Seeder } from '../src/seed/seed.js';
import { testConfig } from './test-config.js';

describe('seed data dummy', () => {
  const dataSource = new DataSource(dataSourceOptions(testConfig().databaseUrl));

  beforeAll(async () => {
    await dataSource.initialize();
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  function recorder(names: string[]): { seeders: Seeder[]; calls: string[] } {
    const calls: string[] = [];
    const seeders = names.map(
      (name): Seeder => ({
        name,
        run: async () => {
          calls.push(name);
        },
      }),
    );
    return { seeders, calls };
  }

  it('menolak berjalan di produksi tanpa menyentuh seeder apa pun', async () => {
    const { seeders, calls } = recorder(['tenant', 'pengguna']);

    await expect(seed(dataSource, 'production', seeders)).rejects.toThrow(/produksi/);
    expect(calls).toEqual([]);
  });

  it('menjalankan seeder berurutan di lingkungan lain', async () => {
    const { seeders, calls } = recorder(['tenant', 'pengguna']);

    const done = await seed(dataSource, 'development', seeders);

    expect(calls).toEqual(['tenant', 'pengguna']);
    expect(done).toEqual(['tenant', 'pengguna']);
  });

  it('membatalkan perubahan seeder yang gagal', async () => {
    const seeders: Seeder[] = [
      {
        name: 'gagal',
        run: async (manager) => {
          await manager.query('CREATE TABLE seed_uji_batal (id int)');
          throw new Error('sengaja gagal');
        },
      },
    ];

    await expect(seed(dataSource, 'development', seeders)).rejects.toThrow('sengaja gagal');
    const rows: Array<{ name: string | null }> = await dataSource.query(
      "SELECT to_regclass('public.seed_uji_batal')::text AS name",
    );
    expect(rows[0]?.name).toBeNull();
  });
});
