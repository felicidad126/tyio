import type { MigrationInterface, QueryRunner } from 'typeorm';

const STATUSES = [
  'terbuka',
  'dikerjakan',
  'pending_customer',
  'pending_tm',
  'eskalasi_l2',
  'eskalasi_sd',
  'pulih',
  'ditutup',
] as const;
const ACTIVE = STATUSES.filter((status) => status !== 'ditutup');
const KINDS = ['dibuat', 'cek_jaringan', 'cek_lokasi', 'hubungi_customer', 'catatan', 'koreksi'] as const;

const list = (values: readonly string[]) => values.map((value) => `'${value}'`).join(', ');

/**
 * Langkah 1.4: linimasa tindakan NPR, mesin status, nomor tiket customer, dan lampiran.
 *
 * - `ticket_actions` hanya bisa ditambah (T10, R-F): UPDATE dan DELETE ditolak database,
 *   TRUNCATE ditolak trigger audit. Koreksi adalah entri baru yang merujuk entri lama di NPR
 *   yang sama (foreign key (ticket_id, corrects_id)).
 * - Status, mulai gangguan, dan nomor tiket customer di `tickets` hanya berubah lewat entri
 *   linimasa: trigger `apply_ticket_action` mengunci baris NPR, memeriksa bahwa `status_from`
 *   sama dengan status sekarang dan perpindahannya sah (`ticket_status_transition_allowed`,
 *   sama dengan `isTicketTransitionAllowed` di @npr/shared), lalu memperbarui NPR. UPDATE
 *   langsung pada kolom itu ditolak (`tickets_changes_via_timeline`).
 * - Setiap NPR mendapat entri `dibuat` dari trigger `created_action` (juga NPR yang sudah ada),
 *   jadi linimasa selalu lengkap apa pun jalur pembuatnya.
 * - Lampiran disimpan di database (T70), terikat ke satu entri, hanya-tambah. Isinya tidak
 *   masuk audit_log (kolom disembunyikan), hanya fakta bahwa berkas ditambahkan.
 */
