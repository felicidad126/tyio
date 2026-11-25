import type { NestExpressApplication } from '@nestjs/platform-express';
import type { SessionUser } from '@npr/shared';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_LOGIN_LIMIT } from '../src/config.js';
import { INVALID_LOGIN_MESSAGE } from '../src/modules/auth/auth.controller.js';
import { SESSION_REQUIRED_MESSAGE } from '../src/modules/auth/auth.guard.js';
import { SESSION_COOKIE } from '../src/modules/auth/cookies.js';
import type { NewUser } from '../src/modules/users/user-accounts.js';
import { createTestApp } from './create-test-app.js';
import { insertTenant, insertUser, operatorQuery, TEST_PASSWORD, uniqueEmail } from './fixtures.js';
import { testConfig } from './test-config.js';

// Uji lewat HTTP terhadap AppModule utuh dan PostgreSQL asli (T11).
// Setiap uji memakai email sendiri karena berkas uji berjalan paralel ke satu database.

type Agent = ReturnType<typeof request.agent>;

describe('login, sesi, dan logout', () => {
  let app: NestExpressApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  function createUser(overrides: Partial<NewUser> = {}): Promise<{ id: string; email: string }> {
    return insertUser(dataSource, overrides);
  }

  function login(client: Agent, email: string, password = TEST_PASSWORD) {
    return client.post('/api/auth/login').send({ email, password });
  }

  function agent(): Agent {
    return request.agent(app.getHttpServer());
  }

  function sessionCookie(res: request.Response): string {
    const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
    const cookie = cookies.find((value) => value.startsWith(`${SESSION_COOKIE}=`));
    if (!cookie) throw new Error('Cookie sesi tidak ada di respons.');
    return cookie;
  }

  describe('POST /api/auth/login', () => {
    it('membuat sesi dengan cookie HttpOnly, SameSite=Strict, Path=/api', async () => {
      const { email } = await createUser({ name: 'Dewi Uji', role: 'l2' });

      const res = await login(agent(), email).expect(200);

      const cookie = sessionCookie(res);
      expect(cookie).toMatch(new RegExp(`^${SESSION_COOKIE}=[A-Za-z0-9_-]{43};`));
      expect(cookie).toMatch(/; HttpOnly/i);
      expect(cookie).toMatch(/; SameSite=Strict/i);
      expect(cookie).toMatch(/; Path=\/api(;|$)/);
      expect(cookie).toMatch(/; Expires=/);
      expect(cookie).not.toMatch(/; Secure/i); // dimatikan di konfigurasi uji
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.body).toMatchObject({ email, name: 'Dewi Uji', role: 'l2', allTenants: true });
      expect(res.body).not.toHaveProperty('passwordHash');
    });

    it('cookie sesi berakhir paling lama 12 jam setelah login (K28)', async () => {
      const { email } = await createUser();
      const before = Date.now();

      const res = await login(agent(), email).expect(200);

      const expires = /; Expires=([^;]+)/i.exec(sessionCookie(res))?.[1];
      const lifetimeHours = (Date.parse(expires ?? '') - before) / 3_600_000;
      expect(lifetimeHours).toBeGreaterThan(11.9);
      expect(lifetimeHours).toBeLessThanOrEqual(12.01);
    });

    it('menerima email dengan huruf besar dan spasi di ujung', async () => {
      const { email } = await createUser();

      await login(agent(), `  ${email.toUpperCase()} `).expect(200);
    });

    it('memberi jawaban yang sama untuk kata sandi salah, email tak terdaftar, dan akun nonaktif', async () => {
      const { email } = await createUser();
      const inactive = await createUser();
      await operatorQuery(dataSource, 'UPDATE users SET active = false WHERE id = $1', [inactive.id]);

      const wrongPassword = await login(agent(), email, 'kata-sandi-salah').expect(401);
      const unknown = await login(agent(), uniqueEmail('tidak-ada')).expect(401);
      const disabled = await login(agent(), inactive.email).expect(401);

      for (const res of [wrongPassword, unknown, disabled]) {
        expect(res.body.message).toBe(INVALID_LOGIN_MESSAGE);
        expect(res.headers['set-cookie']).toBeUndefined();
      }
    });

    it('menolak isian kosong atau bukan teks dengan 400', async () => {
      const server = request(app.getHttpServer());

      for (const body of [{}, { email: 'a@b.example' }, { email: '', password: 'x' }, { email: 1, password: 'x' }]) {
        const res = await server.post('/api/auth/login').send(body).expect(400);
        expect(res.body.message).toBe('Email dan kata sandi wajib diisi.');
      }
      await server
        .post('/api/auth/login')
        .send({ email: uniqueEmail(), password: 'x'.repeat(1025) })
        .expect(400);
    });

    it('hanya menerima JSON (415), sehingga form lintas situs tidak bisa dipakai', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .type('form')
        .send({ email: uniqueEmail(), password: TEST_PASSWORD })
        .expect(415);
    });

    it('menolak permintaan dari origin lain (403)', async () => {
      const { email } = await createUser();
      const server = request(app.getHttpServer());

      await server
        .post('/api/auth/login')
        .set('Origin', 'https://penyerang.example')
        .send({ email, password: TEST_PASSWORD })
        .expect(403);
      await server
        .post('/api/auth/login')
        .set('Sec-Fetch-Site', 'cross-site')
        .send({ email, password: TEST_PASSWORD })
        .expect(403);
    });

    it('menerima permintaan dari origin yang sama', async () => {
      const { email } = await createUser();
      const server = request(app.getHttpServer());

      await server
        .post('/api/auth/login')
        .set('Host', 'portal.example:8443')
        .set('Origin', 'https://portal.example:8443')
        .set('Sec-Fetch-Site', 'same-origin')
        .send({ email, password: TEST_PASSWORD })
        .expect(200);
      // Port berbeda berarti origin berbeda.
      await server
        .post('/api/auth/login')
        .set('Host', 'portal.example:8443')
        .set('Origin', 'https://portal.example')
        .send({ email, password: TEST_PASSWORD })
        .expect(403);
    });

    it('mencabut sesi lama di peramban yang sama saat login ulang', async () => {
      const { email } = await createUser();
      const browser = agent();
      const first = sessionCookie(await login(browser, email).expect(200)).split(';')[0];

      await login(browser, email).expect(200);

      await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', first ?? '').expect(401);
      await browser.get('/api/auth/me').expect(200);
    });
  });

  describe('GET /api/auth/me', () => {
    it('mengembalikan pengguna dan customer yang boleh dilihat', async () => {
      const nusa = await insertTenant(dataSource, 'Bank Nusa Uji');
      const { email } = await createUser({ name: 'Rudi Uji', tenantCodes: [nusa.code] });
      const browser = agent();
      await login(browser, email).expect(200);

      const res = await browser.get('/api/auth/me').expect(200);

      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.body).toEqual({
        id: expect.any(String),
        email,
        name: 'Rudi Uji',
        role: 'l1',
        allTenants: false,
        tenants: [{ id: nusa.id, code: nusa.code, name: nusa.name }],
      } satisfies SessionUser);
    });

    it('menjawab 401 tanpa cookie atau dengan token karangan', async () => {
      const server = request(app.getHttpServer());

      const none = await server.get('/api/auth/me').expect(401);
      expect(none.body.message).toBe(SESSION_REQUIRED_MESSAGE);
      expect(none.headers['set-cookie']).toBeUndefined();

      const forged = await server
        .get('/api/auth/me')
        .set('Cookie', `${SESSION_COOKIE}=${'A'.repeat(43)}`)
        .expect(401);
      // Cookie basi dihapus dari peramban.
      expect(sessionCookie(forged)).toMatch(/Expires=Thu, 01 Jan 1970/);
    });

    it('menolak sesi yang menganggur lebih dari 30 menit (K28)', async () => {
      const { id, email } = await createUser();
      const browser = agent();
      await login(browser, email).expect(200);

      await dataSource.query(
        "UPDATE sessions SET last_seen_at = now() - interval '29 minutes' WHERE user_id = $1",
        [id],
      );
      await browser.get('/api/auth/me').expect(200); // memperpanjang batas idle

      await dataSource.query(
        "UPDATE sessions SET last_seen_at = now() - interval '31 minutes' WHERE user_id = $1",
        [id],
      );
      await browser.get('/api/auth/me').expect(401);
    });

    it('menolak sesi yang sudah lewat batas mutlak 12 jam, walau terus dipakai (K28)', async () => {
      const { id, email } = await createUser();
      const browser = agent();
      await login(browser, email).expect(200);

      await dataSource.query(
        "UPDATE sessions SET expires_at = now() - interval '1 second' WHERE user_id = $1",
        [id],
      );

      await browser.get('/api/auth/me').expect(401);
    });

    it('menghentikan sesi pengguna yang dinonaktifkan', async () => {
      const { id, email } = await createUser();
      const browser = agent();
      await login(browser, email).expect(200);

      await operatorQuery(dataSource, 'UPDATE users SET active = false WHERE id = $1', [id]);

      await browser.get('/api/auth/me').expect(401);
      const rows: unknown[] = await dataSource.query('SELECT 1 FROM sessions WHERE user_id = $1', [id]);
      expect(rows).toEqual([]);
    });

    it('hanya menyimpan hash token di database', async () => {
      const { id, email } = await createUser();
      const res = await login(agent(), email).expect(200);
      const token = sessionCookie(res).split(';')[0]?.split('=')[1] ?? '';

      const rows: Array<{ token_hash: Buffer }> = await dataSource.query(
        'SELECT token_hash FROM sessions WHERE user_id = $1',
        [id],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]?.token_hash.toString('base64url')).not.toBe(token);
      expect(rows[0]?.token_hash).toHaveLength(32);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('mencabut sesi dan menghapus cookie', async () => {
      const { email } = await createUser();
      const browser = agent();
      const cookie = sessionCookie(await login(browser, email).expect(200)).split(';')[0] ?? '';

      const res = await browser.post('/api/auth/logout').expect(204);

      expect(sessionCookie(res)).toMatch(/Expires=Thu, 01 Jan 1970/);
      expect(sessionCookie(res)).toMatch(/; Path=\/api(;|$)/);
      // Token lama tidak bisa dipakai lagi, walau penyerang masih menyimpannya.
      await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', cookie).expect(401);
    });

    it('tetap 204 tanpa sesi', async () => {
      await request(app.getHttpServer()).post('/api/auth/logout').expect(204);
    });
  });

  describe('endpoint lain', () => {
    it('health tetap publik', async () => {
      await request(app.getHttpServer()).get('/api/health').expect(200);
    });
  });
});

