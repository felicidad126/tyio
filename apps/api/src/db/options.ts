import type { DataSourceOptions } from 'typeorm';
import { entities, migrations } from './registry.js';

/**
 * `auditSource: 'migrasi'` dipakai skrip migrasi: perubahan data di dalam migrasi tercatat
 * di audit dengan sumber "migrasi". Koneksi aplikasi sengaja tanpa sumber bawaan, sehingga
 * setiap tulisan aplikasi wajib lewat `auditedTransaction` (ditolak database bila tidak).
 */
export function dataSourceOptions(
  databaseUrl: string,
  options: { auditSource?: 'migrasi' } = {},
): DataSourceOptions {
  const connectionSettings = ['-c timezone=UTC'];
  if (options.auditSource) {
    connectionSettings.push(`-c tyio.source=${options.auditSource}`, '-c tyio.actor_label=migrate');
  }
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
    extra: { options: connectionSettings.join(' ') },
  };
}
