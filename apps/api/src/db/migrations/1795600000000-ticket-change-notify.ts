import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Pembaruan langsung (langkah 2.2): setiap entri linimasa baru memberi tahu aplikasi lewat
 * `pg_notify('npr_perubahan', …)`. Setiap perubahan NPR dan TT lewat linimasa (T71, T72,
 * T86, T102, T104), jadi satu trigger ini mencakup semua jalur tulis: API, seed, dan
 * perbaikan manual di psql. Pemberitahuan dikirim saat transaksi commit; transaksi yang batal
 * tidak memberi tahu apa pun. Isinya hanya customer, NPR, dan jenis entri.
 */
export class TicketChangeNotify1795600000000 implements MigrationInterface {
  name = 'TicketChangeNotify1795600000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE FUNCTION notify_ticket_change() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        PERFORM pg_notify('npr_perubahan', json_build_object(
          'tenantId', NEW.tenant_id, 'ticketId', NEW.ticket_id, 'kind', NEW.kind)::text);
        RETURN NULL;
      END;
      $$
    `);
    await queryRunner.query(`
      CREATE TRIGGER notify_change AFTER INSERT ON ticket_actions
        FOR EACH ROW EXECUTE FUNCTION notify_ticket_change()
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TRIGGER notify_change ON ticket_actions');
    await queryRunner.query('DROP FUNCTION notify_ticket_change()');
  }
}
