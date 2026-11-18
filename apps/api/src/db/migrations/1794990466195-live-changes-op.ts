import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Layar dinding (langkah 2.4) berbunyi untuk NPR **baru**, bukan setiap perubahan: kabar
 * perubahan kini membawa jenis operasinya (`insert` atau `update`). Fungsi trigger diganti;
 * trigger dari migrasi LiveChanges tetap.
 */
export class LiveChangesOp1794990466195 implements MigrationInterface {
  name = 'LiveChangesOp1794990466195';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION notify_ticket_change() RETURNS trigger LANGUAGE plpgsql AS $$
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
          'tenantId', NEW.tenant_id, 'ticketId', ticket, 'kind', TG_TABLE_NAME,
          'op', lower(TG_OP))::text);
        RETURN NULL;
      END
      $$`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION notify_ticket_change() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE
        ticket uuid;
      BEGIN
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
  }
}
