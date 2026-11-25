import type { DataSource, EntityManager } from 'typeorm';
import { auditedTransaction } from '../common/audit/audit-context.js';
import type { NprEnv } from '../config.js';

/**
 * Satu kelompok data dummy. `run` harus idempoten (aman dijalankan ulang)
 * dan berjalan di dalam transaksinya sendiri.
 */
export interface Seeder {
  name: string;
  run(manager: EntityManager): Promise<void>;
}

/** Menjalankan seeder berurutan. Data dummy tidak pernah boleh masuk produksi. */
export async function seed(
  dataSource: DataSource,
  env: NprEnv,
  seeders: readonly Seeder[],
): Promise<string[]> {
  if (env === 'production') {
    throw new Error('Seed data dummy ditolak di lingkungan produksi (NPR_ENV=production).');
  }
  const done: string[] = [];
  for (const seeder of seeders) {
    await auditedTransaction(dataSource, { source: 'seed', label: `seed:${seeder.name}` }, (manager) =>
      seeder.run(manager),
    );
    done.push(seeder.name);
  }
  return done;
}
