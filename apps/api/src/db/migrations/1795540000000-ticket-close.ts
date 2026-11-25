import type { MigrationInterface, QueryRunner } from 'typeorm';

const KINDS_V3 = [
  'dibuat',
  'cek_jaringan',
  'cek_lokasi',
  'hubungi_customer',
  'catatan',
  'koreksi',
  'ambil',
  'tt_dibuat',
  'tt_disalin',
];
const KINDS_V4 = [...KINDS_V3, 'tutup', 'tt_ditutup'];
/** Sama dengan `TICKET_CLOSE_CAUSES` di @npr/shared (T98). */
const CLOSE_CAUSES = ['link', 'listrik', 'cuaca', 'perangkat', 'lainnya'];
const list = (values: readonly string[]) => values.map((value) => `'${value}'`).join(', ');

const NOT_FOUND = `
        IF current_status IS NULL THEN
          RAISE EXCEPTION 'NPR % tidak ada di customer %.', NEW.ticket_id, NEW.tenant_id
            USING ERRCODE = 'foreign_key_violation', CONSTRAINT = 'ticket_actions_ticket_same_tenant';
        END IF;`;

const CREATED_ONCE = `
        IF NEW.kind = 'dibuat' THEN
          IF EXISTS (SELECT 1 FROM ticket_actions a WHERE a.ticket_id = NEW.ticket_id) THEN
            RAISE EXCEPTION 'NPR % sudah punya entri dibuat.', NEW.ticket_id
              USING ERRCODE = 'check_violation', CONSTRAINT = 'ticket_actions_created_once';
          END IF;
          RETURN NEW;
        END IF;`;

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

const TAKE = `
        IF NEW.kind = 'ambil' THEN
          IF NEW.assignee_id = current_assignee THEN
            RAISE EXCEPTION 'Pengguna % sudah penanggung NPR %.', NEW.assignee_id, NEW.ticket_id
              USING ERRCODE = 'check_violation', CONSTRAINT = 'ticket_actions_assignee_changes';
          END IF;
          -- Penanggung sebelumnya diisi database, bukan oleh penulis entri.
          NEW.assignee_from_id := current_assignee;
        END IF;`;

