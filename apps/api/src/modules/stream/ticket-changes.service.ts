import { randomBytes } from 'node:crypto';
import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import type { TicketChangeEvent } from '@tyio/shared';
import pg from 'pg';
import { Subject } from 'rxjs';
import { APP_CONFIG } from '../../config.module.js';
import type { AppConfig } from '../../config.js';

/** Kanal `pg_notify` dari trigger `notify_change` di `ticket_actions` (migrasi ticket-change-notify). */
export const CHANGE_CHANNEL = 'tyio_perubahan';

export type TicketChange = { type: 'ticket'; event: TicketChangeEvent } | { type: 'resync' };

const RETRY_MS = [1_000, 2_000, 5_000, 10_000, 30_000];

/**
 * Satu sambungan PostgreSQL per instans aplikasi yang mendengarkan (`LISTEN`) perubahan NPR
 * dan meneruskannya ke semua aliran `GET /api/stream` di instans itu. Bila sambungan putus,
 * disambung ulang dengan jeda bertambah; setelah tersambung lagi dikirim `resync`, karena
 * pemberitahuan selama putus tidak tersimpan di mana pun.
 */
@Injectable()
export class TicketChangesService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TicketChangesService.name);
  private readonly subject = new Subject<TicketChange>();
  private client: pg.Client | null = null;
  private readonly dead = new WeakSet<pg.Client>();
  private stopped = false;
  private failures = 0;
  private retryTimer: NodeJS.Timeout | undefined;

  /** Nama sambungan di `pg_stat_activity` (uji memutusnya untuk menguji sambung ulang). */
  readonly listenerName = `tyio-stream-${randomBytes(4).toString('hex')}`;
  readonly changes$ = this.subject.asObservable();

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  async onModuleInit(): Promise<void> {
    await this.connect(false);
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    clearTimeout(this.retryTimer);
    const client = this.client;
    this.client = null;
    await client?.end().catch(() => undefined);
    this.subject.complete();
  }

  private async connect(isReconnect: boolean): Promise<void> {
    const client = new pg.Client({ connectionString: this.config.databaseUrl, application_name: this.listenerName });
    client.on('notification', (message) => {
      if (message.channel !== CHANGE_CHANNEL || !message.payload) return;
      const event = parseChange(message.payload);
      if (event) this.subject.next({ type: 'ticket', event });
    });
    client.on('error', (error) => this.lost(client, error));
    client.on('end', () => this.lost(client));
    try {
      await client.connect();
      await client.query(`LISTEN ${CHANGE_CHANNEL}`);
    } catch (error) {
      this.lost(client, error);
      return;
    }
    if (this.stopped) {
      await client.end().catch(() => undefined);
      return;
    }
    this.client = client;
    this.failures = 0;
    if (isReconnect) this.subject.next({ type: 'resync' });
  }

  /** Sambungan putus atau gagal: buang, lalu coba lagi dengan jeda bertambah. */
  private lost(client: pg.Client, error?: unknown): void {
    // 'error' dan 'end' bisa datang berdua untuk sambungan yang sama: tangani sekali.
    if (this.stopped || this.dead.has(client)) return;
    this.dead.add(client);
    client.removeAllListeners('notification');
    void client.end().catch(() => undefined);
    if (this.client !== null && this.client !== client) return; // sambungan lain sudah aktif
    this.client = null;
    if (this.retryTimer) return;
    const delay = RETRY_MS[Math.min(this.failures, RETRY_MS.length - 1)] ?? 30_000;
    this.failures += 1;
    this.logger.warn(
      `Sambungan pembaruan langsung ke database putus${error instanceof Error ? `: ${error.message}` : ''}; ` +
        `dicoba lagi dalam ${delay / 1000} detik.`,
    );
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined;
      void this.connect(true);
    }, delay);
  }
}

function parseChange(payload: string): TicketChangeEvent | null {
  try {
    const value = JSON.parse(payload) as Partial<TicketChangeEvent>;
    if (typeof value.tenantId === 'string' && typeof value.ticketId === 'string' && typeof value.kind === 'string') {
      return { tenantId: value.tenantId, ticketId: value.ticketId, kind: value.kind };
    }
  } catch {
    // Isi yang bukan JSON diabaikan.
  }
  return null;
}
