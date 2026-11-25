import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Langkah 0.4: jejak audit (R-F, R-I).
 *
 * - `audit_log` hanya bisa ditambah: UPDATE, DELETE, dan TRUNCATE ditolak database.
 * - Setiap tabel data memakai trigger `audit` yang mencatat setiap INSERT/UPDATE/DELETE
 *   beserta siapa, dari mana, dan apa yang berubah. Perubahan tanpa konteks audit
 *   (setelan transaksi `npr.source`) ditolak, jadi tidak ada jalur tulis yang lupa dicatat.
 * - Tabel baru diaudit dengan `SELECT audit_enable('nama_tabel', 'tenant_id')`.
 */
export class AuditLog1795094119322 implements MigrationInterface {
  name = 'AuditLog1795094119322';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE audit_log (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        occurred_at timestamptz NOT NULL DEFAULT now(),
        transaction_id xid8 NOT NULL DEFAULT pg_current_xact_id(),
        source text NOT NULL,
        actor_user_id uuid,
        actor_label text,
        client_ip text,
        action text NOT NULL,
        table_name text,
        row_id text,
        tenant_id uuid,
        changes jsonb,
        CONSTRAINT audit_log_source_valid
          CHECK (source IN ('api', 'sistem', 'cli', 'seed', 'migrasi', 'manual')),
        CONSTRAINT audit_log_action_valid
          CHECK (action IN ('insert', 'update', 'delete', 'login', 'login_failed', 'logout'))
      )
    `);
    // Tanpa foreign key: catatan audit tetap utuh walau pengguna atau customer berubah.
    await queryRunner.query('CREATE INDEX audit_log_tenant_idx ON audit_log (tenant_id, id DESC)');
    await queryRunner.query('CREATE INDEX audit_log_actor_idx ON audit_log (actor_user_id, id DESC)');

    await queryRunner.query(`
      CREATE FUNCTION audit_log_append_only() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'audit_log hanya bisa ditambah; % ditolak.', TG_OP
          USING ERRCODE = 'insufficient_privilege';
      END
      $$
    `);
    await queryRunner.query(`
      CREATE TRIGGER audit_log_append_only BEFORE UPDATE OR DELETE ON audit_log
      FOR EACH ROW EXECUTE FUNCTION audit_log_append_only()
    `);
    await queryRunner.query(`
      CREATE TRIGGER audit_log_no_truncate BEFORE TRUNCATE ON audit_log
      FOR EACH STATEMENT EXECUTE FUNCTION audit_log_append_only()
    `);

    // Argumen trigger: [0] kolom tenant ('' bila tabel global), [1..] kolom rahasia yang
    // nilainya tidak pernah masuk audit (hanya dicatat bahwa ia berubah).
    await queryRunner.query(`
      CREATE FUNCTION audit_row_change() RETURNS trigger
      LANGUAGE plpgsql AS $$
      DECLARE
        src text := nullif(current_setting('npr.source', true), '');
        tenant_column text := nullif(TG_ARGV[0], '');
        hidden text[] := coalesce(TG_ARGV[1:], '{}');
        old_row jsonb;
        new_row jsonb;
        row_data jsonb;
        diff jsonb;
      BEGIN
        IF src IS NULL THEN
          RAISE EXCEPTION 'Perubahan % pada tabel % ditolak: tidak ada konteks audit (npr.source).', TG_OP, TG_TABLE_NAME
            USING ERRCODE = 'insufficient_privilege',
                  HINT = 'Tulis lewat auditedTransaction(), atau SET LOCAL npr.source dan npr.actor_label.';
        END IF;

        IF TG_OP <> 'INSERT' THEN old_row := to_jsonb(OLD); END IF;
        IF TG_OP <> 'DELETE' THEN new_row := to_jsonb(NEW); END IF;
        row_data := coalesce(new_row, old_row);

        IF TG_OP = 'UPDATE' THEN
          SELECT jsonb_object_agg(
                   n.key,
                   CASE WHEN n.key = ANY (hidden) THEN '"[disembunyikan]"'::jsonb
                        ELSE jsonb_build_array(o.value, n.value) END)
            INTO diff
            FROM jsonb_each(new_row) AS n
            JOIN jsonb_each(old_row) AS o ON o.key = n.key
           WHERE n.value IS DISTINCT FROM o.value;
          IF diff IS NULL THEN
            RETURN NULL; -- tidak ada yang benar-benar berubah
          END IF;
        ELSE
          diff := row_data - hidden;
        END IF;

        INSERT INTO audit_log
          (source, actor_user_id, actor_label, client_ip, action, table_name, row_id, tenant_id, changes)
        VALUES (
          src,
          nullif(current_setting('npr.actor_user_id', true), '')::uuid,
          nullif(current_setting('npr.actor_label', true), ''),
          nullif(current_setting('npr.client_ip', true), ''),
          lower(TG_OP),
          TG_TABLE_NAME,
          row_data ->> 'id',
          CASE WHEN tenant_column IS NULL THEN NULL ELSE (row_data ->> tenant_column)::uuid END,
          diff
        );
        RETURN NULL;
      END
      $$
    `);

    // TRUNCATE melewati trigger per baris, jadi ditolak di tabel yang diaudit.
    await queryRunner.query(`
      CREATE FUNCTION audit_reject_truncate() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'TRUNCATE pada tabel % ditolak karena tabel ini diaudit.', TG_TABLE_NAME
          USING ERRCODE = 'insufficient_privilege';
      END
      $$
    `);

    await queryRunner.query(`
      CREATE FUNCTION audit_enable(target regclass, tenant_column text, hidden_columns text[] DEFAULT '{}')
      RETURNS void
      LANGUAGE plpgsql AS $$
      BEGIN
        EXECUTE format(
          'CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON %s
             FOR EACH ROW EXECUTE FUNCTION audit_row_change(%s)',
          target,
          (SELECT string_agg(quote_literal(arg), ', ')
             FROM unnest(ARRAY[coalesce(tenant_column, '')] || hidden_columns) AS arg));
        EXECUTE format(
          'CREATE TRIGGER audit_no_truncate BEFORE TRUNCATE ON %s
             FOR EACH STATEMENT EXECUTE FUNCTION audit_reject_truncate()',
          target);
      END
      $$
    `);

    await queryRunner.query(`SELECT audit_enable('tenants', 'id')`);
    await queryRunner.query(`SELECT audit_enable('users', '', ARRAY['password_hash'])`);
    await queryRunner.query(`SELECT audit_enable('user_tenants', 'tenant_id')`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of ['user_tenants', 'users', 'tenants']) {
      await queryRunner.query(`DROP TRIGGER audit_no_truncate ON ${table}`);
      await queryRunner.query(`DROP TRIGGER audit ON ${table}`);
    }
    await queryRunner.query('DROP FUNCTION audit_enable(regclass, text, text[])');
    await queryRunner.query('DROP FUNCTION audit_reject_truncate()');
    await queryRunner.query('DROP FUNCTION audit_row_change()');
    await queryRunner.query('DROP TABLE audit_log');
    await queryRunner.query('DROP FUNCTION audit_log_append_only()');
  }
}
