import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AppConfig } from '../src/config.js';

/** Folder lampiran sementara, satu per proses uji. */
export const TEST_ATTACHMENTS_DIR = mkdtempSync(join(tmpdir(), 'tyio-lampiran-uji-'));

// Database uji terpisah dari database dev (`tyio`), dibuat oleh init script compose dev.
// Kredensial ini hanya untuk Postgres lokal yang terikat ke 127.0.0.1.
const DEFAULT_TEST_DATABASE_URL = 'postgres://tyio:tyio@localhost:5432/tyio_test';

export function testConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    env: 'test',
    port: 0,
    databaseUrl: process.env.TEST_DATABASE_URL ?? DEFAULT_TEST_DATABASE_URL,
    webDistDir: undefined,
    sessionCookieSecure: false,
    trustProxyHops: 0,
    attachmentsDir: TEST_ATTACHMENTS_DIR,
    ...overrides,
  };
}
