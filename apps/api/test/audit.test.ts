import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { AuditEntry, AuditPage } from '@npr/shared';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type AuditActor, applyAuditActor, auditedTransaction } from '../src/common/audit/audit-context.js';
import { dataSourceOptions } from '../src/db/options.js';
import { FORBIDDEN_ROLE_MESSAGE } from '../src/modules/auth/roles.guard.js';
import { seed } from '../src/seed/seed.js';
import { createTestApp } from './create-test-app.js';
import {
  asOperator,
  insertTenant,
  insertUser,
  operatorQuery,
  TEST_PASSWORD,
  uniqueEmail,
  uniqueTenantCode,
} from './fixtures.js';
import { testConfig } from './test-config.js';

// Jejak audit (langkah 0.4, R-F, R-I): setiap perubahan data tercatat dengan siapa, kapan,
// apa, dan dari mana; catatan tidak bisa diubah atau dihapus; tulisan tanpa konteks ditolak.

interface AuditRow {
  id: string;
  transaction_id: string;
  source: string;
  actor_user_id: string | null;
  actor_label: string | null;
  client_ip: string | null;
  action: string;
  table_name: string | null;
  row_id: string | null;
  tenant_id: string | null;
  changes: Record<string, unknown> | null;
  occurred_at: Date;
}

const NO_CONTEXT = /tidak ada konteks audit/;

