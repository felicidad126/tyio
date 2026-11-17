import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AuditEntryEntity } from '../src/common/audit/audit-entry.entity.js';
import { LoginFailureEntity } from '../src/modules/auth/login-failure.entity.js';
import { createTestApp } from './create-test-app.js';
import { resetData } from './db.js';
import { createUser, TEST_PASSWORD } from './fixtures.js';

// Batas: 5 gagal per nama pengguna dan 20 gagal per alamat IP dalam 15 menit.
describe('pembatasan percobaan login', () => {
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
    await createUser(ds, { username: 'l1.uji' });
  });

  const login = (username: string, password: string) =>
    request(app.getHttpServer()).post('/api/auth/login').send({ username, password });

  async function fail(username: string, times: number): Promise<void> {
    for (let i = 0; i < times; i++) await login(username, 'salah').expect(401);
  }

  it('setelah 5 kali gagal, nama pengguna itu ditahan 15 menit walau sandinya benar', async () => {
    await fail('l1.uji', 5);

    const res = await login('l1.uji', TEST_PASSWORD).expect(429);

    const retryAfter = Number(res.headers['retry-after']);
    expect(retryAfter).toBeGreaterThan(14 * 60);
    expect(retryAfter).toBeLessThanOrEqual(15 * 60);
    expect(res.body.retryAfterSeconds).toBe(retryAfter);
    expect(res.body.message).toMatch(/Terlalu banyak percobaan masuk\. Coba lagi dalam 15 menit\./);
    const held = await ds
      .getRepository(AuditEntryEntity)
      .findOne({ where: { action: 'auth.login_ditahan' }, order: { occurredAt: 'DESC' } });
    expect(held).toMatchObject({ actor: 'anonim', data: { retryAfterSeconds: retryAfter } });
  });

  it('login yang berhasil mengosongkan hitungan gagal nama pengguna itu', async () => {
    await fail('l1.uji', 4);
    await login('l1.uji', TEST_PASSWORD).expect(200);

    await fail('l1.uji', 4);
    await login('l1.uji', TEST_PASSWORD).expect(200);
  });

  it('kegagalan yang lebih lama dari 15 menit tidak dihitung', async () => {
    await fail('l1.uji', 5);
    await ds.query("UPDATE login_failures SET attempted_at = now() - interval '16 minutes'");

    await login('l1.uji', TEST_PASSWORD).expect(200);
  });

  it('setelah 20 kali gagal dari satu IP, semua nama pengguna dari IP itu ditahan', async () => {
    for (let i = 0; i < 20; i++) await login(`tebakan.${i}`, 'salah').expect(401);

    await login('l1.uji', TEST_PASSWORD).expect(429);
  });

  it('nama pengguna yang diketik tidak tersimpan apa adanya', async () => {
    await login('ini-mungkin-kata-sandi', 'salah').expect(401);

    const [row] = await ds.getRepository(LoginFailureEntity).find();
    expect(row?.usernameHash.toString('utf8')).not.toContain('ini-mungkin-kata-sandi');
    expect(JSON.stringify(row)).not.toContain('ini-mungkin-kata-sandi');
  });
});
