import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Trouble Ticket (langkah 1.5b, K27/K44/T69): satu per NPR, nomor TT/<jarkom>/<customer>/
 * <tahun>/<bulan>/<urut> dari penghitung yang sama dengan NPR (jenis 'TT'). Diaudit seperti
 * tiket. Linimasa mendapat jenis tindakan 'eskalasi_sd' (dibuat sistem saat TT dibuka).
 */
export class TroubleTickets1794982712464 implements MigrationInterface {
  name = 'TroubleTickets1794982712464';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE trouble_tickets (
        id uuid NOT NULL DEFAULT uuidv7(),
        tenant_id uuid NOT NULL,
        ticket_id uuid NOT NULL,
        number varchar(64) NOT NULL,
        problem text NOT NULL,
        created_by uuid NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        closed_at timestamptz,
        CONSTRAINT trouble_tickets_pkey PRIMARY KEY (id),
        CONSTRAINT trouble_tickets_number_key UNIQUE (number),
        CONSTRAINT trouble_tickets_ticket_key UNIQUE (ticket_id),
        CONSTRAINT trouble_tickets_tenant_id_fkey FOREIGN KEY (tenant_id)
          REFERENCES tenants (id) ON DELETE RESTRICT,
        CONSTRAINT trouble_tickets_ticket_fkey FOREIGN KEY (ticket_id, tenant_id)
          REFERENCES tickets (id, tenant_id) ON DELETE RESTRICT,
        CONSTRAINT trouble_tickets_created_by_fkey FOREIGN KEY (created_by)
          REFERENCES users (id) ON DELETE RESTRICT,
        CONSTRAINT trouble_tickets_problem_length CHECK (char_length(problem) BETWEEN 3 AND 2000)
      )`);
    await queryRunner.query('CREATE INDEX trouble_tickets_search_trgm ON trouble_tickets USING gin (number gin_trgm_ops)');
    await queryRunner.query(`
      CREATE TRIGGER trouble_tickets_audit AFTER INSERT OR UPDATE OR DELETE ON trouble_tickets
        FOR EACH ROW EXECUTE FUNCTION audit_row_change()`);
    await queryRunner.query(`
      CREATE TRIGGER trouble_tickets_audit_truncate AFTER TRUNCATE ON trouble_tickets
        FOR EACH STATEMENT EXECUTE FUNCTION audit_row_change()`);
    await queryRunner.query(`
      ALTER TABLE ticket_actions
        DROP CONSTRAINT ticket_actions_type_valid,
        ADD CONSTRAINT ticket_actions_type_valid
          CHECK (action_type IN ('catatan', 'cek_lokasi', 'problem', 'eskalasi_sd'))`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE ticket_actions
        DROP CONSTRAINT ticket_actions_type_valid,
        ADD CONSTRAINT ticket_actions_type_valid CHECK (action_type IN ('catatan', 'cek_lokasi', 'problem'))`);
    await queryRunner.query('DROP TABLE trouble_tickets');
  }
}
