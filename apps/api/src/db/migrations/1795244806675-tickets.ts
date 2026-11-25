import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Tabel master yang dirujuk tiket dengan foreign key gabungan (tenant_id, id). */
const COMPOSITE_TARGETS = ['master_categories', 'master_systems', 'remotes'] as const;

/**
 * Langkah 1.3: NPR dan penomorannya.
 *
 * - `tickets`: satu NPR untuk satu remote. Remote, kategori, system, dan jarkom harus milik
 *   customer yang sama dengan tiket: foreign key gabungan (tenant_id, …_id), tanpa
 *   ON DELETE (T45), sehingga nilai master dan remote yang sudah dipakai tidak bisa dihapus.
 * - Jarkom disimpan di tiket (bukan hanya lewat remote), karena kodenya ada di nomor NPR
 *   dan jarkom remote bisa berubah lewat impor ulang.
 * - Nomor, remote, jarkom, pembuat, dan waktu dibuat tidak bisa diubah (trigger).
 * - Nomor `NPR/JARKOM/CUSTOMER/TAHUN/BULAN/urut` dibuat trigger `assign_number` saat INSERT,
 *   bukan oleh aplikasi: TAHUN/BULAN dari `created_at` menurut zona remote (T55), urut dari
 *   `ticket_counters` per customer, jenis, jarkom, dan bulan (T56). Setiap jalur tulis
 *   (API, seed, alert di R6, API customer di R7) mendapat nomor yang sama benarnya.
 * - Penghitung dinaikkan dengan `INSERT … ON CONFLICT DO UPDATE` di transaksi yang sama
 *   dengan INSERT tiket: transaksi lain yang memakai penghitung yang sama menunggu sampai
 *   transaksi ini selesai, jadi dua operator yang menyimpan bersamaan tidak pernah
 *   mendapat nomor sama, dan nomor tidak loncat bila penyimpanan gagal.
 * - pg_restore memuat data sebelum membuat trigger, jadi restore tidak memberi nomor baru.
 */
export class Tickets1795244806675 implements MigrationInterface {
  name = 'Tickets1795244806675';

