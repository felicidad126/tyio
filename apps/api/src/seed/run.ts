// Mengisi data dummy: `node dist/seed/run.js`. Ditolak bila NPR_ENV=production.
// Kata sandi akun dummy: SEED_USER_PASSWORD (wajib di staging; bawaan di development).
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { runScript } from '../cli.js';
import { loadConfig } from '../config.js';
import { dataSourceOptions } from '../db/options.js';
import { seed } from './seed.js';
import { createSeeders, seedUserPassword } from './seeders.js';

await runScript(async () => {
  const config = loadConfig();
  const dataSource = new DataSource(dataSourceOptions(config.databaseUrl));
  await dataSource.initialize();
  try {
    const seeders = createSeeders({ userPassword: () => seedUserPassword(config.env) });
    const done = await seed(dataSource, config.env, seeders);
    console.log(done.length === 0 ? 'Seed: belum ada data dummy.' : `Seed selesai: ${done.join(', ')}`);
  } finally {
    await dataSource.destroy();
  }
});
