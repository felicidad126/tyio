export const NPR_ENVS = ['development', 'test', 'staging', 'production'] as const;
export type NprEnv = (typeof NPR_ENVS)[number];

export interface SessionConfig {
  /** Sesi berakhir bila tidak dipakai selama ini (K28: 30 menit). */
  idleMinutes: number;
  /** Sesi berakhir paling lambat selama ini sejak login, walau terus dipakai (K28: 12 jam). */
  maxHours: number;
  /** Cookie sesi hanya dikirim lewat HTTPS. Bawaan aktif kecuali di development dan test. */
  cookieSecure: boolean;
}

export interface LoginLimitConfig {
  /** Gagal login berturut-turut untuk satu email sebelum email itu dikunci sementara. */
  maxFailuresPerAccount: number;
  /** Gagal login dari satu alamat IP (email apa pun) sebelum IP itu dikunci sementara. */
  maxFailuresPerIp: number;
  /** Jendela hitungan dan lama kunci. */
  windowMinutes: number;
}

export interface AppConfig {
  env: NprEnv;
  port: number;
  databaseUrl: string;
  /** Folder hasil build web yang dilayani di luar /api. Kosong = API saja (mis. saat uji). */
  webDistDir: string | undefined;
  /**
   * Setelan `trust proxy` Express, diisi bila aplikasi berada di belakang reverse proxy
   * (mis. `loopback` atau jumlah proxy). Tanpa ini, IP klien untuk pembatasan login
   * adalah IP proxy. Kosong = tidak memercayai header X-Forwarded-*.
   */
  trustProxy: string | number | undefined;
  session: SessionConfig;
  loginLimit: LoginLimitConfig;
  stream: StreamConfig;
}

/** Pembaruan langsung (langkah 2.2). */
export interface StreamConfig {
  /** Jeda detak di aliran `GET /api/stream`; sesi juga diperiksa ulang setiap detak. */
  heartbeatMs: number;
}

export const DEFAULT_STREAM: StreamConfig = { heartbeatMs: 15_000 };

export const DEFAULT_LOGIN_LIMIT: LoginLimitConfig = {
  maxFailuresPerAccount: 5,
  maxFailuresPerIp: 20,
  windowMinutes: 15,
};

/**
 * Membaca dan memvalidasi konfigurasi dari variabel lingkungan.
 * Gagal cepat dengan daftar semua masalah; nilai rahasia tidak pernah ikut dicetak.
 */
export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const problems: string[] = [];

  const env = source.NPR_ENV;
  if (!isNprEnv(env)) {
    problems.push(`NPR_ENV wajib diisi salah satu dari: ${NPR_ENVS.join(', ')}`);
  }

  const databaseUrl = source.DATABASE_URL;
  if (!databaseUrl || !isPostgresUrl(databaseUrl)) {
    problems.push('DATABASE_URL wajib diisi dengan URL postgres:// yang sah');
  }

  const port = Number(source.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    problems.push('PORT harus bilangan bulat 1–65535');
  }

  const idleMinutes = readInteger(source.SESSION_IDLE_MINUTES, 30);
  if (idleMinutes === undefined || idleMinutes < 1 || idleMinutes > 1440) {
    problems.push('SESSION_IDLE_MINUTES harus bilangan bulat 1–1440 (menit)');
  }

  const maxHours = readInteger(source.SESSION_MAX_HOURS, 12);
  if (maxHours === undefined || maxHours < 1 || maxHours > 720) {
    problems.push('SESSION_MAX_HOURS harus bilangan bulat 1–720 (jam)');
  } else if (idleMinutes !== undefined && idleMinutes > maxHours * 60) {
    problems.push('SESSION_IDLE_MINUTES tidak boleh lebih lama dari SESSION_MAX_HOURS');
  }

  const cookieSecure = readBoolean(
    source.SESSION_COOKIE_SECURE,
    env !== 'development' && env !== 'test',
  );
  if (cookieSecure === undefined) {
    problems.push('SESSION_COOKIE_SECURE harus true atau false');
  }

  const trustProxy = readTrustProxy(source.TRUST_PROXY);

  if (
    problems.length > 0 ||
    !isNprEnv(env) ||
    !databaseUrl ||
    idleMinutes === undefined ||
    maxHours === undefined ||
    cookieSecure === undefined
  ) {
    throw new Error(`Konfigurasi tidak valid:\n- ${problems.join('\n- ')}`);
  }

  return {
    env,
    port,
    databaseUrl,
    webDistDir: source.WEB_DIST_DIR || undefined,
    trustProxy,
    session: { idleMinutes, maxHours, cookieSecure },
    loginLimit: { ...DEFAULT_LOGIN_LIMIT },
    stream: { ...DEFAULT_STREAM },
  };
}

function isNprEnv(value: string | undefined): value is NprEnv {
  return NPR_ENVS.includes(value as NprEnv);
}

function isPostgresUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'postgres:' || url.protocol === 'postgresql:';
  } catch {
    return false;
  }
}

/** `undefined` berarti nilai ada tetapi bukan bilangan bulat. */
function readInteger(value: string | undefined, fallback: number): number | undefined {
  if (value === undefined || value === '') return fallback;
  const number = Number(value);
  return Number.isInteger(number) ? number : undefined;
}

/** `undefined` berarti nilai ada tetapi bukan true/false. */
function readBoolean(value: string | undefined, fallback: boolean): boolean | undefined {
  if (value === undefined || value === '') return fallback;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}

/** Angka = jumlah proxy di depan aplikasi; selain itu diteruskan apa adanya ke Express. */
function readTrustProxy(value: string | undefined): string | number | undefined {
  if (value === undefined || value.trim() === '') return undefined;
  const trimmed = value.trim();
  return /^\d+$/.test(trimmed) ? Number(trimmed) : trimmed;
}
