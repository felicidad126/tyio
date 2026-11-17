import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Master data (langkah 1.1): kategori, system, dan jarkom, berbentuk sama dengan tenants.
 * Nama unik per daftar tanpa membedakan huruf besar/kecil, termasuk nama customer.
 * Ketiga tabel baru diaudit dengan trigger yang sama seperti di migrasi audit-log.
 */
const TABLES = ['ticket_categories', 'systems', 'jarkoms'];

export class MasterData1794908015332 implements MigrationInterface {
  name = 'MasterData1794908015332';

  async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of TABLES) {
      await queryRunner.query(`
        CREATE TABLE ${table} (
          id uuid NOT NULL DEFAULT uuidv7(),
          code varchar(16) NOT NULL,
          name varchar(120) NOT NULL,
          active boolean NOT NULL DEFAULT true,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now(),
          CONSTRAINT ${table}_pkey PRIMARY KEY (id),
          CONSTRAINT ${table}_code_key UNIQUE (code),
          CONSTRAINT ${table}_code_format CHECK (code ~ '^[A-Z0-9]{2,16}$')
        )`);
      await queryRunner.query(`CREATE UNIQUE INDEX ${table}_name_key ON ${table} (lower(name))`);
      await attachAudit(queryRunner, table);
    }
    // Gagal bila sudah ada dua customer dengan nama yang sama (beda huruf besar/kecil saja):
    // rapikan dulu datanya, karena dua customer bernama sama membingungkan operator.
    await queryRunner.query('CREATE UNIQUE INDEX tenants_name_key ON tenants (lower(name))');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX tenants_name_key');
    for (const table of [...TABLES].reverse()) {
      // Trigger audit ikut terhapus bersama tabelnya.
      await queryRunner.query(`DROP TABLE ${table}`);
    }
  }
}

/** Sama dengan attachAudit di migrasi audit-log (ditulis ulang agar migrasi itu tidak berubah). */
async function attachAudit(queryRunner: QueryRunner, table: string): Promise<void> {
  await queryRunner.query(`
    CREATE TRIGGER ${table}_audit AFTER INSERT OR UPDATE OR DELETE ON ${table}
      FOR EACH ROW EXECUTE FUNCTION audit_row_change()`);
  await queryRunner.query(`
    CREATE TRIGGER ${table}_audit_truncate AFTER TRUNCATE ON ${table}
      FOR EACH STATEMENT EXECUTE FUNCTION audit_row_change()`);
}
