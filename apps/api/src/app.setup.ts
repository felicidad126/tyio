import type { NestExpressApplication } from '@nestjs/platform-express';
import { API_PREFIX } from '@tyio/shared';
import type { AppConfig } from './config.js';
import { serveWebApp } from './web-static.js';

/** Pengaturan yang sama untuk aplikasi sungguhan (main.ts) dan aplikasi uji. */
export function configureApp(app: NestExpressApplication, config: AppConfig): void {
  app.setGlobalPrefix(API_PREFIX);
  if (config.webDistDir) {
    serveWebApp(app, config.webDistDir);
  }
}
