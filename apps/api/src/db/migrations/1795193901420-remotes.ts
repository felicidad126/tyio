import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Langkah 1.2: remote (site ATM/VSAT milik customer).
 *
 * - Kode remote unik per customer dan tidak bisa diubah (dipakai untuk impor ulang dan
 *   dirujuk tiket).
 * - Jarkom wajib, dan harus milik customer yang sama: foreign key gabungan
 *   (tenant_id, network_id) ke master_networks, tanpa ON DELETE (T45).
 * - Kontak disimpan sebagai daftar terstruktur (jsonb) di baris remote, sehingga
 *   perubahan kontak ikut tercatat di audit bersama remote-nya.
 */
export class Remotes1795193901420 implements MigrationInterface {
  name = 'Remotes1795193901420';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Sasaran foreign key gabungan: jarkom remote harus milik customer remote itu.
    await queryRunner.query(
      'ALTER TABLE master_networks ADD CONSTRAINT master_networks_tenant_id_id_key UNIQUE (tenant_id, id)',
    );

    await queryRunner.query(`
      CREATE TABLE remotes (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants (id),
        code text NOT NULL,
        name text NOT NULL,
        network_id uuid NOT NULL,
        active boolean NOT NULL DEFAULT true,
        address text,
        city text,
        province text,
        time_zone text NOT NULL,
        latitude numeric(9, 6),
        longitude numeric(9, 6),
        kanwil text,
        kanca text,
        ip_snmp inet,
        ip_lan inet,
        user_ip inet,
        user_ident text,
        manager text,
        online_since date,
        contacts jsonb NOT NULL DEFAULT '[]'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT remotes_network_same_tenant FOREIGN KEY (tenant_id, network_id)
          REFERENCES master_networks (tenant_id, id),
        CONSTRAINT remotes_code_format CHECK (code ~ '^[A-Z0-9][A-Z0-9._-]{1,39}$'),
        CONSTRAINT remotes_name_valid CHECK (name = btrim(name) AND name <> '' AND length(name) <= 120),
        CONSTRAINT remotes_time_zone_valid CHECK (time_zone IN ('WIB', 'WITA', 'WIT')),
        CONSTRAINT remotes_coordinates_pair CHECK ((latitude IS NULL) = (longitude IS NULL)),
        CONSTRAINT remotes_latitude_range CHECK (latitude BETWEEN -90 AND 90),
        CONSTRAINT remotes_longitude_range CHECK (longitude BETWEEN -180 AND 180),
        CONSTRAINT remotes_contacts_array CHECK (jsonb_typeof(contacts) = 'array')
      )
    `);
    await queryRunner.query('CREATE UNIQUE INDEX remotes_tenant_code_key ON remotes (tenant_id, code)');
    await queryRunner.query('CREATE INDEX remotes_network_idx ON remotes (tenant_id, network_id)');
    // Urutan daftar bawaan (kode) lintas customer.
    await queryRunner.query('CREATE INDEX remotes_code_idx ON remotes (code, tenant_id)');
    await queryRunner.query(`
      CREATE TRIGGER immutable_columns BEFORE UPDATE ON remotes
      FOR EACH ROW EXECUTE FUNCTION reject_immutable_change('tenant_id', 'code')
    `);
    await queryRunner.query(`SELECT audit_enable('remotes', 'tenant_id')`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE remotes');
    await queryRunner.query('ALTER TABLE master_networks DROP CONSTRAINT master_networks_tenant_id_id_key');
  }
}
