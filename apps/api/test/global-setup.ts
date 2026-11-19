import 'reflect-metadata';
import { DataSource, MigrationExecutor } from 'typeorm';
import { dataSourceOptions } from '../src/db/options.js';
import { testConfig } from './test-config.js';

// Sekali sebelum seluruh uji: pastikan database uji bisa dihubungi dan skemanya terbaru.
// Setiap migrasi juga dibatalkan lalu diterapkan ulang, sehingga jalur turun (T3)
// selalu teruji, bukan hanya ditulis.
export default async function setup(): Promise<void> {
  const { databaseUrl } = testConfig();
  const dataSource = new DataSource(dataSourceOptions(databaseUrl, { auditSource: 'migrasi' }));
  try {
    await dataSource.initialize();
  } catch (error) {
    const host = new URL(databaseUrl).host; // tanpa kata sandi
    throw new Error(
      `Database uji di ${host} tidak bisa dihubungi. Jalankan "pnpm dev:up" dulu, ` +
        'atau isi TEST_DATABASE_URL.',
      { cause: error },
    );
  }
  try {
    await dataSource.runMigrations({ transaction: 'each' });
    const executed = await new MigrationExecutor(dataSource).getExecutedMigrations();
    for (let i = 0; i < executed.length; i++) {
      await dataSource.undoLastMigration({ transaction: 'each' });
    }
    await dataSource.runMigrations({ transaction: 'each' });
  } finally {
    await dataSource.destroy();
  }
}
