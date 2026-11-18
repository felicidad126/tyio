import { createHash } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { SessionResponse } from '@tyio/shared';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SessionEntity } from '../src/modules/auth/session.entity.js';
import { UserEntity } from '../src/modules/users/user.entity.js';
import { createTestApp } from './create-test-app.js';
import { resetData } from './db.js';
import { asTester, createTenant, createUser, sessionCookieFrom, TEST_PASSWORD } from './fixtures.js';
import { testConfig } from './test-config.js';

const WRONG = { statusCode: 401, message: 'Nama pengguna atau kata sandi tidak cocok.' };

describe('login, sesi, dan logout', () => {
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

  const http = () => request(app.getHttpServer());
  const login = (username: string, password = TEST_PASSWORD) =>
    http().post('/api/auth/login').send({ username, password });

  it('masuk dengan benar: mengembalikan pengguna dan memasang cookie sesi httpOnly', async () => {
    await createUser(ds, { username: 'l1.uji', role: 'helpdesk' });

    const res = await login('l1.uji').expect(200);

    expect((res.body as SessionResponse).user).toMatchObject({
      username: 'l1.uji',
      displayName: 'Pengguna l1.uji',
      role: 'helpdesk',
      tenantScope: { all: true },
    });
    const cookie = [res.headers['set-cookie']].flat().join(';');
    expect(cookie).toMatch(/^tyio_sid=[\w-]{43};/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Path=\//);
    expect(cookie).not.toMatch(/Secure/i); // konfigurasi uji: tanpa TLS
  });

  it('nama pengguna tidak membedakan huruf besar dan mengabaikan spasi di tepi', async () => {
    await createUser(ds, { username: 'l2.uji', role: 'helpdesk' });

    await login('  L2.Uji ').expect(200);
  });

  it('GET /api/auth/me mengembalikan pengguna sesi; tanpa sesi 401', async () => {
    await createUser(ds, { username: 'l1.uji' });
    const cookie = sessionCookieFrom((await login('l1.uji')).headers['set-cookie']);

    const me = await http().get('/api/auth/me').set('Cookie', cookie).expect(200);
    expect((me.body as SessionResponse).user.username).toBe('l1.uji');

    const anon = await http().get('/api/auth/me').expect(401);
    expect(anon.body.message).toMatch(/masuk/i);
  });

  it('cakupan tenant: pengguna terbatas hanya membawa tenant miliknya', async () => {
    const merapi = await createTenant(ds, 'MRS', 'Bank Merapi Sejahtera');
    await createTenant(ds, 'BCN');
    await createUser(ds, { username: 'helpdesk.merapi', allTenants: false, tenants: [merapi] });

    const res = await login('helpdesk.merapi').expect(200);

    expect((res.body as SessionResponse).user.tenantScope).toEqual({
      all: false,
      tenants: [{ id: merapi.id, code: 'MRS', name: 'Bank Merapi Sejahtera' }],
    });
  });

  it('kata sandi salah, pengguna tak dikenal, dan pengguna nonaktif dijawab sama persis', async () => {
    await createUser(ds, { username: 'l1.uji' });
    await createUser(ds, { username: 'l1.nonaktif', active: false });

    const wrong = await login('l1.uji', 'bukan-sandinya').expect(401);
    const unknown = await login('tidak.ada').expect(401);
    const inactive = await login('l1.nonaktif').expect(401);

    expect(wrong.body).toEqual(WRONG);
    expect(unknown.body).toEqual(WRONG);
    expect(inactive.body).toEqual(WRONG);
    expect(wrong.headers['set-cookie']).toBeUndefined();
  });

  it('pengguna tak dikenal dijawab selambat kata sandi salah (tidak membocorkan nama pengguna)', async () => {
    await createUser(ds, { username: 'l1.uji' });
    const median = async (username: string) => {
      const times: number[] = [];
      for (let i = 0; i < 3; i++) {
        const start = performance.now();
        await login(username, 'bukan-sandinya').expect(401);
        times.push(performance.now() - start);
      }
      return times.sort((a, b) => a - b)[1] ?? 0;
    };

    const known = await median('l1.uji');
    const unknown = await median('tidak.ada');

    // Tanpa verifikasi hash palsu, jalur pengguna tak dikenal jauh lebih cepat (tanpa argon2).
    expect(unknown).toBeGreaterThan(known * 0.5);
  });

  it('menolak isian yang tidak lengkap dengan 400', async () => {
    await http().post('/api/auth/login').send({ username: 'l1.uji' }).expect(400);
    await http().post('/api/auth/login').send({ username: '', password: 'x' }).expect(400);
    await http().post('/api/auth/login').send('bukan json').expect(400);
  });

  it('menyimpan hanya hash token di database, bukan token aslinya', async () => {
    await createUser(ds, { username: 'l1.uji' });
    const cookie = sessionCookieFrom((await login('l1.uji')).headers['set-cookie']);
    const token = cookie.split('=')[1] ?? '';

    const sessions = await ds.getRepository(SessionEntity).find();

    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.tokenHash.equals(createHash('sha256').update(token).digest())).toBe(true);
    expect(sessions[0]?.tokenHash.toString('utf8')).not.toContain(token);
  });

  it('logout mengakhiri sesi dan menghapus cookie; aman dipanggil tanpa sesi', async () => {
    await createUser(ds, { username: 'l1.uji' });
    const cookie = sessionCookieFrom((await login('l1.uji')).headers['set-cookie']);

    const out = await http().post('/api/auth/logout').set('Cookie', cookie).expect(204);

    expect([out.headers['set-cookie']].flat().join(';')).toMatch(/tyio_sid=;/);
    await http().get('/api/auth/me').set('Cookie', cookie).expect(401);
    expect(await ds.getRepository(SessionEntity).count()).toBe(0);
    await http().post('/api/auth/logout').expect(204);
  });

  it('sesi yang kedaluwarsa ditolak dan dihapus', async () => {
    await createUser(ds, { username: 'l1.uji' });
    const cookie = sessionCookieFrom((await login('l1.uji')).headers['set-cookie']);
    await ds.query("UPDATE sessions SET expires_at = now() - interval '1 minute'");

    await http().get('/api/auth/me').set('Cookie', cookie).expect(401);

    expect(await ds.getRepository(SessionEntity).count()).toBe(0);
  });

  it('sesi diperpanjang saat dipakai, tapi tidak melewati batas absolut', async () => {
    await createUser(ds, { username: 'l1.uji' });
    const cookie = sessionCookieFrom((await login('l1.uji')).headers['set-cookie']);
    await ds.query(`UPDATE sessions SET last_seen_at = now() - interval '10 minutes',
      expires_at = now() + interval '1 minute', absolute_expires_at = now() + interval '2 hours'`);

    await http().get('/api/auth/me').set('Cookie', cookie).expect(200);

    const [row] = await ds.query(
      'SELECT expires_at = absolute_expires_at AS capped, last_seen_at > now() - interval \'5 seconds\' AS touched FROM sessions',
    );
    expect(row).toEqual({ capped: true, touched: true });
  });

  it('pengguna yang dinonaktifkan kehilangan sesinya', async () => {
    const user = await createUser(ds, { username: 'l1.uji' });
    const cookie = sessionCookieFrom((await login('l1.uji')).headers['set-cookie']);
    await asTester(ds, (m) => m.getRepository(UserEntity).update(user.id, { active: false }));

    await http().get('/api/auth/me').set('Cookie', cookie).expect(401);
  });
});

describe('cookie sesi di lingkungan dengan TLS', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp(testConfig({ sessionCookieSecure: true }));
    await resetData(app.get(DataSource));
    await createUser(app.get(DataSource), { username: 'l1.uji' });
  });

  afterEach(async () => {
    await resetData(app.get(DataSource));
  });

  afterAll(async () => {
    await app.close();
  });

  it('memakai cookie Secure dengan awalan __Host-', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'l1.uji', password: TEST_PASSWORD })
      .expect(200);

    const cookie = [res.headers['set-cookie']].flat().join(';');
    expect(cookie).toMatch(/^__Host-tyio_sid=/);
    expect(cookie).toMatch(/Secure/i);
  });
});
