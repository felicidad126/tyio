import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { type Actor, withActor } from '../src/common/audit/actor.js';
import { AUDIT_EXCLUDED_TABLES } from '../src/common/audit/audit-exclusions.js';
import { AuditEntryEntity, type AuditEntry } from '../src/common/audit/audit-entry.entity.js';
import { hashPassword } from '../src/modules/auth/password.js';
import { TenantEntity } from '../src/modules/tenants/tenant.entity.js';
import { UserEntity } from '../src/modules/users/user.entity.js';
import { createTestApp } from './create-test-app.js';
import { resetData, testDataSource } from './db.js';
import { createUser, sessionCookieFrom, TEST_PASSWORD } from './fixtures.js';

const ACTOR: Actor = {
  name: 'pengguna:penguji',
  userId: '01900000-0000-7000-8000-000000000001',
  ip: '127.0.0.1',
  userAgent: 'penguji/1.0',
};

describe('audit log perubahan data', () => {
  const ds = testDataSource();

  beforeAll(async () => {
    await ds.initialize();
  });

  afterAll(async () => {
    await ds.destroy();
  });

  beforeEach(async () => {
    await resetData(ds);
  });

  const auditOf = (table: string, rowId: string) =>
    ds.getRepository(AuditEntryEntity).find({
      where: { tableName: table, rowId },
      order: { occurredAt: 'ASC', id: 'ASC' },
    });

  it('mencatat siapa, kapan, apa, dan dari mana untuk tambah, ubah, dan hapus', async () => {
    const started = new Date(Date.now() - 1000);
    const tenant = await withActor(ds, ACTOR, (m) =>
      m.getRepository(TenantEntity).save({ code: 'AUD', name: 'Bank Audit' }),
    );
    await withActor(ds, ACTOR, (m) =>
      m.getRepository(TenantEntity).update(tenant.id, { name: 'Bank Audit Baru' }),
    );
    await withActor(ds, ACTOR, (m) => m.getRepository(TenantEntity).delete(tenant.id));

    const rows = await auditOf('tenants', tenant.id);

    expect(rows.map((r) => r.action)).toEqual(['insert', 'update', 'delete']);
    for (const row of rows) {
      expect(row).toMatchObject({
        actor: 'pengguna:penguji',
        actorUserId: ACTOR.userId,
        ip: '127.0.0.1',
        userAgent: 'penguji/1.0',
        tenantId: tenant.id,
      });
      expect(row.occurredAt.getTime()).toBeGreaterThanOrEqual(started.getTime());
    }
    expect(rows[0]?.data).toMatchObject({ code: 'AUD', name: 'Bank Audit' });
    expect(rows[1]?.data).toMatchObject({ name: { lama: 'Bank Audit', baru: 'Bank Audit Baru' } });
    expect(rows[1]?.data).not.toHaveProperty('code');
    expect(rows[2]?.data).toMatchObject({ code: 'AUD', name: 'Bank Audit Baru' });
  });

  it('menolak perubahan yang pelakunya tidak diketahui', async () => {
    await expect(
      ds.getRepository(TenantEntity).save({ code: 'TANPA', name: 'Tanpa pelaku' }),
    ).rejects.toThrow(/pelaku belum diisi/);

    expect(await ds.getRepository(TenantEntity).countBy({ code: 'TANPA' })).toBe(0);
  });

  it('tidak pernah menyimpan hash kata sandi di audit', async () => {
    const hash = await hashPassword('sandi-pertama-uji');
    const user = await withActor(ds, ACTOR, (m) =>
      m.getRepository(UserEntity).save({
        username: 'audit.uji',
        displayName: 'Audit Uji',
        passwordHash: hash,
        role: 'helpdesk',
      }),
    );
    const newHash = await hashPassword('sandi-kedua-uji');
    await withActor(ds, ACTOR, (m) =>
      m.getRepository(UserEntity).update(user.id, { passwordHash: newHash }),
    );

    const rows = await auditOf('users', user.id);

    expect(rows[0]?.data).toMatchObject({ password_hash: '[disamarkan]' });
    expect(rows[1]?.data).toMatchObject({ password_hash: 'diubah' });
    const everything = JSON.stringify(rows);
    expect(everything).not.toContain(hash);
    expect(everything).not.toContain(newHash);
  });

  it('audit log hanya bisa ditambah: ubah, hapus, dan kosongkan ditolak', async () => {
    const tenant = await withActor(ds, ACTOR, (m) =>
      m.getRepository(TenantEntity).save({ code: 'KEKAL', name: 'Bank Kekal' }),
    );
    const [row] = await auditOf('tenants', tenant.id);
    const repo = ds.getRepository(AuditEntryEntity);

    await expect(repo.update(row!.id, { actor: 'pemalsu' })).rejects.toThrow(/hanya boleh ditambah/);
    await expect(repo.delete(row!.id)).rejects.toThrow(/hanya boleh ditambah/);
    await expect(ds.query('TRUNCATE audit_log')).rejects.toThrow(/hanya boleh ditambah/);
    expect(await repo.findOneByOrFail({ id: row!.id })).toMatchObject({ actor: 'pengguna:penguji' });
  });

  it('mengosongkan tabel juga butuh pelaku dan ikut tercatat', async () => {
    await expect(ds.query('TRUNCATE user_tenants')).rejects.toThrow(/pelaku belum diisi/);

    await withActor(ds, ACTOR, (m) => m.query('TRUNCATE user_tenants'));

    const truncates = await ds.getRepository(AuditEntryEntity).findBy({
      tableName: 'user_tenants',
      action: 'truncate',
      actor: 'pengguna:penguji',
    });
    expect(truncates.length).toBeGreaterThanOrEqual(1);
  });

  it('setiap tabel entity punya trigger audit, kecuali yang dikecualikan dengan alasan', async () => {
    const tables = ds.entityMetadatas.map((m) => m.tableName);
    for (const excluded of Object.keys(AUDIT_EXCLUDED_TABLES)) {
      expect(tables, `pengecualian usang: ${excluded}`).toContain(excluded);
    }

    const audited = tables.filter((t) => !(t in AUDIT_EXCLUDED_TABLES));
    const rows: Array<{ tgname: string }> = await ds.query(
      `SELECT t.tgname FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
        WHERE c.relname = ANY ($1) AND NOT t.tgisinternal AND t.tgenabled <> 'D'`,
      [audited],
    );
    const triggers = new Set(rows.map((r) => r.tgname));
    const missing = audited.flatMap((t) =>
      [`${t}_audit`, `${t}_audit_truncate`].filter((name) => !triggers.has(name)),
    );
    expect(missing, 'tabel tanpa trigger audit').toEqual([]);
  });
});

