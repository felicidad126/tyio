import type { NestExpressApplication } from '@nestjs/platform-express';
import { API_PREFIX } from '@tyio/shared';
import type { AppConfig } from './config.js';
import { serveWebApp } from './web-static.js';

/** Pengaturan yang sama untuk aplikasi sungguhan (main.ts) dan aplikasi uji. */
export function configureApp(app: NestExpressApplication, config: AppConfig): void {
  // Alamat IP klien dipakai pembatasan percobaan login. Header X-Forwarded-For hanya
  // dipercaya sebanyak jumlah reverse proxy yang benar-benar ada di depan aplikasi.
  app.set('trust proxy', config.trustProxyHops > 0 ? config.trustProxyHops : false);
  app.setGlobalPrefix(API_PREFIX);
  if (config.webDistDir) {
    serveWebApp(app, config.webDistDir);
  }
}
