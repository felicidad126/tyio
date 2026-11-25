import type { NestExpressApplication } from '@nestjs/platform-express';
import { API_PREFIX, REMOTE_IMPORT_MAX_BYTES, XLSX_MIME } from '@npr/shared';
import type { AppConfig } from './config.js';
import { serveWebApp } from './web-static.js';

/** Pengaturan yang sama untuk aplikasi sungguhan (main.ts) dan aplikasi uji. */
export function configureApp(app: NestExpressApplication, config: AppConfig): void {
  app.setGlobalPrefix(API_PREFIX);
  // Impor remote mengirim berkas .xlsx sebagai isi permintaan (tanpa multipart).
  app.useBodyParser('raw', { type: XLSX_MIME, limit: REMOTE_IMPORT_MAX_BYTES });
  if (config.trustProxy !== undefined) {
    // Di belakang reverse proxy: IP klien (pembatasan login) dan host (cek origin)
    // dibaca dari header X-Forwarded-* yang dipasang proxy tepercaya.
    app.set('trust proxy', config.trustProxy);
  }
  if (config.webDistDir) {
    serveWebApp(app, config.webDistDir);
  }
}
