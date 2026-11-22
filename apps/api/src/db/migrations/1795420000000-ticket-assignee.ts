import type { MigrationInterface, QueryRunner } from 'typeorm';

const KINDS_V1 = ['dibuat', 'cek_jaringan', 'cek_lokasi', 'hubungi_customer', 'catatan', 'koreksi'];
const KINDS_V2 = [...KINDS_V1, 'ambil'];
const list = (values: readonly string[]) => values.map((value) => `'${value}'`).join(', ');

/** Bagian apply_ticket_action yang sama di kedua versi: status, koreksi, nomor tiket customer. */
const STATUS_CHECKS = `
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
        END IF;`;

const CREATED_ONCE = `
        IF NEW.kind = 'dibuat' THEN
          IF EXISTS (SELECT 1 FROM ticket_actions a WHERE a.ticket_id = NEW.ticket_id) THEN
            RAISE EXCEPTION 'NPR % sudah punya entri dibuat.', NEW.ticket_id
              USING ERRCODE = 'check_violation', CONSTRAINT = 'ticket_actions_created_once';
          END IF;
          RETURN NEW;
        END IF;`;

const NOT_FOUND = `
        IF current_status IS NULL THEN
          RAISE EXCEPTION 'NPR % tidak ada di customer %.', NEW.ticket_id, NEW.tenant_id
            USING ERRCODE = 'foreign_key_violation', CONSTRAINT = 'ticket_actions_ticket_same_tenant';
        END IF;`;

/** Versi langkah 1.4 (dipulihkan saat migrasi ini dibatalkan). */
const APPLY_V1 = `
      CREATE OR REPLACE FUNCTION apply_ticket_action() RETURNS trigger
      LANGUAGE plpgsql AS $$
      DECLARE
        current_status text;
      BEGIN
        SELECT t.status INTO current_status FROM tickets t
         WHERE t.id = NEW.ticket_id AND t.tenant_id = NEW.tenant_id FOR UPDATE;
        ${NOT_FOUND}
        ${CREATED_ONCE}
        ${STATUS_CHECKS}

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
      $$`;

/** Versi langkah 1.5: entri `ambil` mengganti penanggung; penanggung lama dicatat database. */
const APPLY_V2 = `
      CREATE OR REPLACE FUNCTION apply_ticket_action() RETURNS trigger
      LANGUAGE plpgsql AS $$
      DECLARE
        current_status text;
        current_assignee uuid;
      BEGIN
        -- Kunci NPR: entri untuk NPR yang sama diproses bergantian.
        SELECT t.status, t.assignee_id INTO current_status, current_assignee FROM tickets t
         WHERE t.id = NEW.ticket_id AND t.tenant_id = NEW.tenant_id FOR UPDATE;
        ${NOT_FOUND}
        ${CREATED_ONCE}
        ${STATUS_CHECKS}

        IF NEW.kind = 'ambil' THEN
          IF NEW.assignee_id = current_assignee THEN
            RAISE EXCEPTION 'Pengguna % sudah penanggung NPR %.', NEW.assignee_id, NEW.ticket_id
              USING ERRCODE = 'check_violation', CONSTRAINT = 'ticket_actions_assignee_changes';
          END IF;
          -- Penanggung sebelumnya diisi database, bukan oleh penulis entri.
          NEW.assignee_from_id := current_assignee;
        END IF;

        IF NEW.status_to IS NOT NULL OR NEW.started_at_correction IS NOT NULL
           OR NEW.customer_ticket_number IS NOT NULL OR NEW.assignee_id IS NOT NULL THEN
          UPDATE tickets SET
            status = coalesce(NEW.status_to, status),
            started_at = coalesce(NEW.started_at_correction, started_at),
            customer_ticket_number = CASE WHEN NEW.customer_ticket_number IS NULL THEN customer_ticket_number
                                          ELSE nullif(NEW.customer_ticket_number, '') END,
            assignee_id = coalesce(NEW.assignee_id, assignee_id),
            updated_at = now()
          WHERE id = NEW.ticket_id;
        END IF;
        RETURN NEW;
      END
      $$`;

