// Mengisi data dummy: `node dist/seed/run.js`. Ditolak bila TYIO_ENV=production.
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { runScript } from '../cli.js';
import { loadConfig } from '../config.js';
import { dataSourceOptions } from '../db/options.js';
import { seed } from './seed.js';
import { seeders } from './seeders.js';

await runScript(async () => {
  const config = loadConfig();
  const dataSource = new DataSource(dataSourceOptions(config.databaseUrl));
  await dataSource.initialize();
  try {
    const done = await seed(dataSource, config.env, seeders);
    console.log(done.length === 0 ? 'Seed: belum ada data dummy.' : `Seed selesai: ${done.join(', ')}`);
  } finally {
    await dataSource.destroy();
  }
});
