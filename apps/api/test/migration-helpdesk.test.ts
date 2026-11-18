import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resetData, testDataSource } from './db.js';

// Server yang sudah terpasang punya pengguna L1/L2: migrasi HelpdeskRole menjadikan mereka
// helpdesk tanpa menyentuh admin (K30, K46), dan perubahannya tercatat di audit.
describe('migrasi peran helpdesk', () => {
  const ds = testDataSource();
  const isHelpdeskRole = (name: string) => name.startsWith('HelpdeskRole');

  beforeAll(async () => {
    await ds.initialize();
    await resetData(ds);
  });

  afterAll(async () => {
    // Pastikan skema kembali terbaru untuk berkas uji lain.
    await ds.runMigrations({ transaction: 'each' });
    await resetData(ds);
    await ds.destroy();
  });

  it('pengguna L1 dan L2 menjadi helpdesk; admin tetap; tercatat atas nama sistem:migrasi', async () => {
    // Mundur sampai sebelum migrasi peran helpdesk.
    for (;;) {
      const applied: Array<{ name: string }> = await ds.query('SELECT name FROM migrations ORDER BY id DESC LIMIT 1');
      if (!applied[0]) throw new Error('migrasi HelpdeskRole tidak ditemukan');
      await ds.undoLastMigration({ transaction: 'each' });
      if (isHelpdeskRole(applied[0].name)) break;
    }
    await ds.transaction(async (m) => {
      await m.query(`SELECT set_config('tyio.actor', 'uji', true)`);
      await m.query(
        `INSERT INTO users (username, display_name, password_hash, role, all_tenants)
         VALUES ('lama.l1', 'Lama L1', 'x', 'L1', true), ('lama.l2', 'Lama L2', 'x', 'L2', true),
                ('lama.admin', 'Lama Admin', 'x', 'admin', true)`,
      );
    });

    await ds.runMigrations({ transaction: 'each' });

    const roles: Array<{ username: string; role: string }> = await ds.query(
      `SELECT username, role FROM users WHERE username LIKE 'lama.%' ORDER BY username`,
    );
    expect(roles).toEqual([
      { username: 'lama.admin', role: 'admin' },
      { username: 'lama.l1', role: 'helpdesk' },
      { username: 'lama.l2', role: 'helpdesk' },
    ]);
    // Audit log tidak pernah dikosongkan: hanya baris untuk pengguna uji ini yang dihitung.
    const audit: Array<{ actor: string; n: string }> = await ds.query(
      `SELECT a.actor, count(*)::text AS n FROM audit_log a
       JOIN users u ON u.id::text = a.row_id AND u.username LIKE 'lama.%'
       WHERE a.table_name = 'users' AND a.action = 'update' GROUP BY a.actor`,
    );
    expect(audit).toEqual([{ actor: 'sistem:migrasi', n: '2' }]);
    await expect(
      ds.transaction(async (m) => {
        await m.query(`SELECT set_config('tyio.actor', 'uji', true)`);
        await m.query(`UPDATE users SET role = 'L2' WHERE username = 'lama.l1'`);
      }),
    ).rejects.toThrow(/users_role_valid/);
  });
});
