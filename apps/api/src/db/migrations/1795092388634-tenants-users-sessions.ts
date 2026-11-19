import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Langkah 0.3: tenant (customer), pengguna dan akses customer-nya, sesi login,
 * dan catatan percobaan login. Aturan data dijaga database, bukan hanya aplikasi.
 */
export class TenantsUsersSessions1795092388634 implements MigrationInterface {
  name = 'TenantsUsersSessions1795092388634';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE tenants (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        code text NOT NULL,
        name text NOT NULL,
        active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT tenants_code_key UNIQUE (code),
        CONSTRAINT tenants_code_format CHECK (code ~ '^[A-Z0-9]{2,10}$'),
        CONSTRAINT tenants_name_not_blank CHECK (btrim(name) <> '')
      )
    `);

    await queryRunner.query(`
      CREATE TABLE users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        email text NOT NULL,
        name text NOT NULL,
        role text NOT NULL,
        password_hash text NOT NULL,
        all_tenants boolean NOT NULL DEFAULT true,
        active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT users_email_key UNIQUE (email),
        CONSTRAINT users_email_lowercase CHECK (email = lower(email)),
        CONSTRAINT users_role_valid CHECK (role IN ('l1', 'l2', 'admin')),
        CONSTRAINT users_name_not_blank CHECK (btrim(name) <> '')
      )
    `);

    await queryRunner.query(`
      CREATE TABLE user_tenants (
        user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE RESTRICT,
        PRIMARY KEY (user_id, tenant_id)
      )
    `);
    await queryRunner.query('CREATE INDEX user_tenants_tenant_id_idx ON user_tenants (tenant_id)');

    await queryRunner.query(`
      CREATE TABLE sessions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        token_hash bytea NOT NULL,
        user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        created_at timestamptz NOT NULL DEFAULT now(),
        last_seen_at timestamptz NOT NULL DEFAULT now(),
        expires_at timestamptz NOT NULL,
        ip text,
        user_agent text,
        CONSTRAINT sessions_token_hash_key UNIQUE (token_hash)
      )
    `);
    await queryRunner.query('CREATE INDEX sessions_user_id_idx ON sessions (user_id)');
    await queryRunner.query('CREATE INDEX sessions_expires_at_idx ON sessions (expires_at)');

    await queryRunner.query(`
      CREATE TABLE login_attempts (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        email text NOT NULL,
        ip text NOT NULL,
        succeeded boolean NOT NULL,
        attempted_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      'CREATE INDEX login_attempts_email_idx ON login_attempts (email, attempted_at)',
    );
    await queryRunner.query(
      'CREATE INDEX login_attempts_ip_failed_idx ON login_attempts (ip, attempted_at) WHERE NOT succeeded',
    );
    await queryRunner.query(
      'CREATE INDEX login_attempts_attempted_at_idx ON login_attempts (attempted_at)',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE login_attempts');
    await queryRunner.query('DROP TABLE sessions');
    await queryRunner.query('DROP TABLE user_tenants');
    await queryRunner.query('DROP TABLE users');
    await queryRunner.query('DROP TABLE tenants');
  }
}
