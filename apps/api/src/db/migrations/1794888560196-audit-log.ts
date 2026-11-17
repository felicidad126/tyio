import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Audit log (R-F, R-I): setiap perubahan baris di tabel yang diaudit dicatat oleh trigger
 * database, termasuk perubahan lewat SQL mentah. Perubahan tanpa pelaku (`tyio.actor`)
 * ditolak. Audit log sendiri hanya bisa ditambah.
 *
 * Tabel baru di migrasi berikutnya dipasangi audit dengan dua pernyataan yang sama seperti
 * di `attachAudit` di bawah (ditulis ulang di migrasi itu, bukan diimpor, agar migrasi lama
 * tidak berubah perilaku).
 */
const AUDITED_TABLES = ['tenants', 'users', 'user_tenants'];

export class AuditLog1794888560196 implements MigrationInterface {
  name = 'AuditLog1794888560196';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE audit_log (
        id uuid NOT NULL DEFAULT uuidv7(),
        occurred_at timestamptz NOT NULL DEFAULT now(),
        actor varchar(120) NOT NULL,
        actor_user_id uuid,
        ip varchar(64),
        user_agent varchar(512),
        action varchar(40) NOT NULL,
        table_name varchar(63),
        row_id varchar(64),
        tenant_id uuid,
        data jsonb,
        CONSTRAINT audit_log_pkey PRIMARY KEY (id)
      )`);
    await queryRunner.query(
      'CREATE INDEX audit_log_tenant_idx ON audit_log (tenant_id, occurred_at)',
    );
    await queryRunner.query('CREATE INDEX audit_log_row_idx ON audit_log (table_name, row_id)');
    await queryRunner.query(
      'CREATE INDEX audit_log_actor_idx ON audit_log (actor_user_id, occurred_at)',
    );

    // Hanya-tambah. Catatan: pemilik database tetap bisa menghapus trigger ini; pemisahan
    // peran database (aplikasi tanpa hak UPDATE/DELETE) adalah bagian pengerasan produksi.
    await queryRunner.query(`
      CREATE FUNCTION audit_log_immutable() RETURNS trigger LANGUAGE plpgsql AS $fn$
      BEGIN
        RAISE EXCEPTION 'audit_log hanya boleh ditambah; % ditolak', TG_OP
          USING ERRCODE = 'insufficient_privilege';
      END
      $fn$`);
    await queryRunner.query(`
      CREATE TRIGGER audit_log_no_change BEFORE UPDATE OR DELETE ON audit_log
        FOR EACH ROW EXECUTE FUNCTION audit_log_immutable()`);
    await queryRunner.query(`
      CREATE TRIGGER audit_log_no_truncate BEFORE TRUNCATE ON audit_log
        FOR EACH STATEMENT EXECUTE FUNCTION audit_log_immutable()`);

    await queryRunner.query(`
      CREATE FUNCTION audit_row_change() RETURNS trigger LANGUAGE plpgsql AS $fn$
      DECLARE
        -- Nilai kolom rahasia tidak pernah disalin ke audit.
        sensitive constant text[] := ARRAY['password_hash', 'token_hash', 'username_hash'];
        actor text := nullif(current_setting('tyio.actor', true), '');
        actor_user_id uuid := nullif(current_setting('tyio.actor_user_id', true), '')::uuid;
        client_ip text := nullif(current_setting('tyio.ip', true), '');
        client_agent text := nullif(current_setting('tyio.user_agent', true), '');
        old_row jsonb;
        new_row jsonb;
        subject jsonb;
        row_data jsonb;
      BEGIN
        IF actor IS NULL THEN
          RAISE EXCEPTION 'Perubahan % pada tabel % ditolak: pelaku belum diisi (tyio.actor).',
            TG_OP, TG_TABLE_NAME
            USING ERRCODE = 'insufficient_privilege',
                  HINT = 'Aplikasi: pakai withActor(). Manual: SET LOCAL tyio.actor = ''dba:<nama>'' di dalam transaksi.';
        END IF;

        IF TG_OP = 'TRUNCATE' THEN
          INSERT INTO audit_log (actor, actor_user_id, ip, user_agent, action, table_name)
          VALUES (actor, actor_user_id, client_ip, client_agent, 'truncate', TG_TABLE_NAME);
          RETURN NULL;
        END IF;

        IF TG_OP <> 'INSERT' THEN old_row := to_jsonb(OLD); END IF;
        IF TG_OP <> 'DELETE' THEN new_row := to_jsonb(NEW); END IF;
        subject := coalesce(new_row, old_row);

        IF TG_OP = 'UPDATE' THEN
          SELECT jsonb_object_agg(
                   n.key,
                   CASE WHEN n.key = ANY (sensitive) THEN to_jsonb('diubah'::text)
                        ELSE jsonb_build_object('lama', old_row -> n.key, 'baru', n.value) END)
            INTO row_data
            FROM jsonb_each(new_row) AS n
           WHERE n.value IS DISTINCT FROM old_row -> n.key;
          IF row_data IS NULL THEN
            RETURN NULL; -- tidak ada nilai yang benar-benar berubah
          END IF;
        ELSE
          SELECT jsonb_object_agg(
                   s.key,
                   CASE WHEN s.key = ANY (sensitive) THEN to_jsonb('[disamarkan]'::text)
                        ELSE s.value END)
            INTO row_data
            FROM jsonb_each(subject) AS s;
        END IF;

        INSERT INTO audit_log
          (actor, actor_user_id, ip, user_agent, action, table_name, row_id, tenant_id, data)
        VALUES
          (actor, actor_user_id, client_ip, client_agent, lower(TG_OP), TG_TABLE_NAME,
           subject ->> 'id',
           (CASE WHEN TG_TABLE_NAME = 'tenants' THEN subject ->> 'id'
                 ELSE subject ->> 'tenant_id' END)::uuid,
           row_data);
        RETURN NULL;
      END
      $fn$`);

    for (const table of AUDITED_TABLES) {
      await attachAudit(queryRunner, table);
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of AUDITED_TABLES) {
      await queryRunner.query(`DROP TRIGGER ${table}_audit_truncate ON ${table}`);
      await queryRunner.query(`DROP TRIGGER ${table}_audit ON ${table}`);
    }
    await queryRunner.query('DROP FUNCTION audit_row_change()');
    await queryRunner.query('DROP TABLE audit_log');
    await queryRunner.query('DROP FUNCTION audit_log_immutable()');
  }
}

async function attachAudit(queryRunner: QueryRunner, table: string): Promise<void> {
  await queryRunner.query(`
    CREATE TRIGGER ${table}_audit AFTER INSERT OR UPDATE OR DELETE ON ${table}
      FOR EACH ROW EXECUTE FUNCTION audit_row_change()`);
  await queryRunner.query(`
    CREATE TRIGGER ${table}_audit_truncate AFTER TRUNCATE ON ${table}
      FOR EACH STATEMENT EXECUTE FUNCTION audit_row_change()`);
}
