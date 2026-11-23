import type { MigrationInterface, QueryRunner } from 'typeorm';

const KINDS_V2 = ['dibuat', 'cek_jaringan', 'cek_lokasi', 'hubungi_customer', 'catatan', 'koreksi', 'ambil'];
const KINDS_V3 = [...KINDS_V2, 'tt_dibuat', 'tt_disalin'];
const list = (values: readonly string[]) => values.map((value) => `'${value}'`).join(', ');

/**
 * Langkah 1.5b: Open Ticket (TT) ke Service Delivery (K16, K23, K25).
 *
 * - `trouble_tickets`: satu TT milik satu NPR; satu NPR boleh punya banyak TT. Remote dan
 *   jarkom disalin trigger dari NPR (bukan dari penulis), lalu nomor
 *   `TT/JARKOM/CUSTOMER/TAHUN/BULAN/urut` dibuat fungsi yang sama dengan NPR
 *   (`assign_ticket_number('TT')`, penghitung sendiri per jenis). TT hanya untuk NPR yang belum
 *   ditutup.
 * - Status TT di langkah ini hanya "Menunggu SD"; hasil kunjungan (R3) dan penutupan (1.6)
 *   menambah status lewat migrasi berikutnya (T93).
 * - Kontak di lokasi disimpan di TT (T92): ringkasan yang sudah dikirim ke SD tidak berubah
 *   walau data remote diimpor ulang.
 * - Linimasa NPR: entri `tt_dibuat` ditulis trigger saat TT disisipkan; entri `tt_disalin`
 *   setiap kali ringkasan TT disalin (K25). Keduanya merujuk TT di NPR yang sama.
 */
