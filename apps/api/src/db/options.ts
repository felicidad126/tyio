import type { DataSourceOptions } from 'typeorm';
import { entities, migrations } from './registry.js';

export function dataSourceOptions(databaseUrl: string): DataSourceOptions {
  return {
    type: 'postgres',
    url: databaseUrl,
    entities,
    migrations,
    migrationsTableName: 'migrations',
    migrationsTransactionMode: 'each',
    // Skema hanya berubah lewat migrasi yang punya jalur turun (T3).
    synchronize: false,
    // Migrasi dijalankan oleh langkah terpisah sebelum aplikasi start, bukan oleh aplikasi.
    migrationsRun: false,
    connectTimeoutMS: 10_000,
    // Setiap koneksi memakai zona waktu UTC, apa pun setelan server (T12).
    extra: { options: '-c timezone=UTC' },
  };
}
