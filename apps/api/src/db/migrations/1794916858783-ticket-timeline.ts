import type { MigrationInterface, QueryRunner } from 'typeorm';

const STATUSES = `('terbuka', 'dikerjakan', 'pending', 'eskalasi', 'selesai')`;

/**
 * Linimasa tiket dan alur status (langkah 1.4). Entri linimasa dan lampiran hanya bisa
 * ditambah (T10): trigger menolak UPDATE dan DELETE. Tiket yang sudah ada mendapat entri
 * awal "dibuat" agar linimasanya lengkap.
 *
 * Catatan pembatalan: `down` gagal bila sudah ada tiket berstatus selain "terbuka", karena
 * batasan status lama tidak bisa dipasang kembali tanpa mengubah data.
 */
export class TicketTimeline1794916858783 implements MigrationInterface {
  name = 'TicketTimeline1794916858783';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE tickets
        ADD COLUMN customer_ticket_number varchar(64),
        ADD COLUMN pending_party varchar(16),
        ADD COLUMN pending_reason varchar(500),
        DROP CONSTRAINT tickets_status_valid,
        ADD CONSTRAINT tickets_status_valid CHECK (status IN ${STATUSES}),
        ADD CONSTRAINT tickets_pending
          CHECK ((status = 'pending') = (pending_party IS NOT NULL AND pending_reason IS NOT NULL)),
        ADD CONSTRAINT tickets_pending_party_valid CHECK (pending_party IN ('customer', 'tm')),
        ADD CONSTRAINT tickets_id_tenant_key UNIQUE (id, tenant_id)`);

    await queryRunner.query(`
      CREATE TABLE ticket_actions (
        id uuid NOT NULL DEFAULT uuidv7(),
        tenant_id uuid NOT NULL,
        ticket_id uuid NOT NULL,
        occurred_at timestamptz NOT NULL,
        note text,
        status_from varchar(16),
        status_to varchar(16),
        pending_party varchar(16),
        pending_reason varchar(500),
        corrects_id uuid,
        created_by uuid NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT ticket_actions_pkey PRIMARY KEY (id),
        CONSTRAINT ticket_actions_id_ticket_key UNIQUE (id, ticket_id),
        CONSTRAINT ticket_actions_ticket_fkey FOREIGN KEY (ticket_id, tenant_id)
          REFERENCES tickets (id, tenant_id) ON DELETE RESTRICT,
        CONSTRAINT ticket_actions_corrects_fkey FOREIGN KEY (corrects_id, ticket_id)
          REFERENCES ticket_actions (id, ticket_id) ON DELETE RESTRICT,
        CONSTRAINT ticket_actions_created_by_fkey FOREIGN KEY (created_by)
          REFERENCES users (id) ON DELETE RESTRICT,
        CONSTRAINT ticket_actions_has_content CHECK (note IS NOT NULL OR status_to IS NOT NULL),
        CONSTRAINT ticket_actions_note_length CHECK (char_length(note) BETWEEN 1 AND 4000),
        CONSTRAINT ticket_actions_status_valid
          CHECK (status_from IN ${STATUSES} AND status_to IN ${STATUSES}),
        CONSTRAINT ticket_actions_pending
          CHECK ((status_to IS NOT DISTINCT FROM 'pending') = (pending_party IS NOT NULL AND pending_reason IS NOT NULL)),
        CONSTRAINT ticket_actions_pending_party_valid CHECK (pending_party IN ('customer', 'tm')),
        CONSTRAINT ticket_actions_correction
          CHECK (corrects_id IS NULL OR (note IS NOT NULL AND status_to IS NULL))
      )`);
    await queryRunner.query('CREATE INDEX ticket_actions_ticket_idx ON ticket_actions (ticket_id, created_at)');

    await queryRunner.query(`
      CREATE TABLE ticket_attachments (
        id uuid NOT NULL DEFAULT uuidv7(),
        tenant_id uuid NOT NULL,
        ticket_id uuid NOT NULL,
        action_id uuid NOT NULL,
        file_name varchar(200) NOT NULL,
        stored_name varchar(80) NOT NULL,
        content_type varchar(40) NOT NULL,
        size_bytes integer NOT NULL,
        sha256 varchar(64) NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT ticket_attachments_pkey PRIMARY KEY (id),
        CONSTRAINT ticket_attachments_stored_name_key UNIQUE (stored_name),
        CONSTRAINT ticket_attachments_ticket_fkey FOREIGN KEY (ticket_id, tenant_id)
          REFERENCES tickets (id, tenant_id) ON DELETE RESTRICT,
        CONSTRAINT ticket_attachments_action_fkey FOREIGN KEY (action_id, ticket_id)
          REFERENCES ticket_actions (id, ticket_id) ON DELETE RESTRICT,
        CONSTRAINT ticket_attachments_type_valid
          CHECK (content_type IN ('image/png', 'image/jpeg', 'image/webp', 'application/pdf')),
        CONSTRAINT ticket_attachments_size CHECK (size_bytes BETWEEN 1 AND 5242880)
      )`);
    await queryRunner.query('CREATE INDEX ticket_attachments_action_idx ON ticket_attachments (action_id)');

    // Hanya-tambah. TRUNCATE tidak ditolak (dipakai uji untuk mengosongkan database uji) dan
    // tetap tercatat di audit log.
    await queryRunner.query(`
      CREATE FUNCTION append_only() RETURNS trigger LANGUAGE plpgsql AS $fn$
      BEGIN
        RAISE EXCEPTION '% hanya boleh ditambah; % ditolak. Perbaiki dengan entri koreksi.',
          TG_TABLE_NAME, TG_OP
          USING ERRCODE = 'insufficient_privilege';
      END
      $fn$`);
    for (const table of ['ticket_actions', 'ticket_attachments']) {
      await queryRunner.query(`
        CREATE TRIGGER ${table}_append_only BEFORE UPDATE OR DELETE ON ${table}
          FOR EACH ROW EXECUTE FUNCTION append_only()`);
      await queryRunner.query(`
        CREATE TRIGGER ${table}_audit AFTER INSERT OR UPDATE OR DELETE ON ${table}
          FOR EACH ROW EXECUTE FUNCTION audit_row_change()`);
      await queryRunner.query(`
        CREATE TRIGGER ${table}_audit_truncate AFTER TRUNCATE ON ${table}
          FOR EACH STATEMENT EXECUTE FUNCTION audit_row_change()`);
    }

    // Entri awal untuk tiket yang sudah ada (pelaku: migrasi, dicatat di audit log).
    await queryRunner.query(`SELECT set_config('tyio.actor', 'sistem:migrasi', true)`);
    await queryRunner.query(`
      INSERT INTO ticket_actions (tenant_id, ticket_id, occurred_at, status_to, created_by, created_at)
      SELECT tenant_id, id, created_at, 'terbuka', created_by, created_at FROM tickets`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE ticket_attachments');
    await queryRunner.query('DROP TABLE ticket_actions');
    await queryRunner.query('DROP FUNCTION append_only()');
    await queryRunner.query(`
      ALTER TABLE tickets
        DROP CONSTRAINT tickets_id_tenant_key,
        DROP CONSTRAINT tickets_pending_party_valid,
        DROP CONSTRAINT tickets_pending,
        DROP CONSTRAINT tickets_status_valid,
        ADD CONSTRAINT tickets_status_valid CHECK (status IN ('terbuka')),
        DROP COLUMN pending_reason,
        DROP COLUMN pending_party,
        DROP COLUMN customer_ticket_number`);
  }
}
