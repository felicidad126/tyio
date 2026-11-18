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
  /** Folder lampiran tiket (T8: volume yang ikut backup). Nama berkas di dalamnya diacak. */
  attachmentsDir: string;
  /**
   * Pembaruan langsung (2.2): jarak detak di koneksi `/api/stream` (agar proxy tidak menutup
   * koneksi yang diam dan browser tahu koneksinya hidup), dan umur koneksi paling lama sebelum
   * server menutupnya dengan rapi agar browser menyambung ulang dan sesinya diperiksa lagi.
   */
  streamHeartbeatMs: number;
  streamMaxMs: number;
  /**
   * Peta remote (2.3): sumber gambar peta (URL dengan {z}, {x}, {y}) dan atribusinya. Bawaan
   * OpenStreetMap; ganti dengan penyedia berlangganan bila pemakaian membesar.
   */
  mapTileUrl: string;
  mapTileAttribution: string;
  /**
   * Notifikasi Telegram (R5): token bot dari BotFather (rahasia; kosong = notifikasi dicatat
   * tetapi tidak dikirim), alamat API Telegram (diganti hanya untuk uji), dan jeda pemeriksaan
   * antrean untuk kiriman yang dicoba ulang.
   */
  telegramBotToken: string | undefined;
  telegramApiUrl: string;
  notificationPollMs: number;
  /** Alamat portal untuk tautan di pesan notifikasi, mis. https://noc.contoh.co.id. */
  publicUrl: string | undefined;
}

export const DEFAULT_MAP_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const DEFAULT_MAP_TILE_ATTRIBUTION = '© OpenStreetMap contributors';
export const DEFAULT_TELEGRAM_API_URL = 'https://api.telegram.org';

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

  // Dev dan uji boleh memakai folder bawaan; staging dan produksi wajib menyebutnya (image
  // sudah mengisinya dengan /app/data/lampiran, yang dipasang sebagai volume).
  const attachmentsDir =
    source.ATTACHMENTS_DIR || (env === 'development' || env === 'test' ? 'data/lampiran' : undefined);
  if (!attachmentsDir) {
    problems.push('ATTACHMENTS_DIR wajib diisi dengan folder lampiran tiket');
  }

  const streamHeartbeatMs = Number(source.STREAM_HEARTBEAT_MS ?? 25_000);
  if (!Number.isInteger(streamHeartbeatMs) || streamHeartbeatMs < 50 || streamHeartbeatMs > 55_000) {
    problems.push('STREAM_HEARTBEAT_MS harus bilangan bulat 50–55000 (di bawah batas diam proxy, 60 detik)');
  }
  const streamMaxMs = Number(source.STREAM_MAX_MS ?? 300_000);
  if (!Number.isInteger(streamMaxMs) || streamMaxMs < 200 || streamMaxMs > 3_600_000) {
    problems.push('STREAM_MAX_MS harus bilangan bulat 200–3600000');
  }

  const mapTileUrl = source.MAP_TILE_URL || DEFAULT_MAP_TILE_URL;
  if (!isTileUrl(mapTileUrl)) {
    problems.push('MAP_TILE_URL harus URL https yang memuat {z}, {x}, dan {y}');
  }
  const mapTileAttribution = source.MAP_TILE_ATTRIBUTION || DEFAULT_MAP_TILE_ATTRIBUTION;

  // Isi token tidak pernah dicetak, juga saat salah.
  const telegramBotToken = source.TELEGRAM_BOT_TOKEN?.trim() || undefined;
  if (telegramBotToken && !/^\d{5,12}:[A-Za-z0-9_-]{30,64}$/.test(telegramBotToken)) {
    problems.push('TELEGRAM_BOT_TOKEN tidak berbentuk token bot dari BotFather (angka:kode)');
  }
  const deployed = env === 'staging' || env === 'production';
  const telegramApiUrl = (source.TELEGRAM_API_URL || DEFAULT_TELEGRAM_API_URL).replace(/\/+$/, '');
  if (!isWebUrl(telegramApiUrl, deployed)) {
    problems.push(`TELEGRAM_API_URL harus URL ${deployed ? 'https' : 'http(s)'} tanpa jalur tambahan`);
  }
  const notificationPollMs = Number(source.NOTIFICATION_POLL_MS ?? 15_000);
  if (!Number.isInteger(notificationPollMs) || notificationPollMs < 100 || notificationPollMs > 600_000) {
    problems.push('NOTIFICATION_POLL_MS harus bilangan bulat 100–600000');
  }
  const publicUrl = source.PUBLIC_URL?.trim().replace(/\/+$/, '') || undefined;
  if (publicUrl && !isWebUrl(publicUrl, deployed)) {
    problems.push(`PUBLIC_URL harus alamat ${deployed ? 'https' : 'http(s)'} portal tanpa jalur, mis. https://noc.contoh.co.id`);
  }

  if (
    problems.length > 0 ||
    !isTyioEnv(env) ||
    !databaseUrl ||
    sessionCookieSecure === undefined ||
    !attachmentsDir
  ) {
    throw new Error(`Konfigurasi tidak valid:\n- ${problems.join('\n- ')}`);
  }

  return {
    env,
    port,
    databaseUrl,
    webDistDir: source.WEB_DIST_DIR || undefined,
    sessionCookieSecure,
    trustProxyHops,
    attachmentsDir,
    streamHeartbeatMs,
    streamMaxMs,
    mapTileUrl,
    mapTileAttribution,
    telegramBotToken,
    telegramApiUrl,
    notificationPollMs,
    publicUrl,
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

function isTileUrl(value: string): boolean {
  try {
    const url = new URL(value.replace(/\{[a-z]\}/g, '0'));
    return url.protocol === 'https:' && ['{z}', '{x}', '{y}'].every((part) => value.includes(part));
  } catch {
    return false;
  }
}

/** Alamat asal (origin) http(s) tanpa jalur, kueri, atau kredensial; https wajib bila `secure`. */
function isWebUrl(value: string, secure: boolean): boolean {
  try {
    const url = new URL(value);
    const protocolOk = url.protocol === 'https:' || (!secure && url.protocol === 'http:');
    return protocolOk && url.pathname === '/' && !url.search && !url.hash && !url.username && !url.password;
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
