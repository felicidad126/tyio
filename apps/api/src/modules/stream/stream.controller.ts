import { Controller, Get, Inject, Req, Res } from '@nestjs/common';
import type { StreamChange, StreamPing, StreamReady } from '@tyio/shared';
import type { Request, Response } from 'express';
import type { TenantAccess } from '../../common/tenant/tenant-access.js';
import { CurrentTenantAccess, TenantScoped } from '../../common/tenant/tenant-policy.js';
import { APP_CONFIG, type AppConfig } from '../../config.js';
import { RequireModule } from '../auth/auth.decorators.js';
import { ChangeFeed } from './change-feed.service.js';

/**
 * Pembaruan langsung (2.2): koneksi Server-Sent Events yang mengabarkan tiket mana yang berubah,
 * hanya untuk customer yang boleh dilihat pengguna. Isinya hanya ID tiket dan jenis perubahan;
 * datanya tetap diambil lewat rute biasa. Koneksi ditutup rapi setelah `streamMaxMs` agar
 * browser menyambung ulang dan sesi diperiksa lagi (sesi kedaluwarsa atau pengguna dinonaktifkan
 * tidak terus menerima kabar).
 */
@TenantScoped()
@RequireModule('tiket')
@Controller('stream')
export class StreamController {
  constructor(
    private readonly feed: ChangeFeed,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Get()
  stream(@CurrentTenantAccess() access: TenantAccess, @Req() req: Request, @Res() res: Response): void {
    res.status(200);
    res.set({
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, no-transform',
      Connection: 'keep-alive',
      // Nginx (aaPanel) meneruskan langsung, tanpa menahan di buffer.
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();

    const send = (event: string, data: object) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    const visible = (tenantId: string) => access.all || access.tenantIds.includes(tenantId);

    // Browser menunggu 3 detik sebelum menyambung ulang sendiri setelah koneksi putus.
    res.write('retry: 3000\n\n');
    send('ready', { at: new Date().toISOString(), heartbeatMs: this.config.streamHeartbeatMs } satisfies StreamReady);

    const unsubscribe = this.feed.subscribe((event) => {
      if (event.type === 'resync') send('resync', {});
      else if (visible(event.tenantId)) {
        send('change', { ticketId: event.ticketId, kind: event.kind, op: event.op } satisfies StreamChange);
      }
    });
    const heartbeat = setInterval(
      () => send('ping', { at: new Date().toISOString() } satisfies StreamPing),
      this.config.streamHeartbeatMs,
    );
    const expiry = setTimeout(() => {
      send('bye', {});
      res.end();
    }, this.config.streamMaxMs);

    const cleanup = () => {
      unsubscribe();
      clearInterval(heartbeat);
      clearTimeout(expiry);
    };
    req.on('close', cleanup);
    res.on('close', cleanup);
  }
}
