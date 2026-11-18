import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resetData, testDataSource } from './db.js';
import { createRemote, createTenant, createTicket, createTroubleTicket } from './fixtures.js';

// Server yang sudah terpasang punya tiket yang dibuat Selesai lewat "Ubah status" tanpa waktu
// tutup: migrasi TicketClose mengisinya dari entri terakhir ke Selesai, menutup TT-nya juga, lalu
// database menjaga Selesai ⇔ waktu tutup terisi (T76).
describe('migrasi penutupan NPR', () => {
  const ds = testDataSource();
  const isTicketClose = (name: string) => name.startsWith('TicketClose');

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

  it('tiket Selesai lama mendapat waktu tutup dari entri terakhir ke Selesai; TT-nya ikut; tercatat atas nama sistem:migrasi', async () => {
    // Data dibuat dengan skema terbaru, lalu skema dimundurkan sampai sebelum migrasi penutupan.
    const tenant = await createTenant(ds, 'TNA');
    const remote = await createRemote(ds, tenant, 'TNA-001');
    const done = await createTicket(ds, remote, 'NPR/UJI/TNA/2026/11/0001');
    const reclosed = await createTicket(ds, remote, 'NPR/UJI/TNA/2026/11/0002');
    const working = await createTicket(ds, remote, 'NPR/UJI/TNA/2026/11/0003');
    const tt = await createTroubleTicket(ds, done, 'TT/UJI/TNA/2026/11/0001');
    for (;;) {
      const applied: Array<{ name: string }> = await ds.query('SELECT name FROM migrations ORDER BY id DESC LIMIT 1');
      if (!applied[0]) throw new Error('migrasi TicketClose tidak ditemukan');
      await ds.undoLastMigration({ transaction: 'each' });
      if (isTicketClose(applied[0].name)) break;
    }
    // Alur lama: Selesai lewat Ubah status (jenis Bebas), tanpa closed_at. Tiket kedua dibuka
    // lagi lalu Selesai lagi: yang dipakai entri terakhir yang dicatat.
    await ds.transaction(async (m) => {
      await m.query(`SELECT set_config('tyio.actor', 'uji', true)`);
      const entry = (id: string, occurredAt: string, from: string, to: string, createdAt: string) =>
        m.query(
          `INSERT INTO ticket_actions (tenant_id, ticket_id, occurred_at, status_from, status_to, created_by, created_at)
           SELECT tenant_id, id, $2, $3, $4, created_by, $5 FROM tickets WHERE id = $1`,
          [id, occurredAt, from, to, createdAt],
        );
      await entry(done.id, '2026-11-02T03:00:00Z', 'terbuka', 'selesai', '2026-11-02T03:05:00Z');
      await entry(reclosed.id, '2026-11-02T01:00:00Z', 'terbuka', 'selesai', '2026-11-02T01:05:00Z');
      await entry(reclosed.id, '2026-11-02T02:00:00Z', 'selesai', 'dikerjakan', '2026-11-02T02:05:00Z');
      await entry(reclosed.id, '2026-11-03T04:00:00Z', 'dikerjakan', 'selesai', '2026-11-03T04:05:00Z');
      await m.query(`UPDATE tickets SET status = 'selesai' WHERE id = ANY($1)`, [[done.id, reclosed.id]]);
      await m.query(`UPDATE tickets SET status = 'dikerjakan' WHERE id = $1`, [working.id]);
    });

    await ds.runMigrations({ transaction: 'each' });

    const tickets: Array<{ number: string; closed_at: Date | null }> = await ds.query(
      'SELECT number, closed_at FROM tickets ORDER BY number',
    );
    expect(tickets.map((t) => [t.number, t.closed_at?.toISOString() ?? null])).toEqual([
      ['NPR/UJI/TNA/2026/11/0001', '2026-11-02T03:00:00.000Z'],
      ['NPR/UJI/TNA/2026/11/0002', '2026-11-03T04:00:00.000Z'],
      ['NPR/UJI/TNA/2026/11/0003', null],
    ]);
    const [ttRow] = await ds.query('SELECT closed_at FROM trouble_tickets WHERE id = $1', [tt.id]);
    expect(ttRow.closed_at.toISOString()).toBe('2026-11-02T03:00:00.000Z');
    const audit: Array<{ table_name: string; n: string }> = await ds.query(
      `SELECT table_name, count(*)::text AS n FROM audit_log
       WHERE actor = 'sistem:migrasi' AND action = 'update' AND row_id = ANY($1)
       GROUP BY table_name ORDER BY table_name`,
      [[done.id, reclosed.id, tt.id]],
    );
    expect(audit).toEqual([
      { table_name: 'tickets', n: '2' },
      { table_name: 'trouble_tickets', n: '1' },
    ]);
    await expect(
      ds.transaction(async (m) => {
        await m.query(`SELECT set_config('tyio.actor', 'uji', true)`);
        await m.query(`UPDATE tickets SET closed_at = NULL WHERE id = $1`, [done.id]);
      }),
    ).rejects.toThrow(/tickets_closed/);
  });
});