  async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of COMPOSITE_TARGETS) {
      await queryRunner.query(`ALTER TABLE ${table} ADD CONSTRAINT ${table}_tenant_id_id_key UNIQUE (tenant_id, id)`);
    }

    await queryRunner.query(`
      CREATE TABLE ticket_counters (
        tenant_id uuid NOT NULL REFERENCES tenants (id),
        kind text NOT NULL,
        network_id uuid NOT NULL,
        period text NOT NULL,
        last_value integer NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (tenant_id, kind, network_id, period),
        CONSTRAINT ticket_counters_network_same_tenant FOREIGN KEY (tenant_id, network_id)
          REFERENCES master_networks (tenant_id, id),
        CONSTRAINT ticket_counters_kind_valid CHECK (kind IN ('NPR')),
        CONSTRAINT ticket_counters_period_format CHECK (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
        CONSTRAINT ticket_counters_last_value_positive CHECK (last_value > 0)
      )
    `);
    await queryRunner.query(`SELECT audit_enable('ticket_counters', 'tenant_id')`);

    // Zona remote → nama zona IANA. Sama dengan REMOTE_ZONE_IANA di @npr/shared (diuji).
    await queryRunner.query(`
      CREATE FUNCTION ticket_zone_iana(zone text) RETURNS text
      LANGUAGE sql IMMUTABLE STRICT AS $$
        SELECT CASE zone WHEN 'WIB' THEN 'Asia/Jakarta' WHEN 'WITA' THEN 'Asia/Makassar'
                         WHEN 'WIT' THEN 'Asia/Jayapura' END
      $$
    `);

    // Argumen trigger: jenis tiket (NPR; TT menyusul di 1.5b dengan tabelnya sendiri).
    await queryRunner.query(`
      CREATE FUNCTION assign_ticket_number() RETURNS trigger
      LANGUAGE plpgsql AS $$
      DECLARE
        kind text := TG_ARGV[0];
        remote_zone text;
        tenant_code text;
        network_code text;
        period text;
        seq integer;
      BEGIN
        IF NEW.number IS NOT NULL THEN
          RAISE EXCEPTION 'Nomor % dibuat sistem; kolom number jangan diisi.', kind
            USING ERRCODE = 'check_violation', CONSTRAINT = TG_TABLE_NAME || '_number_assigned';
        END IF;
        SELECT r.time_zone INTO remote_zone FROM remotes r WHERE r.id = NEW.remote_id AND r.tenant_id = NEW.tenant_id;
        IF remote_zone IS NULL THEN
          RAISE EXCEPTION 'Remote % tidak ada di customer %.', NEW.remote_id, NEW.tenant_id
            USING ERRCODE = 'foreign_key_violation', CONSTRAINT = TG_TABLE_NAME || '_remote_same_tenant';
        END IF;
        SELECT n.code INTO network_code FROM master_networks n WHERE n.id = NEW.network_id AND n.tenant_id = NEW.tenant_id;
        IF network_code IS NULL THEN
          RAISE EXCEPTION 'Jarkom % tidak ada di customer %.', NEW.network_id, NEW.tenant_id
            USING ERRCODE = 'foreign_key_violation', CONSTRAINT = TG_TABLE_NAME || '_network_same_tenant';
        END IF;
        SELECT t.code INTO tenant_code FROM tenants t WHERE t.id = NEW.tenant_id;

        period := to_char(NEW.created_at AT TIME ZONE ticket_zone_iana(remote_zone), 'YYYY-MM');
        INSERT INTO ticket_counters (tenant_id, kind, network_id, period, last_value)
        VALUES (NEW.tenant_id, kind, NEW.network_id, period, 1)
        ON CONFLICT ON CONSTRAINT ticket_counters_pkey
          DO UPDATE SET last_value = ticket_counters.last_value + 1, updated_at = now()
        RETURNING last_value INTO seq;

        NEW.number := kind || '/' || network_code || '/' || tenant_code || '/' || replace(period, '-', '/') || '/'
          || CASE WHEN seq < 10000 THEN lpad(seq::text, 4, '0') ELSE seq::text END;
        RETURN NEW;
      END
      $$
    `);

    await queryRunner.query(`
      CREATE TABLE tickets (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants (id),
        number text NOT NULL,
        remote_id uuid NOT NULL,
        network_id uuid NOT NULL,
        category_id uuid NOT NULL,
        system_id uuid NOT NULL,
        status text NOT NULL DEFAULT 'terbuka',
        description text NOT NULL,
        started_at timestamptz NOT NULL,
        created_by uuid NOT NULL REFERENCES users (id),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT tickets_remote_same_tenant FOREIGN KEY (tenant_id, remote_id)
          REFERENCES remotes (tenant_id, id),
        CONSTRAINT tickets_network_same_tenant FOREIGN KEY (tenant_id, network_id)
          REFERENCES master_networks (tenant_id, id),
        CONSTRAINT tickets_category_same_tenant FOREIGN KEY (tenant_id, category_id)
          REFERENCES master_categories (tenant_id, id),
        CONSTRAINT tickets_system_same_tenant FOREIGN KEY (tenant_id, system_id)
          REFERENCES master_systems (tenant_id, id),
        CONSTRAINT tickets_number_format
          CHECK (number ~ '^NPR/[A-Z0-9]{2,10}/[A-Z0-9]{2,10}/[0-9]{4}/(0[1-9]|1[0-2])/[0-9]{4,}$'),
        CONSTRAINT tickets_status_valid CHECK (status IN ('terbuka')),
        CONSTRAINT tickets_description_valid
          CHECK (description = btrim(description) AND description <> '' AND length(description) <= 2000),
        CONSTRAINT tickets_started_before_created CHECK (started_at <= created_at)
      )
    `);
    await queryRunner.query('CREATE UNIQUE INDEX tickets_number_key ON tickets (number)');
    // NPR terbuka per remote (peringatan saat membuat NPR) dan riwayat remote (1.6).
    await queryRunner.query('CREATE INDEX tickets_remote_idx ON tickets (tenant_id, remote_id, created_at DESC)');
    await queryRunner.query(`
      CREATE TRIGGER assign_number BEFORE INSERT ON tickets
      FOR EACH ROW EXECUTE FUNCTION assign_ticket_number('NPR')
    `);
    await queryRunner.query(`
      CREATE TRIGGER immutable_columns BEFORE UPDATE ON tickets
      FOR EACH ROW EXECUTE FUNCTION reject_immutable_change(
        'tenant_id', 'number', 'remote_id', 'network_id', 'created_by', 'created_at')
    `);
    await queryRunner.query(`SELECT audit_enable('tickets', 'tenant_id')`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE tickets');
    await queryRunner.query('DROP FUNCTION assign_ticket_number()');
    await queryRunner.query('DROP FUNCTION ticket_zone_iana(text)');
    await queryRunner.query('DROP TABLE ticket_counters');
    for (const table of [...COMPOSITE_TARGETS].reverse()) {
      await queryRunner.query(`ALTER TABLE ${table} DROP CONSTRAINT ${table}_tenant_id_id_key`);
    }
  }
}
