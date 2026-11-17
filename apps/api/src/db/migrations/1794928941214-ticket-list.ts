import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Daftar tiket dan pencarian global (langkah 1.5): indeks untuk urutan waktu kejadian, tab per
 * status, "Milik saya", tiket per remote, dan pencarian trigram atas nomor NPR dan nomor tiket
 * customer (T57).
 * pg_trgm sudah dipasang migrasi remote.
 */
export class TicketList1794928941214 implements MigrationInterface {
  name = 'TicketList1794928941214';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE INDEX tickets_occurred_idx ON tickets (occurred_at, id)');
    await queryRunner.query('CREATE INDEX tickets_status_occurred_idx ON tickets (status, occurred_at)');
    await queryRunner.query('CREATE INDEX tickets_created_by_idx ON tickets (created_by)');
    await queryRunner.query('CREATE INDEX tickets_remote_occurred_idx ON tickets (remote_id, occurred_at)');
    await queryRunner.query('CREATE INDEX ticket_actions_created_by_idx ON ticket_actions (created_by, ticket_id)');
    await queryRunner.query(`
      CREATE INDEX tickets_search_trgm ON tickets USING gin (
        (number || ' ' || coalesce(customer_ticket_number, '')) gin_trgm_ops
      )`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX tickets_search_trgm');
    await queryRunner.query('DROP INDEX ticket_actions_created_by_idx');
    await queryRunner.query('DROP INDEX tickets_remote_occurred_idx');
    await queryRunner.query('DROP INDEX tickets_created_by_idx');
    await queryRunner.query('DROP INDEX tickets_status_occurred_idx');
    await queryRunner.query('DROP INDEX tickets_occurred_idx');
  }
}