describe('audit peristiwa login', () => {
  let app: INestApplication;
  let ds: DataSource;

  beforeAll(async () => {
    app = await createTestApp();
    ds = app.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetData(ds);
  });

  const events = async (action: string): Promise<AuditEntry[]> =>
    ds.getRepository(AuditEntryEntity).find({ where: { action }, order: { occurredAt: 'DESC' } });

  it('mencatat login, logout, dan login yang ditolak beserta asalnya', async () => {
    const user = await createUser(ds, { username: 'l1.audit' });
    const http = () => request(app.getHttpServer());

    await http()
      .post('/api/auth/login')
      .set('User-Agent', 'peramban-uji')
      .send({ username: 'ketikan-rahasia', password: 'salah' })
      .expect(401);
    const res = await http()
      .post('/api/auth/login')
      .set('User-Agent', 'peramban-uji')
      .send({ username: 'l1.audit', password: TEST_PASSWORD })
      .expect(200);
    await http()
      .post('/api/auth/logout')
      .set('Cookie', sessionCookieFrom(res.headers['set-cookie']))
      .set('User-Agent', 'peramban-uji')
      .expect(204);

    const [rejected] = await events('auth.login_ditolak');
    expect(rejected).toMatchObject({ actor: 'anonim', actorUserId: null, userAgent: 'peramban-uji' });
    expect(rejected?.ip).toBeTruthy();
    expect(JSON.stringify(rejected)).not.toContain('ketikan-rahasia');

    const [login] = await events('auth.login');
    expect(login).toMatchObject({
      actor: 'pengguna:l1.audit',
      actorUserId: user.id,
      userAgent: 'peramban-uji',
    });
    const [logout] = await events('auth.logout');
    expect(logout).toMatchObject({ actor: 'pengguna:l1.audit', actorUserId: user.id });
  });
});