export class TicketActions1795352000000 implements MigrationInterface {
  name = 'TicketActions1795352000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE tickets DROP CONSTRAINT tickets_status_valid');
    await queryRunner.query(`ALTER TABLE tickets ADD CONSTRAINT tickets_status_valid CHECK (status IN (${list(STATUSES)}))`);
    await queryRunner.query(`
      ALTER TABLE tickets ADD COLUMN customer_ticket_number text,
        ADD CONSTRAINT tickets_customer_ticket_number_valid CHECK (
          customer_ticket_number = btrim(customer_ticket_number) AND customer_ticket_number <> ''
          AND length(customer_ticket_number) <= 100)
    `);
    await queryRunner.query('ALTER TABLE tickets ADD CONSTRAINT tickets_tenant_id_id_key UNIQUE (tenant_id, id)');

    await queryRunner.query(`
      CREATE FUNCTION ticket_status_transition_allowed(from_status text, to_status text) RETURNS boolean
      LANGUAGE sql IMMUTABLE STRICT AS $$
        SELECT CASE
          WHEN from_status = to_status OR to_status = 'terbuka' THEN false
          WHEN from_status = 'ditutup' THEN to_status = 'dikerjakan'
          WHEN to_status = 'ditutup' THEN from_status = 'pulih'
          ELSE from_status IN (${list(ACTIVE)}) AND to_status IN (${list(ACTIVE)})
        END
      $$
    `);

    await queryRunner.query(`
      CREATE TABLE ticket_actions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        -- Urutan penyisipan: entri dalam satu transaksi punya created_at yang sama.
        seq bigint GENERATED ALWAYS AS IDENTITY,
        tenant_id uuid NOT NULL REFERENCES tenants (id),
        ticket_id uuid NOT NULL,
        kind text NOT NULL,
        note text NOT NULL,
        occurred_at timestamptz NOT NULL,
        status_from text,
        status_to text,
        pending_reason text,
        corrects_id uuid,
        started_at_correction timestamptz,
        customer_ticket_number text,
        created_by uuid NOT NULL REFERENCES users (id),
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT ticket_actions_ticket_same_tenant FOREIGN KEY (tenant_id, ticket_id)
          REFERENCES tickets (tenant_id, id),
        CONSTRAINT ticket_actions_ticket_id_id_key UNIQUE (ticket_id, id),
        CONSTRAINT ticket_actions_corrects_same_ticket FOREIGN KEY (ticket_id, corrects_id)
          REFERENCES ticket_actions (ticket_id, id),
        CONSTRAINT ticket_actions_kind_valid CHECK (kind IN (${list(KINDS)})),
        CONSTRAINT ticket_actions_note_valid
          CHECK (note = btrim(note) AND note <> '' AND length(note) <= 2000),
        CONSTRAINT ticket_actions_occurred_before_created CHECK (occurred_at <= created_at),
        CONSTRAINT ticket_actions_status_valid CHECK (
          (status_from IS NULL OR status_from IN (${list(STATUSES)}))
          AND (status_to IS NULL OR status_to IN (${list(STATUSES)}))),
        CONSTRAINT ticket_actions_status_pair CHECK (
          CASE WHEN kind = 'dibuat' THEN status_from IS NULL AND status_to = 'terbuka'
               ELSE (status_from IS NULL) = (status_to IS NULL) END),
        CONSTRAINT ticket_actions_pending_reason CHECK (
          CASE WHEN status_to IN ('pending_customer', 'pending_tm')
               THEN pending_reason IS NOT NULL AND pending_reason = btrim(pending_reason)
                    AND pending_reason <> '' AND length(pending_reason) <= 500
               ELSE pending_reason IS NULL END),
        CONSTRAINT ticket_actions_correction CHECK (
          (kind = 'koreksi') = (corrects_id IS NOT NULL)
          AND (started_at_correction IS NULL OR kind = 'koreksi')),
        CONSTRAINT ticket_actions_customer_ticket_number_valid CHECK (
          customer_ticket_number IS NULL OR customer_ticket_number = ''
          OR (customer_ticket_number = btrim(customer_ticket_number) AND length(customer_ticket_number) <= 100))
      )
    `);
    await queryRunner.query('CREATE INDEX ticket_actions_ticket_idx ON ticket_actions (ticket_id, created_at DESC, seq DESC)');
    await queryRunner.query('CREATE INDEX ticket_actions_corrects_idx ON ticket_actions (corrects_id) WHERE corrects_id IS NOT NULL');

    // Penolak UPDATE/DELETE untuk tabel hanya-tambah (linimasa dan lampiran).
    await queryRunner.query(`
      CREATE FUNCTION reject_append_only_change() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION '% hanya bisa ditambah; % ditolak.', TG_TABLE_NAME, TG_OP
          USING ERRCODE = 'insufficient_privilege',
                HINT = 'Perbaikan dicatat sebagai entri koreksi baru yang merujuk entri lama.';
      END
      $$
    `);
    await queryRunner.query(`
      CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON ticket_actions
      FOR EACH ROW EXECUTE FUNCTION reject_append_only_change()
    `);

    await queryRunner.query(`
      CREATE FUNCTION apply_ticket_action() RETURNS trigger
      LANGUAGE plpgsql AS $$
      DECLARE
        current_status text;
      BEGIN
        -- Kunci NPR: entri untuk NPR yang sama diproses bergantian.
        SELECT t.status INTO current_status FROM tickets t
         WHERE t.id = NEW.ticket_id AND t.tenant_id = NEW.tenant_id FOR UPDATE;
        IF current_status IS NULL THEN
          RAISE EXCEPTION 'NPR % tidak ada di customer %.', NEW.ticket_id, NEW.tenant_id
            USING ERRCODE = 'foreign_key_violation', CONSTRAINT = 'ticket_actions_ticket_same_tenant';
        END IF;

        IF NEW.kind = 'dibuat' THEN
          IF EXISTS (SELECT 1 FROM ticket_actions a WHERE a.ticket_id = NEW.ticket_id) THEN
            RAISE EXCEPTION 'NPR % sudah punya entri dibuat.', NEW.ticket_id
              USING ERRCODE = 'check_violation', CONSTRAINT = 'ticket_actions_created_once';
          END IF;
          RETURN NEW;
        END IF;

        IF current_status = 'ditutup' AND NEW.status_to IS DISTINCT FROM 'dikerjakan' THEN
          RAISE EXCEPTION 'NPR % sudah ditutup; buka kembali dulu.', NEW.ticket_id
            USING ERRCODE = 'check_violation', CONSTRAINT = 'ticket_actions_ticket_closed';
        END IF;

        IF NEW.status_to IS NOT NULL THEN
          IF NEW.status_from IS DISTINCT FROM current_status THEN
            RAISE EXCEPTION 'Status NPR % sekarang %, bukan %.', NEW.ticket_id, current_status, NEW.status_from
              USING ERRCODE = 'check_violation', CONSTRAINT = 'ticket_actions_status_from_current';
          END IF;
          IF NOT ticket_status_transition_allowed(NEW.status_from, NEW.status_to) THEN
            RAISE EXCEPTION 'Perpindahan status % → % tidak sah.', NEW.status_from, NEW.status_to
              USING ERRCODE = 'check_violation', CONSTRAINT = 'ticket_actions_status_transition';
          END IF;
        END IF;

        IF NEW.status_to IS NOT NULL OR NEW.started_at_correction IS NOT NULL
           OR NEW.customer_ticket_number IS NOT NULL THEN
          UPDATE tickets SET
            status = coalesce(NEW.status_to, status),
            started_at = coalesce(NEW.started_at_correction, started_at),
            customer_ticket_number = CASE WHEN NEW.customer_ticket_number IS NULL THEN customer_ticket_number
                                          ELSE nullif(NEW.customer_ticket_number, '') END,
            updated_at = now()
          WHERE id = NEW.ticket_id;
        END IF;
        RETURN NEW;
      END
      $$
    `);
    await queryRunner.query(`
      CREATE TRIGGER apply_action BEFORE INSERT ON ticket_actions
      FOR EACH ROW EXECUTE FUNCTION apply_ticket_action()
    `);

    // UPDATE langsung pada status, mulai gangguan, dan nomor tiket customer ditolak; hanya
    // UPDATE dari dalam trigger apply_ticket_action (kedalaman trigger 2) yang lolos.
    await queryRunner.query(`
      CREATE FUNCTION reject_ticket_change_outside_timeline() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        IF pg_trigger_depth() < 2 AND (
             NEW.status IS DISTINCT FROM OLD.status
             OR NEW.started_at IS DISTINCT FROM OLD.started_at
             OR NEW.customer_ticket_number IS DISTINCT FROM OLD.customer_ticket_number) THEN
          RAISE EXCEPTION 'Status, mulai gangguan, dan nomor tiket customer NPR hanya berubah lewat linimasa.'
            USING ERRCODE = 'insufficient_privilege', CONSTRAINT = 'tickets_changes_via_timeline',
                  HINT = 'Tambahkan entri di ticket_actions (lihat docs/pengembangan/tenant-dan-audit.md §7).';
        END IF;
        RETURN NEW;
      END
      $$
    `);
    await queryRunner.query(`
      CREATE TRIGGER changes_via_timeline BEFORE UPDATE ON tickets
      FOR EACH ROW EXECUTE FUNCTION reject_ticket_change_outside_timeline()
    `);

    await queryRunner.query(`SELECT audit_enable('ticket_actions', 'tenant_id')`);

    // Setiap NPR baru, dari jalur mana pun (API, seed, alert di R6), langsung punya entri awal.
    await queryRunner.query(`
      CREATE FUNCTION add_ticket_created_action() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        INSERT INTO ticket_actions (tenant_id, ticket_id, kind, note, occurred_at, status_to, created_by, created_at)
        VALUES (NEW.tenant_id, NEW.id, 'dibuat', NEW.description, NEW.created_at, NEW.status, NEW.created_by, NEW.created_at);
        RETURN NULL;
      END
      $$
    `);
    await queryRunner.query(`
      CREATE TRIGGER created_action AFTER INSERT ON tickets
      FOR EACH ROW EXECUTE FUNCTION add_ticket_created_action()
    `);

    // NPR yang sudah ada (1.3) mendapat entri awal yang sama.
    await queryRunner.query(`
      INSERT INTO ticket_actions (tenant_id, ticket_id, kind, note, occurred_at, status_to, created_by, created_at)
      SELECT tenant_id, id, 'dibuat', description, created_at, status, created_by, created_at FROM tickets
    `);

    await queryRunner.query(`
      CREATE TABLE ticket_attachments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants (id),
        ticket_id uuid NOT NULL,
        action_id uuid NOT NULL,
        file_name text NOT NULL,
        content_type text NOT NULL,
        size_bytes integer NOT NULL,
        sha256 text NOT NULL,
        content bytea NOT NULL,
        created_by uuid NOT NULL REFERENCES users (id),
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT ticket_attachments_ticket_same_tenant FOREIGN KEY (tenant_id, ticket_id)
          REFERENCES tickets (tenant_id, id),
        CONSTRAINT ticket_attachments_action_same_ticket FOREIGN KEY (ticket_id, action_id)
          REFERENCES ticket_actions (ticket_id, id),
        -- Tanpa garis miring dan karakter kontrol. Rentang eksplisit, bukan [:cntrl:], karena
        -- kelas itu bergantung locale (di locale C huruf non-ASCII ikut dianggap kontrol).
        CONSTRAINT ticket_attachments_name_valid
          CHECK (file_name = btrim(file_name) AND file_name <> '' AND length(file_name) <= 200
                 AND file_name !~ '[/\\\\\\x01-\\x1f\\x7f-\\x9f]'),
        CONSTRAINT ticket_attachments_size_valid
          CHECK (size_bytes > 0 AND size_bytes <= 10485760 AND size_bytes = octet_length(content)),
        CONSTRAINT ticket_attachments_sha256_format CHECK (sha256 ~ '^[0-9a-f]{64}$')
      )
    `);
    await queryRunner.query('CREATE INDEX ticket_attachments_action_idx ON ticket_attachments (action_id)');
    await queryRunner.query(`
      CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON ticket_attachments
      FOR EACH ROW EXECUTE FUNCTION reject_append_only_change()
    `);
    // Lampiran hanya bisa ditambahkan bersama entrinya (transaksi yang sama), paling banyak 5.
    await queryRunner.query(`
      CREATE FUNCTION check_ticket_attachment() RETURNS trigger
      LANGUAGE plpgsql AS $$
      DECLARE
        action_created timestamptz;
      BEGIN
        SELECT a.created_at INTO action_created FROM ticket_actions a
         WHERE a.id = NEW.action_id AND a.ticket_id = NEW.ticket_id FOR KEY SHARE;
        IF action_created IS DISTINCT FROM now() THEN
          RAISE EXCEPTION 'Lampiran hanya bisa ditambahkan bersama entri linimasanya.'
            USING ERRCODE = 'check_violation', CONSTRAINT = 'ticket_attachments_with_action';
        END IF;
        IF (SELECT count(*) FROM ticket_attachments t WHERE t.action_id = NEW.action_id) >= 5 THEN
          RAISE EXCEPTION 'Paling banyak 5 lampiran per tindakan.'
            USING ERRCODE = 'check_violation', CONSTRAINT = 'ticket_attachments_per_action';
        END IF;
        RETURN NEW;
      END
      $$
    `);
    await queryRunner.query(`
      CREATE TRIGGER check_attachment BEFORE INSERT ON ticket_attachments
      FOR EACH ROW EXECUTE FUNCTION check_ticket_attachment()
    `);
    await queryRunner.query(`SELECT audit_enable('ticket_attachments', 'tenant_id', ARRAY['content'])`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE ticket_attachments');
    await queryRunner.query('DROP FUNCTION check_ticket_attachment()');
    await queryRunner.query('DROP TRIGGER created_action ON tickets');
    await queryRunner.query('DROP FUNCTION add_ticket_created_action()');
    await queryRunner.query('DROP TRIGGER changes_via_timeline ON tickets');
    await queryRunner.query('DROP FUNCTION reject_ticket_change_outside_timeline()');
    // Status di luar 1.3 tidak bisa dipertahankan oleh skema lama: dikembalikan ke Terbuka.
    // UPDATE ini berjalan setelah trigger penjaga dibuang dan tetap tercatat di audit.
    await queryRunner.query(`UPDATE tickets SET status = 'terbuka' WHERE status <> 'terbuka'`);
    await queryRunner.query('DROP TABLE ticket_actions');
    await queryRunner.query('DROP FUNCTION apply_ticket_action()');
    await queryRunner.query('DROP FUNCTION reject_append_only_change()');
    await queryRunner.query('DROP FUNCTION ticket_status_transition_allowed(text, text)');
    await queryRunner.query('ALTER TABLE tickets DROP CONSTRAINT tickets_tenant_id_id_key');
    await queryRunner.query('ALTER TABLE tickets DROP COLUMN customer_ticket_number');
    await queryRunner.query('ALTER TABLE tickets DROP CONSTRAINT tickets_status_valid');
    await queryRunner.query(`ALTER TABLE tickets ADD CONSTRAINT tickets_status_valid CHECK (status IN ('terbuka'))`);
  }
}