describe('jejak audit', () => {
  let app: NestExpressApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  function auditRows(where: string, params: unknown[]): Promise<AuditRow[]> {
    return dataSource.query(`SELECT * FROM audit_log WHERE ${where} ORDER BY id`, params);
  }

  const apiActor = (overrides: Partial<AuditActor> = {}): AuditActor => ({
    source: 'api',
    userId: randomUUID(),
    label: 'dewi@noc.example',
    clientIp: '203.0.113.7',
    ...overrides,
  });

  describe('perubahan baris data (trigger audit)', () => {
    it('mencatat INSERT dengan siapa, dari mana, dan isi barisnya', async () => {
      const actor = apiActor();
      const code = uniqueTenantCode();

      const [created] = (await auditedTransaction(dataSource, actor, (manager) =>
        manager.query('INSERT INTO tenants (code, name) VALUES ($1, $2) RETURNING id', [code, 'Bank Audit']),
      )) as Array<{ id: string }>;

      const rows = await auditRows('table_name = $1 AND row_id = $2', ['tenants', created?.id]);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        source: 'api',
        actor_user_id: actor.userId,
        actor_label: 'dewi@noc.example',
        client_ip: '203.0.113.7',
        action: 'insert',
        tenant_id: created?.id,
        changes: expect.objectContaining({ code, name: 'Bank Audit', active: true }),
      });
    });

    it('UPDATE hanya mencatat kolom yang berubah, lama dan baru; tanpa perubahan tidak dicatat', async () => {
      const tenant = await insertTenant(dataSource, 'Nama Lama');

      await auditedTransaction(dataSource, apiActor(), async (manager) => {
        await manager.query('UPDATE tenants SET name = $2 WHERE id = $1', [tenant.id, 'Nama Baru']);
        await manager.query('UPDATE tenants SET name = name WHERE id = $1', [tenant.id]);
      });

      const updates = await auditRows("row_id = $1 AND action = 'update'", [tenant.id]);
      expect(updates.map((row) => row.changes)).toEqual([{ name: ['Nama Lama', 'Nama Baru'] }]);
    });

    it('DELETE mencatat isi baris yang dihapus', async () => {
      const tenant = await insertTenant(dataSource, 'Akan Dihapus');

      await operatorQuery(dataSource, 'DELETE FROM tenants WHERE id = $1', [tenant.id]);

      const [deleted] = await auditRows("row_id = $1 AND action = 'delete'", [tenant.id]);
      expect(deleted).toMatchObject({
        source: 'manual',
        actor_label: 'uji otomatis',
        tenant_id: tenant.id,
        changes: expect.objectContaining({ code: tenant.code, name: 'Akan Dihapus' }),
      });
    });

    it('catatan dari satu transaksi berbagi transaction_id', async () => {
      const codes = [uniqueTenantCode(), uniqueTenantCode()];
      await auditedTransaction(dataSource, apiActor(), async (manager) => {
        for (const code of codes) {
          await manager.query('INSERT INTO tenants (code, name) VALUES ($1, $2)', [code, 'Satu Transaksi']);
        }
      });
      const other = await insertTenant(dataSource, 'Transaksi Lain');

      const rows = await auditRows("table_name = 'tenants' AND changes->>'code' = ANY($1)", [
        [...codes, other.code],
      ]);
      expect(rows).toHaveLength(3);
      expect(rows[0]?.transaction_id).toBe(rows[1]?.transaction_id);
      expect(rows[2]?.transaction_id).not.toBe(rows[0]?.transaction_id);
    });

    it('tidak pernah menyimpan hash kata sandi, hanya bahwa ia berubah', async () => {
      const user = await insertUser(dataSource);

      await operatorQuery(dataSource, "UPDATE users SET password_hash = 'hash-baru' WHERE id = $1", [user.id]);

      const rows = await auditRows("table_name = 'users' AND row_id = $1", [user.id]);
      expect(rows.map((row) => row.action)).toEqual(['insert', 'update']);
      expect(rows[0]?.changes).not.toHaveProperty('password_hash');
      expect(rows[0]?.changes).toMatchObject({ email: user.email });
      expect(rows[1]?.changes).toEqual({ password_hash: '[disembunyikan]' });
      expect(JSON.stringify(rows)).not.toMatch(/argon2|hash-baru/);
    });

    it('akses customer pengguna tercatat dengan customer-nya', async () => {
      const tenant = await insertTenant(dataSource, 'Bank Akses');

      const user = await insertUser(dataSource, { tenantCodes: [tenant.code] });

      const [link] = await auditRows("table_name = 'user_tenants' AND changes->>'user_id' = $1", [user.id]);
      expect(link).toMatchObject({ action: 'insert', source: 'cli', tenant_id: tenant.id });
    });
  });

  describe('tulisan tanpa konteks audit', () => {
    it('ditolak database, di dalam maupun di luar transaksi', async () => {
      const tenant = await insertTenant(dataSource, 'Tanpa Konteks');

      await expect(
        dataSource.query('UPDATE tenants SET name = $2 WHERE id = $1', [tenant.id, 'Diam-diam']),
      ).rejects.toThrow(NO_CONTEXT);
      await expect(
        dataSource.transaction((manager) =>
          manager.query('INSERT INTO tenants (code, name) VALUES ($1, $2)', [uniqueTenantCode(), 'X']),
        ),
      ).rejects.toThrow(NO_CONTEXT);
      const [row] = (await dataSource.query('SELECT name FROM tenants WHERE id = $1', [tenant.id])) as Array<{
        name: string;
      }>;
      expect(row?.name).toBe('Tanpa Konteks');
    });

    it('konteks berakhir bersama transaksinya, tidak terbawa ke pemakai koneksi berikutnya', async () => {
      const tenant = await insertTenant(dataSource, 'Koneksi Sama');
      const runner = dataSource.createQueryRunner();
      await runner.connect();
      try {
        await runner.startTransaction();
        await applyAuditActor(runner.manager, apiActor());
        await runner.query('UPDATE tenants SET name = $2 WHERE id = $1', [tenant.id, 'Dalam Transaksi']);
        await runner.commitTransaction();

        await expect(
          runner.query('UPDATE tenants SET name = $2 WHERE id = $1', [tenant.id, 'Sesudahnya']),
        ).rejects.toThrow(NO_CONTEXT);
      } finally {
        await runner.release();
      }
    });

    it('konteks hanya bisa dipasang di dalam transaksi', async () => {
      await expect(applyAuditActor(dataSource.manager, apiActor())).rejects.toThrow(/di dalam transaksi/);
    });

    it('koneksi skrip migrasi tercatat sebagai sumber "migrasi"', async () => {
      const migrationSource = new DataSource(
        dataSourceOptions(testConfig().databaseUrl, { auditSource: 'migrasi' }),
      );
      await migrationSource.initialize();
      try {
        const tenant = await insertTenant(dataSource, 'Sebelum Migrasi');
        await migrationSource.query('UPDATE tenants SET name = $2 WHERE id = $1', [tenant.id, 'Sesudah Migrasi']);

        const [row] = await auditRows("row_id = $1 AND action = 'update'", [tenant.id]);
        expect(row).toMatchObject({ source: 'migrasi', actor_label: 'migrate', actor_user_id: null });
      } finally {
        await migrationSource.destroy();
      }
    });
  });

  describe('catatan audit tidak bisa diubah', () => {
    it('UPDATE, DELETE, dan TRUNCATE pada audit_log ditolak, juga dengan konteks audit', async () => {
      await insertTenant(dataSource, 'Ada Catatan');

      for (const sql of [
        "UPDATE audit_log SET actor_label = 'palsu' WHERE id = (SELECT max(id) FROM audit_log)",
        'DELETE FROM audit_log WHERE id = (SELECT max(id) FROM audit_log)',
        'TRUNCATE audit_log',
      ]) {
        await expect(operatorQuery(dataSource, sql)).rejects.toThrow(/hanya bisa ditambah/);
      }
    });

    it('tabel baru yang diaudit lewat audit_enable() mencatat perubahan dan menolak TRUNCATE', async () => {
      // Semua di dalam satu transaksi yang dibatalkan: tabel uji tidak pernah tersimpan.
      const runner = dataSource.createQueryRunner();
      await runner.connect();
      const table = `audit_uji_${randomUUID().slice(0, 8)}`;
      try {
        await runner.startTransaction();
        await runner.query(`CREATE TABLE ${table} (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid, rahasia text)`);
        await runner.query(`SELECT audit_enable('${table}', 'tenant_id', ARRAY['rahasia'])`);
        await applyAuditActor(runner.manager, apiActor());
        const tenantId = randomUUID();
        await runner.query(`INSERT INTO ${table} (tenant_id, rahasia) VALUES ($1, 'jangan-dicatat')`, [tenantId]);

        const rows: AuditRow[] = await runner.query('SELECT * FROM audit_log WHERE table_name = $1', [table]);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ action: 'insert', tenant_id: tenantId });
        expect(rows[0]?.changes).not.toHaveProperty('rahasia');

        await expect(runner.query(`TRUNCATE ${table}`)).rejects.toThrow(/TRUNCATE .* ditolak/);
      } finally {
        await runner.rollbackTransaction().catch(() => undefined);
        await runner.release();
      }
    });
  });

  describe('aturan skema: setiap tabel data diaudit', () => {
    // Tabel yang sengaja tidak diaudit harus disebut di sini beserta alasannya.
    const NOT_AUDITED: Record<string, string> = {
      migrations: 'catatan migrasi TypeORM',
      sessions: 'diperbarui setiap permintaan; login/logout dicatat sebagai peristiwa',
      login_attempts: 'catatan keamanan sendiri; login gagal juga dicatat sebagai peristiwa',
      audit_log: 'jejak audit itu sendiri',
    };

    it('tabel di luar daftar pengecualian punya trigger audit dan penolak TRUNCATE', async () => {
      const rows: Array<{ table_name: string; triggers: string[] }> = await dataSource.query(
        `SELECT c.relname AS table_name,
                coalesce(array_agg(t.tgname::text ORDER BY t.tgname) FILTER (WHERE t.tgname IS NOT NULL), '{}'::text[]) AS triggers
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
         LEFT JOIN pg_trigger t ON t.tgrelid = c.oid AND t.tgname IN ('audit', 'audit_no_truncate')
         WHERE c.relkind = 'r'
         GROUP BY c.relname
         ORDER BY c.relname`,
      );

      const missing = rows
        .filter((row) => !(row.table_name in NOT_AUDITED))
        .filter((row) => row.triggers.join(',') !== 'audit,audit_no_truncate')
        .map((row) => row.table_name);
      // Perbaikan: di migrasi tabel baru, SELECT audit_enable('nama_tabel', 'tenant_id').
      expect(missing).toEqual([]);
      expect(rows.map((row) => row.table_name)).toEqual(expect.arrayContaining(Object.keys(NOT_AUDITED)));
    });
  });

  describe('sumber perubahan di luar API', () => {
    it('seed tercatat sebagai sumber "seed" dengan nama seeder-nya', async () => {
      const code = uniqueTenantCode();

      await seed(dataSource, 'test', [
        {
          name: 'tenant-uji',
          run: async (manager) => {
            await manager.query('INSERT INTO tenants (code, name) VALUES ($1, $2)', [code, 'Dari Seed']);
          },
        },
      ]);

      const [row] = await auditRows("table_name = 'tenants' AND changes->>'code' = $1", [code]);
      expect(row).toMatchObject({ source: 'seed', actor_label: 'seed:tenant-uji', action: 'insert' });
    });
  });

  describe('peristiwa login', () => {
    const userAgent = 'UjiAudit/1.0';

    it('login berhasil, gagal, dan logout tercatat dengan siapa dan dari mana', async () => {
      const user = await insertUser(dataSource);
      const agent = request.agent(app.getHttpServer());

      await agent
        .post('/api/auth/login')
        .set('User-Agent', userAgent)
        .send({ email: user.email.toUpperCase(), password: 'salah-sekali-ya' })
        .expect(401);
      await agent
        .post('/api/auth/login')
        .set('User-Agent', userAgent)
        .send({ email: user.email, password: TEST_PASSWORD })
        .expect(200);
      await agent.post('/api/auth/logout').set('User-Agent', userAgent).expect(204);
      // Logout tanpa sesi yang masih ada tidak menambah catatan.
      await agent.post('/api/auth/logout').expect(204);

      const rows = await auditRows('actor_label = $1 AND table_name IS NULL', [user.email]);
      expect(rows.map((row) => row.action)).toEqual(['login_failed', 'login', 'logout']);
      expect(rows[0]).toMatchObject({ actor_user_id: null, source: 'api' });
      for (const row of rows.slice(1)) expect(row.actor_user_id).toBe(user.id);
      for (const row of rows) {
        expect(row.client_ip).toMatch(/127\.0\.0\.1|::1/);
        expect(row.changes).toEqual({ user_agent: userAgent });
      }
    });

    it('percobaan yang ditolak karena terkunci tidak menambah catatan', async () => {
      const email = uniqueEmail('kunci-audit');
      const attempt = () =>
        request(app.getHttpServer()).post('/api/auth/login').send({ email, password: 'salah-terus-menerus' });
      for (let i = 0; i < 5; i++) await attempt().expect(401);

      await attempt().expect(429);
      await attempt().expect(429);

      const rows = await auditRows('actor_label = $1', [email]);
      expect(rows).toHaveLength(5);
    });
  });

  describe('GET /api/audit', () => {
    async function loginAs(role: 'l1' | 'admin') {
      const user = await insertUser(dataSource, { role });
      const agent = request.agent(app.getHttpServer());
      await agent.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD }).expect(200);
      return { ...user, agent };
    }

    it('hanya untuk admin', async () => {
      const operator = await loginAs('l1');

      const res = await operator.agent.get('/api/audit').expect(403);

      expect(res.body.message).toBe(FORBIDDEN_ROLE_MESSAGE);
    });

    it('admin semua customer melihat catatan terbaru lebih dulu, termasuk peristiwa login', async () => {
      const admin = await loginAs('admin');
      const tenant = await insertTenant(dataSource, 'Bank Terlihat');

      const res = await admin.agent.get('/api/audit?limit=200').expect(200);

      expect(res.headers['cache-control']).toBe('no-store');
      const entries = (res.body as AuditPage).entries;
      const ids = entries.map((entry) => BigInt(entry.id));
      expect(ids).toEqual([...ids].sort((a, b) => (a > b ? -1 : a < b ? 1 : 0)));
      expect(entries).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ action: 'login', actorUserId: admin.id }),
          expect.objectContaining({ action: 'insert', tableName: 'tenants', tenantId: tenant.id }),
        ]),
      );
      const login = entries.find((entry) => entry.action === 'login' && entry.actorUserId === admin.id);
      expect(login).toEqual({
        id: expect.any(String),
        occurredAt: expect.stringMatching(/^\d{4}-\d\d-\d\dT.*Z$/),
        transactionId: expect.stringMatching(/^\d+$/),
        source: 'api',
        actorUserId: admin.id,
        actorLabel: admin.email,
        clientIp: expect.any(String),
        action: 'login',
        tableName: null,
        rowId: null,
        tenantId: null,
        changes: { user_agent: null },
      } satisfies AuditEntry);
    });

    it('bisa disaring per customer dan dibaca per halaman', async () => {
      const admin = await loginAs('admin');
      const tenant = await insertTenant(dataSource, 'Bank Halaman');
      await operatorQuery(dataSource, 'UPDATE tenants SET name = $2 WHERE id = $1', [tenant.id, 'Bank Halaman 2']);
      await operatorQuery(dataSource, 'UPDATE tenants SET name = $2 WHERE id = $1', [tenant.id, 'Bank Halaman 3']);

      const first = (await admin.agent.get(`/api/audit?tenantId=${tenant.id}&limit=2`).expect(200))
        .body as AuditPage;
      expect(first.entries.map((entry) => entry.action)).toEqual(['update', 'update']);
      expect(first.nextBefore).toBe(first.entries[1]?.id);

      const second = (
        await admin.agent.get(`/api/audit?tenantId=${tenant.id}&limit=2&before=${first.nextBefore}`).expect(200)
      ).body as AuditPage;
      expect(second.entries.map((entry) => entry.action)).toEqual(['insert']);
      expect(second.nextBefore).toBeNull();
    });

    it('menolak parameter yang tidak sah dengan 400', async () => {
      const admin = await loginAs('admin');

      for (const query of ['limit=0', 'limit=201', 'limit=abc', 'before=-1', 'before=abc', 'tenantId=BNA']) {
        await admin.agent.get(`/api/audit?${query}`).expect(400);
      }
    });
  });

  it('tulisan dari uji sendiri juga tercatat (pemeriksa fixture)', async () => {
    const code = uniqueTenantCode();
    await asOperator(dataSource, (manager) =>
      manager.query('INSERT INTO tenants (code, name) VALUES ($1, $2)', [code, 'Fixture']),
    );

    const [row] = await auditRows("changes->>'code' = $1", [code]);
    expect(row).toMatchObject({ source: 'manual', actor_label: 'uji otomatis' });
  });
});
