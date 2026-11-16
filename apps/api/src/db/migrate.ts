// Menjalankan migrasi: `node dist/db/migrate.js up` (semua yang tertunda)
// atau `node dist/db/migrate.js down` (batalkan satu migrasi terakhir).
import 'reflect-metadata';
import { DataSource, MigrationExecutor } from 'typeorm';
import { runScript } from '../cli.js';
import { loadConfig } from '../config.js';
import { dataSourceOptions } from './options.js';

await runScript(async () => {
  const direction = process.argv[2] ?? 'up';
  if (direction !== 'up' && direction !== 'down') {
    throw new Error('Pemakaian: node dist/db/migrate.js [up|down]');
  }

  const dataSource = new DataSource(dataSourceOptions(loadConfig().databaseUrl));
  await dataSource.initialize();
  try {
    if (direction === 'up') {
      const applied = await dataSource.runMigrations({ transaction: 'each' });
      console.log(
        applied.length === 0
          ? 'Migrasi: tidak ada yang tertunda.'
          : `Migrasi diterapkan: ${applied.map((m) => m.name).join(', ')}`,
      );
      return;
    }

    const executed = await new MigrationExecutor(dataSource).getExecutedMigrations();
    const last = executed[0];
    if (!last) {
      console.log('Migrasi: belum ada yang dijalankan, tidak ada yang dibatalkan.');
      return;
    }
    await dataSource.undoLastMigration({ transaction: 'each' });
    console.log(`Migrasi dibatalkan: ${last.name}`);
  } finally {
    await dataSource.destroy();
  }
});