describe('pembatasan percobaan login yang gagal', () => {
  let app: NestExpressApplication;
  let dataSource: DataSource;
  const limit = DEFAULT_LOGIN_LIMIT; // 5 per email, jendela 15 menit

  beforeAll(async () => {
    // Batas per IP kecil agar bisa diuji; IP dibaca dari X-Forwarded-For (trust proxy),
    // dan setiap uji memakai IP dokumentasi (RFC 5737) sendiri.
    app = await createTestApp(
      testConfig({ trustProxy: 1, loginLimit: { ...limit, maxFailuresPerIp: 8 } }),
    );
    dataSource = app.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  let ipCounter = 0;
  function uniqueIp(): string {
    ipCounter += 1;
    const random = Math.floor(Math.random() * 200);
    return `203.0.${random}.${ipCounter}`;
  }

  async function createUser(): Promise<string> {
    return (await insertUser(dataSource, { email: uniqueEmail('kunci'), name: 'Kunci Uji' })).email;
  }

  function attempt(email: string, password: string, ip = uniqueIp()) {
    return request(app.getHttpServer())
      .post('/api/auth/login')
      .set('X-Forwarded-For', ip)
      .send({ email, password });
  }

  it('mengunci email setelah 5 kali gagal, juga untuk kata sandi yang benar', async () => {
    const email = await createUser();
    for (let i = 0; i < limit.maxFailuresPerAccount; i++) {
      await attempt(email, 'salah-terus-menerus').expect(401);
    }

    const locked = await attempt(email, TEST_PASSWORD).expect(429);

    const retryAfter = Number(locked.headers['retry-after']);
    expect(retryAfter).toBeGreaterThan(14 * 60);
    expect(retryAfter).toBeLessThanOrEqual(15 * 60);
    expect(locked.body.message).toBe(
      'Terlalu banyak percobaan masuk yang gagal. Coba lagi dalam 15 menit.',
    );
    expect(locked.headers['set-cookie']).toBeUndefined();
  });

  it('mengunci email yang tidak terdaftar dengan cara yang sama', async () => {
    const email = uniqueEmail('tidak-ada');
    for (let i = 0; i < limit.maxFailuresPerAccount; i++) {
      await attempt(email, 'salah-terus-menerus').expect(401);
    }

    await attempt(email, 'salah-terus-menerus').expect(429);
  });

  it('membuka kunci setelah kegagalan keluar dari jendela 15 menit', async () => {
    const email = await createUser();
    for (let i = 0; i < limit.maxFailuresPerAccount; i++) {
      await attempt(email, 'salah-terus-menerus').expect(401);
    }
    await attempt(email, TEST_PASSWORD).expect(429);

    await dataSource.query(
      "UPDATE login_attempts SET attempted_at = attempted_at - interval '16 minutes' WHERE email = $1",
      [email],
    );

    await attempt(email, TEST_PASSWORD).expect(200);
  });

  it('login berhasil mengatur ulang hitungan kegagalan email', async () => {
    const email = await createUser();
    for (let i = 0; i < limit.maxFailuresPerAccount - 1; i++) {
      await attempt(email, 'salah-terus-menerus').expect(401);
    }
    await attempt(email, TEST_PASSWORD).expect(200);

    for (let i = 0; i < limit.maxFailuresPerAccount - 1; i++) {
      await attempt(email, 'salah-terus-menerus').expect(401);
    }
    await attempt(email, TEST_PASSWORD).expect(200);
  });

  it('mengunci IP yang mencoba banyak email berbeda', async () => {
    const ip = uniqueIp();
    for (let i = 0; i < 8; i++) {
      await attempt(uniqueEmail('sebar'), 'salah-terus-menerus', ip).expect(401);
    }
    const email = await createUser();

    await attempt(email, TEST_PASSWORD, ip).expect(429);
    // IP lain tidak terpengaruh.
    await attempt(email, TEST_PASSWORD).expect(200);
  });

  it('tanpa trust proxy, X-Forwarded-For diabaikan sehingga tidak bisa dipakai menghindari kunci', async () => {
    const plain = await createTestApp(
      testConfig({ loginLimit: { ...limit, maxFailuresPerIp: 10_000 } }),
    );
    try {
      const email = uniqueEmail('palsu');
      for (let i = 0; i < limit.maxFailuresPerAccount; i++) {
        await request(plain.getHttpServer())
          .post('/api/auth/login')
          .set('X-Forwarded-For', uniqueIp())
          .send({ email, password: 'salah-terus-menerus' })
          .expect(401);
      }
      const rows: Array<{ ip: string }> = await plain
        .get(DataSource)
        .query('SELECT DISTINCT ip FROM login_attempts WHERE email = $1', [email]);
      expect(rows.map((row) => row.ip)).toEqual([expect.stringMatching(/127\.0\.0\.1|::1/)]);
    } finally {
      await plain.close();
    }
  });
});
