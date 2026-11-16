import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { dataSourceOptions } from '../src/db/options.js';
import { testConfig } from './test-config.js';

describe('koneksi database', () => {
  const dataSource = new DataSource(dataSourceOptions(testConfig().databaseUrl));

  beforeAll(async () => {
    await dataSource.initialize();
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  // T12: semua waktu UTC. Zona sesi yang lain membuat perbandingan timestamptz
  // dengan waktu tanpa zona bergeser diam-diam.
  it('memakai zona waktu sesi UTC', async () => {
    const rows: Array<{ TimeZone: string }> = await dataSource.query('SHOW timezone');

    expect(rows[0]?.TimeZone).toBe('UTC');
  });

  it('tidak mengubah skema secara otomatis', () => {
    expect(dataSource.options.synchronize).toBe(false);
    expect(dataSource.options.migrationsRun).toBe(false);
  });

  it('menyimpan riwayat migrasi di tabel migrations', async () => {
    const rows: Array<{ name: string | null }> = await dataSource.query(
      "SELECT to_regclass('public.migrations')::text AS name",
    );

    expect(rows[0]?.name).toBe('migrations');
  });
});
