import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tiket NPR (langkah 1.3) dan penghitung nomornya. Tiket merujuk remote bersama customer-nya
 * lewat foreign key gabungan, sehingga customer tiket selalu sama dengan customer remote.
 */
export class Tickets1794915441096 implements MigrationInterface {
  name = 'Tickets1794915441096';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Sasaran foreign key gabungan dari tickets.
    await queryRunner.query('ALTER TABLE remotes ADD CONSTRAINT remotes_id_tenant_key UNIQUE (id, tenant_id)');

    await queryRunner.query(`
      CREATE TABLE ticket_sequences (
        kind varchar(8) NOT NULL,
        tenant_id uuid NOT NULL,
        jarkom_id uuid NOT NULL,
        period varchar(7) NOT NULL,
        last_value integer NOT NULL,
        CONSTRAINT ticket_sequences_pkey PRIMARY KEY (kind, tenant_id, jarkom_id, period),
        CONSTRAINT ticket_sequences_tenant_id_fkey FOREIGN KEY (tenant_id)
          REFERENCES tenants (id) ON DELETE RESTRICT,
        CONSTRAINT ticket_sequences_jarkom_id_fkey FOREIGN KEY (jarkom_id)
          REFERENCES jarkoms (id) ON DELETE RESTRICT,
        CONSTRAINT ticket_sequences_period_format CHECK (period ~ '^[0-9]{4}-[0-9]{2}$')
      )`);

    await queryRunner.query(`
      CREATE TABLE tickets (
        id uuid NOT NULL DEFAULT uuidv7(),
        tenant_id uuid NOT NULL,
        remote_id uuid NOT NULL,
        number varchar(64) NOT NULL,
        category_id uuid NOT NULL,
        system_id uuid,
        status varchar(16) NOT NULL DEFAULT 'terbuka',
        occurred_at timestamptz NOT NULL,
        problem text NOT NULL,
        created_by uuid NOT NULL,
        closed_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT tickets_pkey PRIMARY KEY (id),
        CONSTRAINT tickets_number_key UNIQUE (number),
        CONSTRAINT tickets_tenant_id_fkey FOREIGN KEY (tenant_id)
          REFERENCES tenants (id) ON DELETE RESTRICT,
        CONSTRAINT tickets_remote_fkey FOREIGN KEY (remote_id, tenant_id)
          REFERENCES remotes (id, tenant_id) ON DELETE RESTRICT,
        CONSTRAINT tickets_category_id_fkey FOREIGN KEY (category_id)
          REFERENCES ticket_categories (id) ON DELETE RESTRICT,
        CONSTRAINT tickets_system_id_fkey FOREIGN KEY (system_id)
          REFERENCES systems (id) ON DELETE RESTRICT,
        CONSTRAINT tickets_created_by_fkey FOREIGN KEY (created_by)
          REFERENCES users (id) ON DELETE RESTRICT,
        CONSTRAINT tickets_status_valid CHECK (status IN ('terbuka')),
        CONSTRAINT tickets_problem_length CHECK (char_length(problem) BETWEEN 3 AND 4000)
      )`);
    await queryRunner.query(
      'CREATE INDEX tickets_remote_open_idx ON tickets (remote_id) WHERE closed_at IS NULL',
    );
    // Untuk pemeriksaan RESTRICT saat kategori atau system dihapus di master data.
    await queryRunner.query('CREATE INDEX tickets_category_id_idx ON tickets (category_id)');
    await queryRunner.query('CREATE INDEX tickets_system_id_idx ON tickets (system_id)');

    // Tiket diaudit. Penghitung nomor tidak (lihat audit-exclusions.ts).
    await queryRunner.query(`
      CREATE TRIGGER tickets_audit AFTER INSERT OR UPDATE OR DELETE ON tickets
        FOR EACH ROW EXECUTE FUNCTION audit_row_change()`);
    await queryRunner.query(`
      CREATE TRIGGER tickets_audit_truncate AFTER TRUNCATE ON tickets
        FOR EACH STATEMENT EXECUTE FUNCTION audit_row_change()`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE tickets');
    await queryRunner.query('DROP TABLE ticket_sequences');
    await queryRunner.query('ALTER TABLE remotes DROP CONSTRAINT remotes_id_tenant_key');
  }
}
