export const TYIO_ENVS = ['development', 'test', 'staging', 'production'] as const;
export type TyioEnv = (typeof TYIO_ENVS)[number];

export interface AppConfig {
  env: TyioEnv;
  port: number;
  databaseUrl: string;
  /** Folder hasil build web yang dilayani di luar /api. Kosong = API saja (mis. saat uji). */
  webDistDir: string | undefined;
  /** Cookie sesi hanya dikirim lewat HTTPS. Bawaan: aktif di staging dan produksi. */
  sessionCookieSecure: boolean;
  /**
   * Jumlah reverse proxy tepercaya di depan aplikasi (untuk alamat IP klien yang benar).
   * 0 = tidak ada proxy; header X-Forwarded-For diabaikan.
   */
  trustProxyHops: number;
}

/**
 * Membaca dan memvalidasi konfigurasi dari variabel lingkungan.
 * Gagal cepat dengan daftar semua masalah; nilai rahasia tidak pernah ikut dicetak.
 */
export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const problems: string[] = [];

  const env = source.TYIO_ENV;
  if (!isTyioEnv(env)) {
    problems.push(`TYIO_ENV wajib diisi salah satu dari: ${TYIO_ENVS.join(', ')}`);
  }

  const databaseUrl = source.DATABASE_URL;
  if (!databaseUrl || !isPostgresUrl(databaseUrl)) {
    problems.push('DATABASE_URL wajib diisi dengan URL postgres:// yang sah');
  }

  const port = Number(source.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    problems.push('PORT harus bilangan bulat 1–65535');
  }

  const secureDefault = env === 'staging' || env === 'production';
  const sessionCookieSecure = parseBoolean(source.SESSION_COOKIE_SECURE, secureDefault);
  if (sessionCookieSecure === undefined) {
    problems.push('SESSION_COOKIE_SECURE harus true atau false');
  }

  const trustProxyHops = Number(source.TRUST_PROXY_HOPS ?? 0);
  if (!Number.isInteger(trustProxyHops) || trustProxyHops < 0 || trustProxyHops > 5) {
    problems.push('TRUST_PROXY_HOPS harus bilangan bulat 0–5');
  }

  if (problems.length > 0 || !isTyioEnv(env) || !databaseUrl || sessionCookieSecure === undefined) {
    throw new Error(`Konfigurasi tidak valid:\n- ${problems.join('\n- ')}`);
  }

  return {
    env,
    port,
    databaseUrl,
    webDistDir: source.WEB_DIST_DIR || undefined,
    sessionCookieSecure,
    trustProxyHops,
  };
}

function isTyioEnv(value: string | undefined): value is TyioEnv {
  return TYIO_ENVS.includes(value as TyioEnv);
}

function isPostgresUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'postgres:' || url.protocol === 'postgresql:';
  } catch {
    return false;
  }
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean | undefined {
  if (value === undefined || value === '') return fallback;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}

/** Token injeksi Nest untuk AppConfig. */
export const APP_CONFIG = 'APP_CONFIG';
