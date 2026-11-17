import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { withActor } from '../src/common/audit/actor.js';
import { dataSourceOptions } from '../src/db/options.js';
import { testConfig } from './test-config.js';

/** Koneksi ke database uji, memakai entity dan migrasi yang sama dengan aplikasi. */
export function testDataSource(): DataSource {
  return new DataSource(dataSourceOptions(testConfig().databaseUrl));
}

/**
 * Mengosongkan semua tabel entity kecuali audit_log (hanya-tambah; uji audit mencari
 * catatannya lewat id yang unik). Uji API berjalan berurutan, jadi aman dipakai per uji.
 */
export async function resetData(dataSource: DataSource): Promise<void> {
  const tables = dataSource.entityMetadatas
    .map((m) => m.tableName)
    .filter((t) => t !== 'audit_log')
    .map((t) => `"${t}"`)
    .join(', ');
  await withActor(dataSource, { name: 'uji:reset' }, (m) =>
    m.query(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`),
  );
}
