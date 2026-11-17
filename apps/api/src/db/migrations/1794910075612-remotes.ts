import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Remote (langkah 1.2): site milik satu customer, dengan lokasi, jaringan, kontak, dan
 * status siklus hidup. Pencarian memakai indeks trigram (pg_trgm) atas teks yang sama
 * dengan REMOTE_SEARCH_EXPRESSION di entity. Diaudit seperti tabel data lain.
 */
export class Remotes1794910075612 implements MigrationInterface {
  name = 'Remotes1794910075612';

  async up(queryRunner: QueryRunner): Promise<void> {
    // pg_trgm termasuk ekstensi "trusted": cukup hak CREATE di database, bukan superuser.
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS pg_trgm');
    await queryRunner.query(`
      CREATE TABLE remotes (
        id uuid NOT NULL DEFAULT uuidv7(),
        tenant_id uuid NOT NULL,
        site_id varchar(40) NOT NULL,
        name varchar(160) NOT NULL,
        jarkom_id uuid NOT NULL,
        status varchar(16) NOT NULL DEFAULT 'aktif',
        address varchar(500),
        city varchar(120) NOT NULL,
        province varchar(60) NOT NULL,
        time_zone varchar(32) NOT NULL,
        latitude numeric(9,6),
        longitude numeric(9,6),
        ip_snmp inet,
        ip_lan inet,
        user_ip inet,
        user_id varchar(64),
        kanwil varchar(120),
        kanca varchar(120),
        online_date date,
        contacts jsonb NOT NULL DEFAULT '[]',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT remotes_pkey PRIMARY KEY (id),
        CONSTRAINT remotes_tenant_id_fkey FOREIGN KEY (tenant_id)
          REFERENCES tenants (id) ON DELETE RESTRICT,
        CONSTRAINT remotes_jarkom_id_fkey FOREIGN KEY (jarkom_id)
          REFERENCES jarkoms (id) ON DELETE RESTRICT,
        CONSTRAINT remotes_tenant_site_key UNIQUE (tenant_id, site_id),
        CONSTRAINT remotes_status_valid CHECK (status IN ('aktif', 'nonaktif', 'dibongkar')),
        CONSTRAINT remotes_time_zone_valid
          CHECK (time_zone IN ('Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura')),
        CONSTRAINT remotes_coordinates_pair CHECK ((latitude IS NULL) = (longitude IS NULL)),
        CONSTRAINT remotes_latitude_range CHECK (latitude BETWEEN -90 AND 90),
        CONSTRAINT remotes_longitude_range CHECK (longitude BETWEEN -180 AND 180),
        CONSTRAINT remotes_contacts_array CHECK (jsonb_typeof(contacts) = 'array')
      )`);
    // Untuk pemeriksaan RESTRICT saat jarkom dihapus dan untuk saringan jarkom.
    await queryRunner.query('CREATE INDEX remotes_jarkom_id_idx ON remotes (jarkom_id)');
    // Daftar diurutkan Site ID. Tanpa indeks ini, halaman pertama untuk pengguna semua
    // customer mengurutkan seluruh tabel: 13,7 ms → 0,04 ms pada 50.000 remote (diukur).
    await queryRunner.query('CREATE INDEX remotes_site_id_idx ON remotes (site_id)');
    await queryRunner.query(`
      CREATE INDEX remotes_search_trgm ON remotes USING gin (
        (site_id || ' ' || name || ' ' || city || ' ' || coalesce(kanca, '')) gin_trgm_ops
      )`);
    await queryRunner.query(`
      CREATE TRIGGER remotes_audit AFTER INSERT OR UPDATE OR DELETE ON remotes
        FOR EACH ROW EXECUTE FUNCTION audit_row_change()`);
    await queryRunner.query(`
      CREATE TRIGGER remotes_audit_truncate AFTER TRUNCATE ON remotes
        FOR EACH STATEMENT EXECUTE FUNCTION audit_row_change()`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE remotes');
    // Ekstensi dibiarkan: bisa saja dipakai objek lain, dan tidak berisi data.
  }
}