const GUARD = (withAssignee: boolean) => `
      CREATE OR REPLACE FUNCTION reject_ticket_change_outside_timeline() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        IF pg_trigger_depth() < 2 AND (
             NEW.status IS DISTINCT FROM OLD.status
             OR NEW.started_at IS DISTINCT FROM OLD.started_at
             OR NEW.customer_ticket_number IS DISTINCT FROM OLD.customer_ticket_number${
               withAssignee ? '\n             OR NEW.assignee_id IS DISTINCT FROM OLD.assignee_id' : ''
             }) THEN
          RAISE EXCEPTION '${
            withAssignee
              ? 'Status, mulai gangguan, nomor tiket customer, dan penanggung NPR hanya berubah lewat linimasa.'
              : 'Status, mulai gangguan, dan nomor tiket customer NPR hanya berubah lewat linimasa.'
          }'
            USING ERRCODE = 'insufficient_privilege', CONSTRAINT = 'tickets_changes_via_timeline',
                  HINT = 'Tambahkan entri di ticket_actions (lihat docs/pengembangan/tenant-dan-audit.md §7).';
        END IF;
        RETURN NEW;
      END
      $$`;

/**
 * Langkah 1.5: penanggung NPR (T81) dan indeks antrean.
 *
 * - `tickets.assignee_id`: penanggung sekarang. Seperti status, hanya berubah lewat entri
 *   linimasa jenis `ambil`; trigger mencatat penanggung sebelumnya di entri itu
 *   (`assignee_from_id`), jadi "diambil alih dari siapa" tidak bisa dipalsukan.
 * - Indeks untuk antrean: NPR terbuka per customer menurut mulai gangguan, dan per penanggung
 *   ("Milik saya").
 */
export class TicketAssignee1795420000000 implements MigrationInterface {
  name = 'TicketAssignee1795420000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE tickets ADD COLUMN assignee_id uuid REFERENCES users (id)');
    await queryRunner.query(`
      ALTER TABLE ticket_actions
        ADD COLUMN assignee_id uuid REFERENCES users (id),
        ADD COLUMN assignee_from_id uuid REFERENCES users (id),
        DROP CONSTRAINT ticket_actions_kind_valid,
        ADD CONSTRAINT ticket_actions_kind_valid CHECK (kind IN (${list(KINDS_V2)})),
        ADD CONSTRAINT ticket_actions_assignee CHECK (
          (kind = 'ambil') = (assignee_id IS NOT NULL)
          AND (assignee_from_id IS NULL OR kind = 'ambil'))
    `);
    await queryRunner.query(APPLY_V2);
    await queryRunner.query(GUARD(true));

    await queryRunner.query(
      `CREATE INDEX tickets_queue_idx ON tickets (tenant_id, started_at) WHERE status <> 'ditutup'`,
    );
    await queryRunner.query(
      `CREATE INDEX tickets_assignee_idx ON tickets (assignee_id, started_at) WHERE status <> 'ditutup'`,
    );
    await queryRunner.query('CREATE INDEX tickets_customer_ticket_number_idx ON tickets (lower(customer_ticket_number))');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX tickets_customer_ticket_number_idx');
    await queryRunner.query('DROP INDEX tickets_assignee_idx');
    await queryRunner.query('DROP INDEX tickets_queue_idx');
    await queryRunner.query(APPLY_V1);
    await queryRunner.query(GUARD(false));
    // Skema lama tidak mengenal entri `ambil`: entri itu menjadi `catatan` (teksnya tetap,
    // bisa dirujuk koreksi atau lampiran). Linimasa hanya-tambah, jadi penolak UPDATE dilepas
    // sebentar untuk pembatalan migrasi ini saja; perubahannya tetap tercatat di audit.
    await queryRunner.query('ALTER TABLE ticket_actions DISABLE TRIGGER append_only');
    await queryRunner.query(
      `UPDATE ticket_actions SET kind = 'catatan', assignee_id = NULL, assignee_from_id = NULL WHERE kind = 'ambil'`,
    );
    await queryRunner.query('ALTER TABLE ticket_actions ENABLE TRIGGER append_only');
    await queryRunner.query(`
      ALTER TABLE ticket_actions
        DROP CONSTRAINT ticket_actions_assignee,
        DROP CONSTRAINT ticket_actions_kind_valid,
        ADD CONSTRAINT ticket_actions_kind_valid CHECK (kind IN (${list(KINDS_V1)})),
        DROP COLUMN assignee_from_id,
        DROP COLUMN assignee_id
    `);
    await queryRunner.query('ALTER TABLE tickets DROP COLUMN assignee_id');
  }
}
