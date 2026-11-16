import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { dataSourceOptions } from '../src/db/options.js';
import { testConfig } from './test-config.js';

/** Koneksi ke database uji, memakai entity dan migrasi yang sama dengan aplikasi. */
export function testDataSource(): DataSource {
  return new DataSource(dataSourceOptions(testConfig().databaseUrl));
}

/** Mengosongkan semua tabel entity. Uji API berjalan berurutan, jadi aman dipakai per uji. */
export async function resetData(dataSource: DataSource): Promise<void> {
  const tables = dataSource.entityMetadatas.map((m) => `"${m.tableName}"`).join(', ');
  await dataSource.query(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`);
}
