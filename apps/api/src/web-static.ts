import type { NestExpressApplication } from '@nestjs/platform-express';
import { API_PREFIX } from '@tyio/shared';
import type { NextFunction, Request, Response } from 'express';
import { extname, join, resolve } from 'node:path';

/**
 * Melayani hasil build web dari origin yang sama dengan API.
 * - Berkas yang ada (mis. /assets/app-abc.js) dilayani apa adanya.
 * - Jalur tanpa ekstensi di luar /api (mis. /tiket/NPR-1) mendapat index.html,
 *   agar tautan langsung dan muat ulang di aplikasi web tetap jalan.
 * - Berkas yang tidak ada dan jalur /api diteruskan ke Nest (404 JSON),
 *   bukan dijawab dengan index.html.
 */
export function serveWebApp(app: NestExpressApplication, distDir: string): void {
  const root = resolve(distDir);
  const indexHtml = join(root, 'index.html');
  const apiRoot = `/${API_PREFIX}`;

  app.useStaticAssets(root, { index: false });
  app.use((req: Request, res: Response, next: NextFunction) => {
    const isPageRequest = req.method === 'GET' || req.method === 'HEAD';
    const isApi = req.path === apiRoot || req.path.startsWith(`${apiRoot}/`);
    if (!isPageRequest || isApi || extname(req.path) !== '') {
      next();
      return;
    }
    // index.html selalu diperiksa ulang agar versi baru langsung terpakai setelah rilis.
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(indexHtml);
  });
}
