import type { NestExpressApplication } from '@nestjs/platform-express';
import { API_PREFIX } from '@tyio/shared';
import { json, type NextFunction, type Request, type Response } from 'express';
import type { AppConfig } from './config.js';
import { serveWebApp } from './web-static.js';

/** Pengaturan yang sama untuk aplikasi sungguhan (main.ts) dan aplikasi uji. */
export function configureApp(app: NestExpressApplication, config: AppConfig): void {
  // Alamat IP klien dipakai pembatasan percobaan login. Header X-Forwarded-For hanya
  // dipercaya sebanyak jumlah reverse proxy yang benar-benar ada di depan aplikasi.
  app.set('trust proxy', config.trustProxyHops > 0 ? config.trustProxyHops : false);
  app.setGlobalPrefix(API_PREFIX);
  // Batas isian JSON bawaan (100 KB) tetap untuk semua rute, kecuali impor remote yang bisa
  // berisi 10.000 baris. Pengurai ini berjalan lebih dulu; pengurai bawaan Nest melewati
  // permintaan yang isiannya sudah dibaca. Dibungkus fungsi lain dengan sengaja: Nest tidak
  // memasang pengurai globalnya bila sudah ada middleware bernama `jsonParser`.
  const importJson = json({ limit: '12mb' });
  app.use(`/${API_PREFIX}/admin/remotes/import`, (req: Request, res: Response, next: NextFunction) =>
    importJson(req, res, next),
  );
  if (config.webDistDir) {
    serveWebApp(app, config.webDistDir);
  }
}
