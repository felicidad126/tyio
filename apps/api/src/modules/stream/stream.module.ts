import { Controller, Inject, Module, type MessageEvent, Req, Sse } from '@nestjs/common';
import { STREAM_EVENTS, type StreamBeat, type StreamHello, type TicketChangeEvent } from '@npr/shared';
import { concatMap, filter, from, interval, map, merge, type Observable, of, Subject, takeUntil, tap } from 'rxjs';
import { APP_CONFIG } from '../../config.module.js';
import type { AppConfig } from '../../config.js';
import { CurrentScope, TenantScoped } from '../../common/tenant/tenancy.js';
import { scopeIncludes, type TenantScope } from '../../common/tenant/tenant-scope.js';
import type { AuthenticatedRequest } from '../auth/auth-request.js';
import { AuthModule } from '../auth/auth.module.js';
import { AuthService } from '../auth/auth.service.js';
import { TicketChangesService } from './ticket-changes.service.js';

/** Jeda sambung ulang yang disarankan ke peramban (`retry:`), dalam milidetik. */
const CLIENT_RETRY_MS = 3_000;

/**
 * Pembaruan langsung (langkah 2.2, T6): aliran server-sent events. Hanya perubahan NPR milik
 * customer dalam cakupan pengguna yang dikirim (T9); isinya pemberitahuan saja, data diambil
 * ulang lewat endpoint biasa. Sesi diperiksa ulang di setiap detak tanpa memperpanjang batas
 * idle; sesi yang berakhir atau dicabut menutup aliran.
 */
@Controller('stream')
@TenantScoped()
export class StreamController {
  constructor(
    private readonly changes: TicketChangesService,
    private readonly auth: AuthService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Sse()
  stream(@CurrentScope() scope: TenantScope, @Req() request: AuthenticatedRequest): Observable<MessageEvent> {
    const token = request.auth?.token ?? '';
    const { heartbeatMs } = this.config.stream;
    const ended = new Subject<void>();

    const hello: StreamHello = { at: new Date().toISOString(), heartbeatMs };
    const changes = this.changes.changes$.pipe(
      filter((change) => change.type === 'resync' || scopeIncludes(scope, change.event.tenantId)),
      map(
        (change): MessageEvent =>
          change.type === 'resync'
            ? { type: STREAM_EVENTS.resync, data: {} }
            : { type: STREAM_EVENTS.ticket, data: change.event satisfies TicketChangeEvent },
      ),
    );
    const beats = interval(heartbeatMs).pipe(
      concatMap(() => from(this.auth.isSessionActive(token))),
      tap((active) => {
        if (!active) ended.next();
      }),
      filter((active) => active),
      map((): MessageEvent => ({ type: STREAM_EVENTS.beat, data: { at: new Date().toISOString() } satisfies StreamBeat })),
    );
    return merge(of<MessageEvent>({ type: STREAM_EVENTS.hello, data: hello, retry: CLIENT_RETRY_MS }), changes, beats).pipe(
      takeUntil(ended),
    );
  }
}

@Module({
  imports: [AuthModule],
  controllers: [StreamController],
  providers: [TicketChangesService],
  exports: [TicketChangesService],
})
export class StreamModule {}
