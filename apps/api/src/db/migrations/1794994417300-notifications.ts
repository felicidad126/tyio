import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Notifikasi Telegram (R5, T101–T105).
 *
 * - `notification_channels`: grup (atau topik grup) Telegram penerima, dengan kejadian yang
 *   diterimanya; `notification_channel_tenants`: customer yang diterima bila tidak semua.
 *   Keduanya pengaturan admin, jadi diaudit.
 * - `notification_events`: kejadian tiket (NPR baru, TT dibuka, NPR Selesai, NPR dibuka lagi)
 *   dicatat dalam transaksi yang sama dengan perubahan tiketnya, beserta potret data untuk
 *   pesannya. Tidak ada kejadian yang hilang bila aplikasi mati tepat setelah menyimpan tiket.
 * - `notification_deliveries`: satu baris per kejadian per grup (unik), dibuat di transaksi yang
 *   sama; pekerja notifikasi mengirim, mencoba ulang, dan mencatat hasilnya di sini. Data
 *   operasional bervolume tinggi, tidak diaudit; disimpan 90 hari.
 */
export class Notifications1794994417300 implements MigrationInterface {
  name = 'Notifications1794994417300';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SELECT set_config('tyio.actor', 'sistem:migrasi', true)`);
    const events = `ARRAY['npr_baru', 'tt_dibuka', 'npr_selesai', 'npr_dibuka_lagi']`;
    await queryRunner.query(`
      CREATE TABLE notification_channels (
        id uuid NOT NULL DEFAULT uuidv7(),
        name varchar(80) NOT NULL,
        chat_id varchar(64) NOT NULL,
        thread_id integer,
        events text[] NOT NULL,
        all_tenants boolean NOT NULL DEFAULT true,
        active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT notification_channels_pkey PRIMARY KEY (id),
        CONSTRAINT notification_channels_name_valid CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
        CONSTRAINT notification_channels_chat_id_valid
          CHECK (chat_id ~ '^(-?[0-9]{1,20}|@[A-Za-z][A-Za-z0-9_]{4,31})$'),
        CONSTRAINT notification_channels_thread_valid CHECK (thread_id IS NULL OR thread_id > 0),
        CONSTRAINT notification_channels_events_valid CHECK (
          cardinality(events) > 0 AND events <@ ${events} AND array_position(events, NULL) IS NULL
        )
      )`);
    await queryRunner.query('CREATE UNIQUE INDEX notification_channels_name_key ON notification_channels (lower(name))');
    await queryRunner.query(
      'CREATE UNIQUE INDEX notification_channels_target_key ON notification_channels (chat_id, coalesce(thread_id, 0))',
    );
    await queryRunner.query(`
      CREATE TABLE notification_channel_tenants (
        channel_id uuid NOT NULL,
        tenant_id uuid NOT NULL,
        CONSTRAINT notification_channel_tenants_pkey PRIMARY KEY (channel_id, tenant_id),
        CONSTRAINT notification_channel_tenants_channel_fkey FOREIGN KEY (channel_id)
          REFERENCES notification_channels (id) ON DELETE CASCADE,
        -- Customer yang masih dipilih di grup penerima tidak bisa dihapus (aturan master data).
        CONSTRAINT notification_channel_tenants_tenant_fkey FOREIGN KEY (tenant_id)
          REFERENCES tenants (id) ON DELETE RESTRICT
      )`);
    await queryRunner.query('CREATE INDEX notification_channel_tenants_tenant_idx ON notification_channel_tenants (tenant_id)');
    for (const table of ['notification_channels', 'notification_channel_tenants']) {
      await queryRunner.query(`
        CREATE TRIGGER ${table}_audit AFTER INSERT OR UPDATE OR DELETE ON ${table}
          FOR EACH ROW EXECUTE FUNCTION audit_row_change()`);
      await queryRunner.query(`
        CREATE TRIGGER ${table}_audit_truncate AFTER TRUNCATE ON ${table}
          FOR EACH STATEMENT EXECUTE FUNCTION audit_row_change()`);
    }

    await queryRunner.query(`
      CREATE TABLE notification_events (
        id uuid NOT NULL DEFAULT uuidv7(),
        event_type varchar(32) NOT NULL,
        tenant_id uuid NOT NULL,
        ticket_id uuid NOT NULL,
        payload jsonb NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT notification_events_pkey PRIMARY KEY (id),
        CONSTRAINT notification_events_type_valid CHECK (event_type = ANY (${events})),
        CONSTRAINT notification_events_tenant_fkey FOREIGN KEY (tenant_id)
          REFERENCES tenants (id) ON DELETE RESTRICT,
        CONSTRAINT notification_events_ticket_fkey FOREIGN KEY (ticket_id, tenant_id)
          REFERENCES tickets (id, tenant_id) ON DELETE RESTRICT
      )`);
    await queryRunner.query('CREATE INDEX notification_events_ticket_idx ON notification_events (ticket_id)');
    await queryRunner.query('CREATE INDEX notification_events_created_idx ON notification_events (created_at)');

    await queryRunner.query(`
      CREATE TABLE notification_deliveries (
        id uuid NOT NULL DEFAULT uuidv7(),
        event_id uuid NOT NULL,
        channel_id uuid NOT NULL,
        status varchar(16) NOT NULL DEFAULT 'menunggu',
        attempts integer NOT NULL DEFAULT 0,
        next_attempt_at timestamptz NOT NULL DEFAULT now(),
        locked_until timestamptz,
        expires_at timestamptz NOT NULL DEFAULT now() + interval '24 hours',
        sent_at timestamptz,
        message_id bigint,
        last_attempt_at timestamptz,
        last_error text,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT notification_deliveries_pkey PRIMARY KEY (id),
        CONSTRAINT notification_deliveries_once UNIQUE (event_id, channel_id),
        CONSTRAINT notification_deliveries_event_fkey FOREIGN KEY (event_id)
          REFERENCES notification_events (id) ON DELETE CASCADE,
        CONSTRAINT notification_deliveries_channel_fkey FOREIGN KEY (channel_id)
          REFERENCES notification_channels (id) ON DELETE CASCADE,
        CONSTRAINT notification_deliveries_status_valid
          CHECK (status IN ('menunggu', 'mengirim', 'terkirim', 'gagal')),
        CONSTRAINT notification_deliveries_sent CHECK ((status = 'terkirim') = (sent_at IS NOT NULL))
      )`);
    await queryRunner.query(`
      CREATE INDEX notification_deliveries_due_idx ON notification_deliveries (next_attempt_at)
        WHERE status IN ('menunggu', 'mengirim')`);
    await queryRunner.query(
      'CREATE INDEX notification_deliveries_channel_idx ON notification_deliveries (channel_id, created_at DESC)',
    );
    await queryRunner.query('CREATE INDEX notification_deliveries_created_idx ON notification_deliveries (created_at DESC)');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SELECT set_config('tyio.actor', 'sistem:migrasi', true)`);
    await queryRunner.query('DROP TABLE notification_deliveries');
    await queryRunner.query('DROP TABLE notification_events');
    await queryRunner.query('DROP TABLE notification_channel_tenants');
    await queryRunner.query('DROP TABLE notification_channels');
  }
}
