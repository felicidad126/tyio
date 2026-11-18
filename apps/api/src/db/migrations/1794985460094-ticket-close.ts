import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Penutupan NPR (langkah 1.6, K32, T74–T77): tindakan Close mengubah status ke Selesai dan
 * mengisi `tickets.closed_at` (waktu jarkom online kembali); NPR yang punya TT menutup TT-nya
 * juga dan mencatat part yang diganti di entri Close.
 *
 * Sebelum langkah ini Selesai dipilih lewat "Ubah status" tanpa mengisi `closed_at`, sehingga
 * tiket Selesai masih dihitung "tiket terbuka" saat membuat tiket baru. Migrasi mengisi
 * `closed_at` tiket itu dari entri terakhir yang mengubahnya ke Selesai, lalu database menjaga
 * Selesai ⇔ `closed_at` terisi.
 */
export class TicketClose1794985460094 implements MigrationInterface {
  name = 'TicketClose1794985460094';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SELECT set_config('tyio.actor', 'sistem:migrasi', true)`);
    await queryRunner.query(`
      ALTER TABLE ticket_actions
        ADD COLUMN replaced_parts text[],
        DROP CONSTRAINT ticket_actions_type_valid,
        ADD CONSTRAINT ticket_actions_type_valid
          CHECK (action_type IN ('catatan', 'cek_lokasi', 'problem', 'eskalasi_sd', 'close')),
        ADD CONSTRAINT ticket_actions_close CHECK (action_type <> 'close' OR status_to IS NOT DISTINCT FROM 'selesai'),
        ADD CONSTRAINT ticket_actions_replaced_parts CHECK (
          replaced_parts IS NULL OR (
            action_type = 'close'
            AND replaced_parts <@ ARRAY['modem', 'adaptor', 'indoor', 'buc', 'lnb']
            AND array_position(replaced_parts, NULL) IS NULL
          )
        )`);
    await queryRunner.query(`
      UPDATE tickets t SET closed_at = COALESCE(
        (SELECT a.occurred_at FROM ticket_actions a
         WHERE a.ticket_id = t.id AND a.status_to = 'selesai'
         ORDER BY a.created_at DESC, a.id DESC LIMIT 1),
        t.updated_at)
      WHERE t.status = 'selesai' AND t.closed_at IS NULL`);
    await queryRunner.query(`UPDATE tickets SET closed_at = NULL WHERE status <> 'selesai' AND closed_at IS NOT NULL`);
    await queryRunner.query(`
      ALTER TABLE tickets ADD CONSTRAINT tickets_closed CHECK ((status = 'selesai') = (closed_at IS NOT NULL))`);
    await queryRunner.query(`
      UPDATE trouble_tickets tt SET closed_at = t.closed_at
      FROM tickets t WHERE t.id = tt.ticket_id AND tt.closed_at IS DISTINCT FROM t.closed_at`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SELECT set_config('tyio.actor', 'sistem:migrasi', true)`);
    await queryRunner.query('UPDATE trouble_tickets SET closed_at = NULL WHERE closed_at IS NOT NULL');
    await queryRunner.query('ALTER TABLE tickets DROP CONSTRAINT tickets_closed');
    await queryRunner.query('UPDATE tickets SET closed_at = NULL WHERE closed_at IS NOT NULL');
    // Gagal bila sudah ada entri Close: linimasa hanya-tambah, jadi tidak bisa diubah ke versi lama.
    await queryRunner.query(`
      ALTER TABLE ticket_actions
        DROP CONSTRAINT ticket_actions_replaced_parts,
        DROP CONSTRAINT ticket_actions_close,
        DROP CONSTRAINT ticket_actions_type_valid,
        ADD CONSTRAINT ticket_actions_type_valid
          CHECK (action_type IN ('catatan', 'cek_lokasi', 'problem', 'eskalasi_sd')),
        DROP COLUMN replaced_parts`);
  }
}
