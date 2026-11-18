import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';

describe('loadConfig', () => {
  const valid = {
    TYIO_ENV: 'staging',
    DATABASE_URL: 'postgres://pengguna:sandi-rahasia@db:5432/tyio',
    ATTACHMENTS_DIR: '/app/data/lampiran',
  };

  it('membaca nilai yang sah dan memakai nilai bawaan yang aman', () => {
    expect(loadConfig({ ...valid, WEB_DIST_DIR: '/app/public' })).toEqual({
      env: 'staging',
      port: 3000,
      databaseUrl: valid.DATABASE_URL,
      webDistDir: '/app/public',
      sessionCookieSecure: true,
      trustProxyHops: 0,
      attachmentsDir: '/app/data/lampiran',
      streamHeartbeatMs: 25_000,
      streamMaxMs: 300_000,
      mapTileUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      mapTileAttribution: '© OpenStreetMap contributors',
    });
  });

  it('sumber gambar peta: URL https dengan {z}/{x}/{y}; bisa diganti', () => {
    expect(
      loadConfig({ ...valid, MAP_TILE_URL: 'https://peta.contoh.id/{z}/{x}/{y}.png', MAP_TILE_ATTRIBUTION: '© Contoh' }),
    ).toMatchObject({ mapTileUrl: 'https://peta.contoh.id/{z}/{x}/{y}.png', mapTileAttribution: '© Contoh' });
    expect(() => loadConfig({ ...valid, MAP_TILE_URL: 'http://peta.contoh.id/{z}/{x}/{y}.png' })).toThrow(/MAP_TILE_URL/);
    expect(() => loadConfig({ ...valid, MAP_TILE_URL: 'https://peta.contoh.id/peta.png' })).toThrow(/MAP_TILE_URL/);
  });

  it('detak dan umur koneksi langsung: di bawah batas diam proxy, bisa diatur', () => {
    expect(loadConfig({ ...valid, STREAM_HEARTBEAT_MS: '10000', STREAM_MAX_MS: '60000' })).toMatchObject({
      streamHeartbeatMs: 10_000,
      streamMaxMs: 60_000,
    });
    expect(() => loadConfig({ ...valid, STREAM_HEARTBEAT_MS: '60000' })).toThrow(/STREAM_HEARTBEAT_MS/);
    expect(() => loadConfig({ ...valid, STREAM_MAX_MS: 'lama' })).toThrow(/STREAM_MAX_MS/);
  });

  it('cookie sesi Secure aktif bawaan di staging/produksi, mati di dev/uji, bisa diatur', () => {
    expect(loadConfig({ ...valid, TYIO_ENV: 'production' }).sessionCookieSecure).toBe(true);
    expect(loadConfig({ ...valid, TYIO_ENV: 'development' }).sessionCookieSecure).toBe(false);
    expect(loadConfig({ ...valid, SESSION_COOKIE_SECURE: 'false' }).sessionCookieSecure).toBe(false);
    expect(() => loadConfig({ ...valid, SESSION_COOKIE_SECURE: 'ya' })).toThrow(
      /SESSION_COOKIE_SECURE/,
    );
  });

  it('TRUST_PROXY_HOPS menerima 0–5 saja', () => {
    expect(loadConfig({ ...valid, TRUST_PROXY_HOPS: '1' }).trustProxyHops).toBe(1);
    expect(() => loadConfig({ ...valid, TRUST_PROXY_HOPS: 'true' })).toThrow(/TRUST_PROXY_HOPS/);
    expect(() => loadConfig({ ...valid, TRUST_PROXY_HOPS: '9' })).toThrow(/TRUST_PROXY_HOPS/);
  });

  it('folder lampiran wajib di staging/produksi; dev dan uji memakai folder bawaan', () => {
    const withoutDir: Record<string, string> = { ...valid };
    delete withoutDir.ATTACHMENTS_DIR;
    expect(() => loadConfig(withoutDir)).toThrow(/ATTACHMENTS_DIR/);
    expect(() => loadConfig({ ...withoutDir, TYIO_ENV: 'production' })).toThrow(/ATTACHMENTS_DIR/);
    expect(loadConfig({ ...withoutDir, TYIO_ENV: 'development' }).attachmentsDir).toBe('data/lampiran');
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
