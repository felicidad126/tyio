import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';

describe('loadConfig', () => {
  const valid = {
    TYIO_ENV: 'staging',
    DATABASE_URL: 'postgres://pengguna:sandi-rahasia@db:5432/tyio',
  };

  it('membaca nilai yang sah dan memakai port 3000 bila PORT kosong', () => {
    expect(loadConfig({ ...valid, WEB_DIST_DIR: '/app/public' })).toEqual({
      env: 'staging',
      port: 3000,
      databaseUrl: valid.DATABASE_URL,
      webDistDir: '/app/public',
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
});
