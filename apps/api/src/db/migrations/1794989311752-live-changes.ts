import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Pembaruan langsung (langkah 2.2): setiap perubahan tiket, entri linimasa, dan TT mengirim
 * NOTIFY ke kanal `tyio_changes` berisi customer dan tiketnya saja (tanpa isi). Aplikasi
 * mendengarkan kanal ini dan meneruskannya ke browser yang boleh melihat customer itu. Karena
 * dari database, perubahan dari server aplikasi mana pun (atau SQL langsung) ikut terkirim.
 * NOTIFY baru terkirim saat transaksi berhasil; yang dibatalkan tidak terkirim.
 */
export class LiveChanges1794989311752 implements MigrationInterface {
  name = 'LiveChanges1794989311752';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE FUNCTION notify_ticket_change() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE
        ticket uuid;
      BEGIN
        -- IF, bukan CASE: NEW.ticket_id tidak ada di baris tabel tickets.
        IF TG_TABLE_NAME = 'tickets' THEN
          ticket := NEW.id;
        ELSE
          ticket := NEW.ticket_id;
        END IF;
        PERFORM pg_notify('tyio_changes', json_build_object(
          'tenantId', NEW.tenant_id, 'ticketId', ticket, 'kind', TG_TABLE_NAME)::text);
        RETURN NULL;
      END
      $$`);
    await queryRunner.query(`
      CREATE TRIGGER tickets_notify AFTER INSERT OR UPDATE ON tickets
        FOR EACH ROW EXECUTE FUNCTION notify_ticket_change()`);
    await queryRunner.query(`
      CREATE TRIGGER ticket_actions_notify AFTER INSERT ON ticket_actions
        FOR EACH ROW EXECUTE FUNCTION notify_ticket_change()`);
    await queryRunner.query(`
      CREATE TRIGGER trouble_tickets_notify AFTER INSERT OR UPDATE ON trouble_tickets
        FOR EACH ROW EXECUTE FUNCTION notify_ticket_change()`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TRIGGER trouble_tickets_notify ON trouble_tickets');
    await queryRunner.query('DROP TRIGGER ticket_actions_notify ON ticket_actions');
    await queryRunner.query('DROP TRIGGER tickets_notify ON tickets');
    await queryRunner.query('DROP FUNCTION notify_ticket_change()');
  }
}
