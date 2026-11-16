// Mengisi data dummy: `node dist/seed/run.js`. Ditolak bila TYIO_ENV=production.
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { runScript } from '../cli.js';
import { loadConfig } from '../config.js';
import { dataSourceOptions } from '../db/options.js';
import { seedPassword } from './seed-password.js';
import { seed } from './seed.js';
import { createSeeders } from './seeders.js';

await runScript(async () => {
  const config = loadConfig();
  // Penjaga produksi ada di seed(); kata sandi diperiksa lebih dulu agar pesannya jelas.
  const password =
    config.env === 'production' ? '' : seedPassword(config.env, process.env.TYIO_SEED_PASSWORD);
  const dataSource = new DataSource(dataSourceOptions(config.databaseUrl));
  await dataSource.initialize();
  try {
    const done = await seed(dataSource, config.env, createSeeders({ password }));
    console.log(done.length === 0 ? 'Seed: belum ada data dummy.' : `Seed selesai: ${done.join(', ')}`);
  } finally {
    await dataSource.destroy();
  }
});
