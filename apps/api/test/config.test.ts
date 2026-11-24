import { describe, expect, it } from 'vitest';
import { DEFAULT_LOGIN_LIMIT, loadConfig } from '../src/config.js';

describe('loadConfig', () => {
  const valid = {
    TYIO_ENV: 'staging',
    DATABASE_URL: 'postgres://pengguna:sandi-rahasia@db:5432/tyio',
  };

  it('membaca nilai yang sah dan memakai bawaan untuk yang kosong', () => {
    expect(loadConfig({ ...valid, WEB_DIST_DIR: '/app/public' })).toEqual({
      env: 'staging',
      port: 3000,
      databaseUrl: valid.DATABASE_URL,
      webDistDir: '/app/public',
      trustProxy: undefined,
      // K28: 30 menit idle, paling lama 12 jam.
      session: { idleMinutes: 30, maxHours: 12, cookieSecure: true },
      loginLimit: DEFAULT_LOGIN_LIMIT,
      // Detak aliran pembaruan langsung (2.2) tiap 15 detik.
      stream: { heartbeatMs: 15_000 },
    });
  });

  it('mewajibkan TYIO_ENV, tanpa nilai bawaan', () => {
    // Tanpa bawaan agar produksi tidak pernah diam-diam dianggap lingkungan dev.
    expect(() => loadConfig({ DATABASE_URL: valid.DATABASE_URL })).toThrow(/TYIO_ENV/);
    expect(() => loadConfig({ ...valid, TYIO_ENV: 'prod' })).toThrow(/TYIO_ENV/);
  });

  it('mewajibkan DATABASE_URL PostgreSQL yang sah', () => {
    expect(() => loadConfig({ TYIO_ENV: 'staging' })).toThrow(/DATABASE_URL/);
    expect(() => loadConfig({ ...valid, DATABASE_URL: 'bukan-url' })).toThrow(/DATABASE_URL/);
    expect(() => loadConfig({ ...valid, DATABASE_URL: 'mysql://a:b@db/tyio' })).toThrow(
      /DATABASE_URL/,
    );
  });

  it('tidak pernah mencetak isi DATABASE_URL dalam pesan galat', () => {
    const rusak = 'postgres://pengguna:sandi-rahasia@db:bukan-port/tyio';

    expect(() => loadConfig({ ...valid, DATABASE_URL: rusak })).toThrow(/DATABASE_URL/);
    expect(() => loadConfig({ ...valid, DATABASE_URL: rusak })).not.toThrow(/sandi-rahasia/);
  });

  it('menolak PORT yang bukan nomor port', () => {
    expect(() => loadConfig({ ...valid, PORT: 'delapan' })).toThrow(/PORT/);
    expect(() => loadConfig({ ...valid, PORT: '70000' })).toThrow(/PORT/);
  });

  it('membaca lama sesi dan menolak nilai yang tidak masuk akal', () => {
    const config = loadConfig({ ...valid, SESSION_IDLE_MINUTES: '45', SESSION_MAX_HOURS: '8' });
    expect(config.session).toMatchObject({ idleMinutes: 45, maxHours: 8 });

    expect(() => loadConfig({ ...valid, SESSION_IDLE_MINUTES: '0' })).toThrow(/SESSION_IDLE_MINUTES/);
    expect(() => loadConfig({ ...valid, SESSION_IDLE_MINUTES: 'lama' })).toThrow(
      /SESSION_IDLE_MINUTES/,
    );
    expect(() => loadConfig({ ...valid, SESSION_MAX_HOURS: '1000' })).toThrow(/SESSION_MAX_HOURS/);
    expect(() =>
      loadConfig({ ...valid, SESSION_IDLE_MINUTES: '120', SESSION_MAX_HOURS: '1' }),
    ).toThrow(/tidak boleh lebih lama/);
  });

  it('mewajibkan cookie Secure kecuali di development dan test, dan bisa diatur', () => {
    expect(loadConfig({ ...valid, TYIO_ENV: 'production' }).session.cookieSecure).toBe(true);
    expect(loadConfig({ ...valid, TYIO_ENV: 'development' }).session.cookieSecure).toBe(false);
    expect(loadConfig({ ...valid, TYIO_ENV: 'test' }).session.cookieSecure).toBe(false);
    expect(loadConfig({ ...valid, SESSION_COOKIE_SECURE: 'false' }).session.cookieSecure).toBe(false);
    expect(() => loadConfig({ ...valid, SESSION_COOKIE_SECURE: 'ya' })).toThrow(
      /SESSION_COOKIE_SECURE/,
    );
  });

  it('meneruskan TRUST_PROXY ke Express: angka sebagai jumlah proxy, selain itu apa adanya', () => {
    expect(loadConfig({ ...valid, TRUST_PROXY: '1' }).trustProxy).toBe(1);
    expect(loadConfig({ ...valid, TRUST_PROXY: 'loopback' }).trustProxy).toBe('loopback');
    expect(loadConfig({ ...valid, TRUST_PROXY: ' ' }).trustProxy).toBeUndefined();
  });
});