/** Versi langkah 1.5 (dan 1.5b, yang tidak mengubahnya); dipulihkan saat migrasi ini dibatalkan. */
const APPLY_V3 = `
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
        ${TAKE}

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

/**
 * Versi langkah 1.6: penutupan NPR (entri `tutup`, K21, T98, T99) dan penutupan TT (entri
 * `tt_ditutup`, T100). Peran penulis entri dibaca dari `users`, jadi aturan K21 berlaku untuk
 * setiap jalur tulis, bukan hanya API.
 */
const APPLY_V4 = `
      CREATE OR REPLACE FUNCTION apply_ticket_action() RETURNS trigger
      LANGUAGE plpgsql AS $$
      DECLARE
        current_status text;
        current_assignee uuid;
        author_role text;
        open_tt text;
        tt_status text;
      BEGIN
        -- Kunci NPR: entri untuk NPR yang sama diproses bergantian (juga pembuatan TT).
        SELECT t.status, t.assignee_id INTO current_status, current_assignee FROM tickets t
         WHERE t.id = NEW.ticket_id AND t.tenant_id = NEW.tenant_id FOR UPDATE;
        ${NOT_FOUND}
        ${CREATED_ONCE}
        ${STATUS_CHECKS}
        ${TAKE}

        -- Penutupan NPR: NPR yang punya TT hanya ditutup L2/admin (K21), dan semua TT-nya
        -- harus sudah ditutup (T99).
        IF NEW.kind = 'tutup' AND EXISTS (SELECT 1 FROM trouble_tickets tt WHERE tt.ticket_id = NEW.ticket_id) THEN
          SELECT u.role INTO author_role FROM users u WHERE u.id = NEW.created_by;
          IF coalesce(author_role, '') NOT IN ('l2', 'admin') THEN
            RAISE EXCEPTION 'NPR % punya TT; hanya L2 atau admin yang bisa menutupnya.', NEW.ticket_id
              USING ERRCODE = 'insufficient_privilege', CONSTRAINT = 'ticket_actions_close_role';
          END IF;
          SELECT string_agg(tt.number, ', ' ORDER BY tt.created_at, tt.number) INTO open_tt
            FROM trouble_tickets tt WHERE tt.ticket_id = NEW.ticket_id AND tt.status <> 'ditutup';
          IF open_tt IS NOT NULL THEN
            RAISE EXCEPTION 'NPR % masih punya TT yang belum ditutup: %.', NEW.ticket_id, open_tt
              USING ERRCODE = 'check_violation', CONSTRAINT = 'ticket_actions_close_open_tt';
          END IF;
        END IF;

        -- Entri TT: TT yang sudah ditutup tidak menerima entri lagi; penutupan TT hanya L2/admin
        -- (K21) dan mengisi hasil kunjungan / penyelesaian dari catatan entri (T100).
        IF NEW.kind IN ('tt_disalin', 'tt_ditutup') THEN
          SELECT tt.status INTO tt_status FROM trouble_tickets tt
           WHERE tt.id = NEW.trouble_ticket_id AND tt.ticket_id = NEW.ticket_id FOR UPDATE;
          IF tt_status = 'ditutup' THEN
            RAISE EXCEPTION 'TT % sudah ditutup.', NEW.trouble_ticket_id
              USING ERRCODE = 'check_violation', CONSTRAINT = 'ticket_actions_tt_closed';
          END IF;
          IF NEW.kind = 'tt_ditutup' THEN
            SELECT u.role INTO author_role FROM users u WHERE u.id = NEW.created_by;
            IF coalesce(author_role, '') NOT IN ('l2', 'admin') THEN
              RAISE EXCEPTION 'TT % hanya bisa ditutup L2 atau admin.', NEW.trouble_ticket_id
                USING ERRCODE = 'insufficient_privilege', CONSTRAINT = 'ticket_actions_tt_close_role';
            END IF;
            UPDATE trouble_tickets SET status = 'ditutup', resolution = NEW.note, closed_at = NEW.created_at,
                   closed_by = NEW.created_by, updated_at = now()
             WHERE id = NEW.trouble_ticket_id;
          END IF;
        END IF;

        IF NEW.status_to IS NOT NULL OR NEW.started_at_correction IS NOT NULL
           OR NEW.customer_ticket_number IS NOT NULL OR NEW.assignee_id IS NOT NULL THEN
          UPDATE tickets SET
            status = coalesce(NEW.status_to, status),
            started_at = coalesce(NEW.started_at_correction, started_at),
            customer_ticket_number = CASE WHEN NEW.customer_ticket_number IS NULL THEN customer_ticket_number
                                          ELSE nullif(NEW.customer_ticket_number, '') END,
            assignee_id = coalesce(NEW.assignee_id, assignee_id),
            -- Penutupan mengisi penyebab dan penyelesaian; buka kembali mengosongkannya.
            close_cause = CASE WHEN NEW.kind = 'tutup' THEN NEW.close_cause
                               WHEN NEW.status_from = 'ditutup' THEN NULL ELSE close_cause END,
            resolution = CASE WHEN NEW.kind = 'tutup' THEN NEW.note
                              WHEN NEW.status_from = 'ditutup' THEN NULL ELSE resolution END,
            closed_at = CASE WHEN NEW.kind = 'tutup' THEN NEW.created_at
                             WHEN NEW.status_from = 'ditutup' THEN NULL ELSE closed_at END,
            closed_by = CASE WHEN NEW.kind = 'tutup' THEN NEW.created_by
                             WHEN NEW.status_from = 'ditutup' THEN NULL ELSE closed_by END,
            updated_at = now()
          WHERE id = NEW.ticket_id;
        END IF;
        RETURN NEW;
      END
      $$`;

const GUARD_V2 = `
      CREATE OR REPLACE FUNCTION reject_ticket_change_outside_timeline() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        IF pg_trigger_depth() < 2 AND (
             NEW.status IS DISTINCT FROM OLD.status
             OR NEW.started_at IS DISTINCT FROM OLD.started_at
             OR NEW.customer_ticket_number IS DISTINCT FROM OLD.customer_ticket_number
             OR NEW.assignee_id IS DISTINCT FROM OLD.assignee_id) THEN
          RAISE EXCEPTION 'Status, mulai gangguan, nomor tiket customer, dan penanggung NPR hanya berubah lewat linimasa.'
            USING ERRCODE = 'insufficient_privilege', CONSTRAINT = 'tickets_changes_via_timeline',
                  HINT = 'Tambahkan entri di ticket_actions (lihat docs/pengembangan/tenant-dan-audit.md §7).';
        END IF;
        RETURN NEW;
      END
      $$`;

const GUARD_V3 = `
      CREATE OR REPLACE FUNCTION reject_ticket_change_outside_timeline() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        IF pg_trigger_depth() < 2 AND (
             NEW.status IS DISTINCT FROM OLD.status
             OR NEW.started_at IS DISTINCT FROM OLD.started_at
             OR NEW.customer_ticket_number IS DISTINCT FROM OLD.customer_ticket_number
             OR NEW.assignee_id IS DISTINCT FROM OLD.assignee_id
             OR NEW.close_cause IS DISTINCT FROM OLD.close_cause
             OR NEW.resolution IS DISTINCT FROM OLD.resolution
             OR NEW.closed_at IS DISTINCT FROM OLD.closed_at
             OR NEW.closed_by IS DISTINCT FROM OLD.closed_by) THEN
          RAISE EXCEPTION 'Status, mulai gangguan, nomor tiket customer, penanggung, dan penutupan NPR hanya berubah lewat linimasa.'
            USING ERRCODE = 'insufficient_privilege', CONSTRAINT = 'tickets_changes_via_timeline',
                  HINT = 'Tambahkan entri di ticket_actions (lihat docs/pengembangan/tenant-dan-audit.md §7).';
        END IF;
        RETURN NEW;
      END
      $$`;

const TT_REFS_BODY = `
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
        NEW.network_id := npr.network_id;`;

const TT_REFS = (closable: boolean) => `
      CREATE OR REPLACE FUNCTION apply_trouble_ticket_refs() RETURNS trigger
      LANGUAGE plpgsql AS $$
      DECLARE
        npr record;
      BEGIN
        ${TT_REFS_BODY}${
          closable
            ? `
        -- TT baru selalu Menunggu SD; penutupan hanya lewat entri tt_ditutup (T100).
        IF NEW.status <> 'menunggu_sd' THEN
          RAISE EXCEPTION 'TT baru harus berstatus menunggu_sd; penutupan lewat linimasa NPR.'
            USING ERRCODE = 'check_violation', CONSTRAINT = 'trouble_tickets_created_waiting';
        END IF;`
            : ''
        }
        RETURN NEW;
      END
      $$`;

/**
 * Langkah 1.6: aturan penutupan (K21) dan isian penutupan.
 *
 * - NPR ditutup dengan entri linimasa jenis `tutup` (satu-satunya jalan ke Ditutup): penyebab
 *   dari daftar tetap (`close_cause`, T98) dan penyelesaian di catatan entri. Trigger
 *   `apply_ticket_action` menyalinnya ke `tickets` (`close_cause`, `resolution`, `closed_at`,
 *   `closed_by`) dan mengosongkannya saat NPR dibuka kembali. Kolom itu hanya berubah lewat
 *   linimasa, seperti status (T71).
 * - NPR yang punya TT hanya ditutup L2/admin, dan hanya bila semua TT-nya sudah ditutup (T99).
 * - TT ditutup dengan entri `tt_ditutup` di linimasa NPR-nya: hanya L2/admin, catatannya menjadi
 *   hasil kunjungan / penyelesaian TT (T100). TT yang sudah ditutup tidak menerima entri lagi.
 * - NPR Ditutup yang sudah ada (data dev/staging dari perbaikan manual) mendapat penyebab
 *   "lainnya" dan penyelesaian dari catatan entri penutupnya.
 */
export class TicketClose1795540000000 implements MigrationInterface {
  name = 'TicketClose1795540000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE ticket_actions
        ADD COLUMN close_cause text,
        DROP CONSTRAINT ticket_actions_kind_valid,
        ADD CONSTRAINT ticket_actions_kind_valid CHECK (kind IN (${list(KINDS_V4)})),
        DROP CONSTRAINT ticket_actions_trouble_ticket,
        ADD CONSTRAINT ticket_actions_trouble_ticket CHECK (
          (kind IN ('tt_dibuat', 'tt_disalin', 'tt_ditutup')) = (trouble_ticket_id IS NOT NULL))
    `);
    // Penutupan lama (bukan lewat jalur 1.6) menjadi entri `tutup` dengan penyebab "lainnya".
    await queryRunner.query('ALTER TABLE ticket_actions DISABLE TRIGGER append_only');
    await queryRunner.query(
      `UPDATE ticket_actions SET kind = 'tutup', close_cause = 'lainnya' WHERE status_to = 'ditutup'`,
    );
    await queryRunner.query('ALTER TABLE ticket_actions ENABLE TRIGGER append_only');
    await queryRunner.query(`
      ALTER TABLE ticket_actions
        ADD CONSTRAINT ticket_actions_close_cause_valid CHECK (close_cause IS NULL OR close_cause IN (${list(CLOSE_CAUSES)})),
        ADD CONSTRAINT ticket_actions_close CHECK (
          (kind = 'tutup') = coalesce(status_to = 'ditutup', false)
          AND (kind = 'tutup') = (close_cause IS NOT NULL))
    `);

    await queryRunner.query(`
      ALTER TABLE tickets
        ADD COLUMN close_cause text,
        ADD COLUMN resolution text,
        ADD COLUMN closed_at timestamptz,
        ADD COLUMN closed_by uuid REFERENCES users (id)
    `);
    await queryRunner.query(`
      UPDATE tickets t SET close_cause = a.close_cause, resolution = a.note, closed_at = a.created_at,
             closed_by = a.created_by
        FROM (SELECT DISTINCT ON (ticket_id) ticket_id, close_cause, note, created_at, created_by
                FROM ticket_actions WHERE kind = 'tutup' ORDER BY ticket_id, created_at DESC, seq DESC) a
       WHERE t.id = a.ticket_id AND t.status = 'ditutup'
    `);
    await queryRunner.query(`
      ALTER TABLE tickets
        ADD CONSTRAINT tickets_close_cause_valid CHECK (close_cause IS NULL OR close_cause IN (${list(CLOSE_CAUSES)})),
        ADD CONSTRAINT tickets_closure CHECK (
          (status = 'ditutup') = (closed_at IS NOT NULL)
          AND (closed_at IS NULL) = (close_cause IS NULL)
          AND (closed_at IS NULL) = (resolution IS NULL)
          AND (closed_at IS NULL) = (closed_by IS NULL))
    `);

    await queryRunner.query(`
      ALTER TABLE trouble_tickets
        DROP CONSTRAINT trouble_tickets_status_valid,
        ADD CONSTRAINT trouble_tickets_status_valid CHECK (status IN ('menunggu_sd', 'ditutup')),
        ADD COLUMN resolution text,
        ADD COLUMN closed_at timestamptz,
        ADD COLUMN closed_by uuid REFERENCES users (id),
        ADD CONSTRAINT trouble_tickets_closure CHECK (
          (status = 'ditutup') = (closed_at IS NOT NULL)
          AND (closed_at IS NULL) = (resolution IS NULL)
          AND (closed_at IS NULL) = (closed_by IS NULL))
    `);
    await queryRunner.query(TT_REFS(true));
    // Status dan isian penutupan TT hanya berubah lewat entri tt_ditutup (kedalaman trigger 2).
    await queryRunner.query(`
      CREATE FUNCTION reject_trouble_ticket_change_outside_timeline() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        IF pg_trigger_depth() < 2 AND (
             NEW.status IS DISTINCT FROM OLD.status
             OR NEW.resolution IS DISTINCT FROM OLD.resolution
             OR NEW.closed_at IS DISTINCT FROM OLD.closed_at
             OR NEW.closed_by IS DISTINCT FROM OLD.closed_by) THEN
          RAISE EXCEPTION 'Status dan penutupan TT hanya berubah lewat linimasa NPR (entri tt_ditutup).'
            USING ERRCODE = 'insufficient_privilege', CONSTRAINT = 'trouble_tickets_changes_via_timeline',
                  HINT = 'Tambahkan entri di ticket_actions (lihat docs/pengembangan/tenant-dan-audit.md §9).';
        END IF;
        RETURN NEW;
      END
      $$
    `);
    await queryRunner.query(`
      CREATE TRIGGER changes_via_timeline BEFORE UPDATE ON trouble_tickets
      FOR EACH ROW EXECUTE FUNCTION reject_trouble_ticket_change_outside_timeline()
    `);

    await queryRunner.query(APPLY_V4);
    await queryRunner.query(GUARD_V3);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(GUARD_V2);
    await queryRunner.query(APPLY_V3);
    await queryRunner.query('DROP TRIGGER changes_via_timeline ON trouble_tickets');
    await queryRunner.query('DROP FUNCTION reject_trouble_ticket_change_outside_timeline()');
    await queryRunner.query(TT_REFS(false));

    // Skema lama tidak mengenal entri `tutup` dan `tt_ditutup`: keduanya menjadi `catatan`
    // (teks dan perpindahan status tetap). Penolak UPDATE dilepas sebentar untuk pembatalan ini
    // saja; perubahannya tetap tercatat di audit.
    await queryRunner.query(`
      ALTER TABLE ticket_actions
        DROP CONSTRAINT ticket_actions_close,
        DROP CONSTRAINT ticket_actions_close_cause_valid
    `);
    await queryRunner.query('ALTER TABLE ticket_actions DISABLE TRIGGER append_only');
    await queryRunner.query(`UPDATE ticket_actions SET kind = 'catatan', close_cause = NULL WHERE kind = 'tutup'`);
    await queryRunner.query(
      `UPDATE ticket_actions SET kind = 'catatan', trouble_ticket_id = NULL WHERE kind = 'tt_ditutup'`,
    );
    await queryRunner.query('ALTER TABLE ticket_actions ENABLE TRIGGER append_only');
    await queryRunner.query(`
      ALTER TABLE ticket_actions
        DROP CONSTRAINT ticket_actions_kind_valid,
        ADD CONSTRAINT ticket_actions_kind_valid CHECK (kind IN (${list(KINDS_V3)})),
        DROP CONSTRAINT ticket_actions_trouble_ticket,
        ADD CONSTRAINT ticket_actions_trouble_ticket CHECK (
          (kind IN ('tt_dibuat', 'tt_disalin')) = (trouble_ticket_id IS NOT NULL)),
        DROP COLUMN close_cause
    `);

    // TT yang sudah ditutup kembali Menunggu SD (skema lama hanya punya status itu).
    await queryRunner.query('ALTER TABLE trouble_tickets DROP CONSTRAINT trouble_tickets_closure');
    await queryRunner.query(`UPDATE trouble_tickets SET status = 'menunggu_sd' WHERE status = 'ditutup'`);
    await queryRunner.query(`
      ALTER TABLE trouble_tickets
        DROP CONSTRAINT trouble_tickets_status_valid,
        ADD CONSTRAINT trouble_tickets_status_valid CHECK (status IN ('menunggu_sd')),
        DROP COLUMN resolution,
        DROP COLUMN closed_at,
        DROP COLUMN closed_by
    `);

    await queryRunner.query(`
      ALTER TABLE tickets
        DROP CONSTRAINT tickets_closure,
        DROP CONSTRAINT tickets_close_cause_valid,
        DROP COLUMN close_cause,
        DROP COLUMN resolution,
        DROP COLUMN closed_at,
        DROP COLUMN closed_by
    `);
  }
}
