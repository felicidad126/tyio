import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testDataSource } from './db.js';

describe('skema database', () => {
  const dataSource = testDataSource();

  beforeAll(async () => {
    await dataSource.initialize();
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  // Migrasi ditulis tangan; entity juga. Uji ini menjaga keduanya tetap sama persis:
  // bila TypeORM ingin mengubah skema, berarti ada yang tidak cocok.
  it('cocok persis dengan definisi entity setelah semua migrasi', async () => {
    const pending = await dataSource.driver.createSchemaBuilder().log();

    expect(pending.upQueries.map((q) => q.query)).toEqual([]);
  });

  it('setiap migrasi bisa dibatalkan lalu diterapkan lagi', async () => {
    const total = dataSource.migrations.length;
    for (let i = 0; i < total; i++) {
      await dataSource.undoLastMigration({ transaction: 'each' });
    }
    const tablesAfterDown: Array<{ n: string }> = await dataSource.query(
      "SELECT count(*)::text AS n FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'migrations'",
    );
    expect(tablesAfterDown[0]?.n).toBe('0');

    const applied = await dataSource.runMigrations({ transaction: 'each' });
    expect(applied).toHaveLength(total);
    const pending = await dataSource.driver.createSchemaBuilder().log();
    expect(pending.upQueries).toEqual([]);
  });
});
