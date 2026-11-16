import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Tenant (customer), pengguna dan cakupan tenantnya, sesi login, dan catatan login gagal. */
export class AuthAwal1794826197546 implements MigrationInterface {
  name = 'AuthAwal1794826197546';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE tenants (
        id uuid NOT NULL DEFAULT uuidv7(),
        code varchar(16) NOT NULL,
        name varchar(120) NOT NULL,
        active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT tenants_pkey PRIMARY KEY (id),
        CONSTRAINT tenants_code_key UNIQUE (code),
        CONSTRAINT tenants_code_format CHECK (code ~ '^[A-Z0-9]{2,16}$')
      )`);

    await queryRunner.query(`
      CREATE TABLE users (
        id uuid NOT NULL DEFAULT uuidv7(),
        username varchar(64) NOT NULL,
        display_name varchar(120) NOT NULL,
        password_hash text NOT NULL,
        role varchar(16) NOT NULL,
        all_tenants boolean NOT NULL DEFAULT false,
        active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT users_pkey PRIMARY KEY (id),
        CONSTRAINT users_username_key UNIQUE (username),
        CONSTRAINT users_username_format CHECK (username ~ '^[a-z0-9._-]{3,64}$'),
        CONSTRAINT users_role_valid CHECK (role IN ('L1', 'L2', 'admin'))
      )`);

    await queryRunner.query(`
      CREATE TABLE user_tenants (
        user_id uuid NOT NULL,
        tenant_id uuid NOT NULL,
        CONSTRAINT user_tenants_pkey PRIMARY KEY (user_id, tenant_id),
        CONSTRAINT user_tenants_user_id_fkey FOREIGN KEY (user_id)
          REFERENCES users (id) ON DELETE CASCADE,
        CONSTRAINT user_tenants_tenant_id_fkey FOREIGN KEY (tenant_id)
          REFERENCES tenants (id) ON DELETE RESTRICT
      )`);
    await queryRunner.query(
      'CREATE INDEX user_tenants_tenant_id_idx ON user_tenants (tenant_id)',
    );

    await queryRunner.query(`
      CREATE TABLE sessions (
        id uuid NOT NULL DEFAULT uuidv7(),
        token_hash bytea NOT NULL,
        user_id uuid NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        last_seen_at timestamptz NOT NULL DEFAULT now(),
        expires_at timestamptz NOT NULL,
        absolute_expires_at timestamptz NOT NULL,
        ip varchar(64),
        user_agent varchar(512),
        CONSTRAINT sessions_pkey PRIMARY KEY (id),
        CONSTRAINT sessions_token_hash_key UNIQUE (token_hash),
        CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id)
          REFERENCES users (id) ON DELETE CASCADE
      )`);
    await queryRunner.query('CREATE INDEX sessions_user_id_idx ON sessions (user_id)');

    await queryRunner.query(`
      CREATE TABLE login_failures (
        id uuid NOT NULL DEFAULT uuidv7(),
        username_hash bytea NOT NULL,
        ip varchar(64),
        attempted_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT login_failures_pkey PRIMARY KEY (id)
      )`);
    await queryRunner.query(
      'CREATE INDEX login_failures_username_idx ON login_failures (username_hash, attempted_at)',
    );
    await queryRunner.query(
      'CREATE INDEX login_failures_ip_idx ON login_failures (ip, attempted_at)',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE login_failures');
    await queryRunner.query('DROP TABLE sessions');
    await queryRunner.query('DROP TABLE user_tenants');
    await queryRunner.query('DROP TABLE users');
    await queryRunner.query('DROP TABLE tenants');
  }
}