export class TroubleTickets1795480000000 implements MigrationInterface {
  name = 'TroubleTickets1795480000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE ticket_counters DROP CONSTRAINT ticket_counters_kind_valid');
    await queryRunner.query(`ALTER TABLE ticket_counters ADD CONSTRAINT ticket_counters_kind_valid CHECK (kind IN ('NPR', 'TT'))`);

    await queryRunner.query(`
      CREATE TABLE trouble_tickets (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants (id),
        ticket_id uuid NOT NULL,
        remote_id uuid NOT NULL,
        network_id uuid NOT NULL,
        number text NOT NULL,
        status text NOT NULL DEFAULT 'menunggu_sd',
        problem text NOT NULL,
        contact text,
        created_by uuid NOT NULL REFERENCES users (id),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT trouble_tickets_ticket_same_tenant FOREIGN KEY (tenant_id, ticket_id)
          REFERENCES tickets (tenant_id, id),
        CONSTRAINT trouble_tickets_remote_same_tenant FOREIGN KEY (tenant_id, remote_id)
          REFERENCES remotes (tenant_id, id),
        CONSTRAINT trouble_tickets_network_same_tenant FOREIGN KEY (tenant_id, network_id)
          REFERENCES master_networks (tenant_id, id),
        CONSTRAINT trouble_tickets_ticket_id_id_key UNIQUE (ticket_id, id),
        CONSTRAINT trouble_tickets_number_format
          CHECK (number ~ '^TT/[A-Z0-9]{2,10}/[A-Z0-9]{2,10}/[0-9]{4}/(0[1-9]|1[0-2])/[0-9]{4,}$'),
        CONSTRAINT trouble_tickets_status_valid CHECK (status IN ('menunggu_sd')),
        CONSTRAINT trouble_tickets_problem_valid
          CHECK (problem = btrim(problem) AND problem <> '' AND length(problem) <= 2000),
        CONSTRAINT trouble_tickets_contact_valid
          CHECK (contact IS NULL OR (contact = btrim(contact) AND contact <> '' AND length(contact) <= 300))
      )
    `);
    await queryRunner.query('CREATE UNIQUE INDEX trouble_tickets_number_key ON trouble_tickets (number)');
    await queryRunner.query('CREATE INDEX trouble_tickets_ticket_idx ON trouble_tickets (ticket_id, created_at)');
    await queryRunner.query(
      `CREATE INDEX trouble_tickets_open_idx ON trouble_tickets (tenant_id, created_at) WHERE status <> 'ditutup'`,
    );

    // Remote dan jarkom dari NPR, dikunci agar NPR tidak ditutup bersamaan. Nama trigger
    // diurutkan sebelum assign_number (trigger BEFORE berjalan menurut abjad nama).
    await queryRunner.query(`
      CREATE FUNCTION apply_trouble_ticket_refs() RETURNS trigger
      LANGUAGE plpgsql AS $$
      DECLARE
        npr record;
      BEGIN
        SELECT t.remote_id, t.network_id, t.status INTO npr FROM tickets t
         WHERE t.id = NEW.ticket_id AND t.tenant_id = NEW.tenant_id FOR UPDATE;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'NPR % tidak ada di customer %.', NEW.ticket_id, NEW.tenant_id
            USING ERRCODE = 'foreign_key_violation', CONSTRAINT = 'trouble_tickets_ticket_same_tenant';
        END IF;
        IF npr.status = 'ditutup' THEN
          RAISE EXCEPTION 'NPR % sudah ditutup; TT tidak bisa dibuat.', NEW.ticket_id
            USING ERRCODE = 'check_violation', CONSTRAINT = 'trouble_tickets_ticket_open';
        END IF;
        NEW.remote_id := npr.remote_id;
        NEW.network_id := npr.network_id;
        RETURN NEW;
      END
      $$
    `);
    await queryRunner.query(`
      CREATE TRIGGER apply_refs BEFORE INSERT ON trouble_tickets
      FOR EACH ROW EXECUTE FUNCTION apply_trouble_ticket_refs()
    `);
    await queryRunner.query(`
      CREATE TRIGGER assign_number BEFORE INSERT ON trouble_tickets
      FOR EACH ROW EXECUTE FUNCTION assign_ticket_number('TT')
    `);
    await queryRunner.query(`
      CREATE TRIGGER immutable_columns BEFORE UPDATE ON trouble_tickets
      FOR EACH ROW EXECUTE FUNCTION reject_immutable_change(
        'tenant_id', 'ticket_id', 'remote_id', 'network_id', 'number', 'problem', 'contact', 'created_by', 'created_at')
    `);
    await queryRunner.query(`SELECT audit_enable('trouble_tickets', 'tenant_id')`);

    await queryRunner.query(`
      ALTER TABLE ticket_actions
        ADD COLUMN trouble_ticket_id uuid,
        ADD CONSTRAINT ticket_actions_trouble_ticket_same_ticket FOREIGN KEY (ticket_id, trouble_ticket_id)
          REFERENCES trouble_tickets (ticket_id, id),
        DROP CONSTRAINT ticket_actions_kind_valid,
        ADD CONSTRAINT ticket_actions_kind_valid CHECK (kind IN (${list(KINDS_V3)})),
        ADD CONSTRAINT ticket_actions_trouble_ticket CHECK (
          (kind IN ('tt_dibuat', 'tt_disalin')) = (trouble_ticket_id IS NOT NULL))
    `);
    await queryRunner.query(
      'CREATE INDEX ticket_actions_trouble_ticket_idx ON ticket_actions (trouble_ticket_id) WHERE trouble_ticket_id IS NOT NULL',
    );

    // Entri "TT dibuat" di linimasa NPR, dari jalur mana pun TT dibuat.
    await queryRunner.query(`
      CREATE FUNCTION add_trouble_ticket_created_action() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        INSERT INTO ticket_actions (tenant_id, ticket_id, kind, note, occurred_at, trouble_ticket_id, created_by, created_at)
        VALUES (NEW.tenant_id, NEW.ticket_id, 'tt_dibuat', NEW.number || ' dibuat untuk SD. ' || NEW.problem,
                NEW.created_at, NEW.id, NEW.created_by, NEW.created_at);
        RETURN NULL;
      END
      $$
    `);
    await queryRunner.query(`
      CREATE TRIGGER created_action AFTER INSERT ON trouble_tickets
      FOR EACH ROW EXECUTE FUNCTION add_trouble_ticket_created_action()
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Entri TT di linimasa dilepas dari TT (menjadi catatan) agar TT bisa dibuang.
    await queryRunner.query('ALTER TABLE ticket_actions DISABLE TRIGGER append_only');
    await queryRunner.query(
      `UPDATE ticket_actions SET kind = 'catatan', trouble_ticket_id = NULL WHERE trouble_ticket_id IS NOT NULL`,
    );
    await queryRunner.query('ALTER TABLE ticket_actions ENABLE TRIGGER append_only');
    await queryRunner.query('DROP INDEX ticket_actions_trouble_ticket_idx');
    await queryRunner.query(`
      ALTER TABLE ticket_actions
        DROP CONSTRAINT ticket_actions_trouble_ticket,
        DROP CONSTRAINT ticket_actions_kind_valid,
        ADD CONSTRAINT ticket_actions_kind_valid CHECK (kind IN (${list(KINDS_V2)})),
        DROP CONSTRAINT ticket_actions_trouble_ticket_same_ticket,
        DROP COLUMN trouble_ticket_id
    `);
    await queryRunner.query('DROP TABLE trouble_tickets');
    await queryRunner.query('DROP FUNCTION add_trouble_ticket_created_action()');
    await queryRunner.query('DROP FUNCTION apply_trouble_ticket_refs()');
    await queryRunner.query(`DELETE FROM ticket_counters WHERE kind = 'TT'`);
    await queryRunner.query('ALTER TABLE ticket_counters DROP CONSTRAINT ticket_counters_kind_valid');
    await queryRunner.query(`ALTER TABLE ticket_counters ADD CONSTRAINT ticket_counters_kind_valid CHECK (kind IN ('NPR'))`);
  }
}
