import type { DataSource, EntityManager } from 'typeorm';
import { SEED_ACTOR, withActor } from '../common/audit/actor.js';
import type { TyioEnv } from '../config.js';

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
  env: TyioEnv,
  seeders: readonly Seeder[],
): Promise<string[]> {
  if (env === 'production') {
    throw new Error('Seed data dummy ditolak di lingkungan produksi (TYIO_ENV=production).');
  }
  const done: string[] = [];
  for (const seeder of seeders) {
    // Tercatat di audit log sebagai `sistem:seed`.
    await withActor(dataSource, SEED_ACTOR, (manager) => seeder.run(manager));
    done.push(seeder.name);
  }
  return done;
}
