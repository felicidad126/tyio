import { type AppConfig, DEFAULT_LOGIN_LIMIT, DEFAULT_STREAM } from '../src/config.js';

// Database uji terpisah dari database dev (`tyio`), dibuat oleh init script compose dev.
// Kredensial ini hanya untuk Postgres lokal yang terikat ke 127.0.0.1.
const DEFAULT_TEST_DATABASE_URL = 'postgres://tyio:tyio@localhost:5432/tyio_test';

export function testConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    env: 'test',
    port: 0,
    databaseUrl: process.env.TEST_DATABASE_URL ?? DEFAULT_TEST_DATABASE_URL,
    webDistDir: undefined,
    trustProxy: undefined,
    session: { idleMinutes: 30, maxHours: 12, cookieSecure: false },
    // Batas per IP dinaikkan: semua uji datang dari 127.0.0.1 dan berjalan paralel, jadi
    // kegagalan login dari berkas uji lain tidak boleh mengunci uji ini. Uji batas per IP
    // memakai IP sendiri (lihat auth.test.ts).
    loginLimit: { ...DEFAULT_LOGIN_LIMIT, maxFailuresPerIp: 10_000 },
    stream: { ...DEFAULT_STREAM },
    ...overrides,
  };
}
