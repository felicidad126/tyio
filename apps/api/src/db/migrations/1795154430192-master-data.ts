import type { MigrationInterface, QueryRunner } from 'typeorm';

const VALUE_TABLES = ['master_categories', 'master_systems', 'master_networks'] as const;

/**
 * Langkah 1.1: data master per customer (T43–T45): kategori, system (alat monitoring
 * sumber gangguan), dan jarkom (jenis jaringan, kodenya masuk nomor tiket).
 *
 * - Setiap nilai milik satu customer (`tenant_id`) dan tidak bisa pindah customer.
 * - Nama unik per customer tanpa membedakan huruf besar/kecil.
 * - Tabel yang kelak memakai nilai master (remote, tiket) menautkannya dengan foreign key
 *   tanpa ON DELETE, sehingga database menolak penghapusan nilai yang sudah dipakai;
 *   nilai seperti itu hanya bisa dinonaktifkan (T45).
 * - Kode customer dan kode jarkom tidak bisa diubah, karena dipakai di nomor tiket.
 */
export class MasterData1795154430192 implements MigrationInterface {
  name = 'MasterData1795154430192';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Argumen trigger: kolom yang nilainya tidak boleh berubah setelah baris dibuat.
    await queryRunner.query(`
      CREATE FUNCTION reject_immutable_change() RETURNS trigger
      LANGUAGE plpgsql AS $$
      DECLARE
        col text;
      BEGIN
        FOREACH col IN ARRAY TG_ARGV LOOP
          IF to_jsonb(NEW) -> col IS DISTINCT FROM to_jsonb(OLD) -> col THEN
            RAISE EXCEPTION 'Kolom %.% tidak bisa diubah setelah dibuat.', TG_TABLE_NAME, col
              USING ERRCODE = 'check_violation',
                    CONSTRAINT = TG_TABLE_NAME || '_' || col || '_immutable';
          END IF;
        END LOOP;
        RETURN NEW;
      END
      $$
    `);
    await queryRunner.query(`
      CREATE TRIGGER immutable_columns BEFORE UPDATE ON tenants
      FOR EACH ROW EXECUTE FUNCTION reject_immutable_change('code')
    `);

    for (const table of VALUE_TABLES) {
      const withCode = table === 'master_networks';
      await queryRunner.query(`
        CREATE TABLE ${table} (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id uuid NOT NULL REFERENCES tenants (id),
          name text NOT NULL,
          ${withCode ? 'code text NOT NULL,' : ''}
          active boolean NOT NULL DEFAULT true,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now(),
          ${withCode ? `CONSTRAINT ${table}_code_format CHECK (code ~ '^[A-Z0-9]{2,10}$'),` : ''}
          CONSTRAINT ${table}_name_valid CHECK (name = btrim(name) AND name <> '' AND length(name) <= 80)
        )
      `);
      await queryRunner.query(
        `CREATE UNIQUE INDEX ${table}_tenant_name_key ON ${table} (tenant_id, lower(name))`,
      );
      if (withCode) {
        await queryRunner.query(`CREATE UNIQUE INDEX ${table}_tenant_code_key ON ${table} (tenant_id, code)`);
      }
      await queryRunner.query(`
        CREATE TRIGGER immutable_columns BEFORE UPDATE ON ${table}
        FOR EACH ROW EXECUTE FUNCTION reject_immutable_change(${withCode ? "'tenant_id', 'code'" : "'tenant_id'"})
      `);
      await queryRunner.query(`SELECT audit_enable('${table}', 'tenant_id')`);
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of [...VALUE_TABLES].reverse()) {
      await queryRunner.query(`DROP TABLE ${table}`);
    }
    await queryRunner.query('DROP TRIGGER immutable_columns ON tenants');
    await queryRunner.query('DROP FUNCTION reject_immutable_change()');
  }
}
