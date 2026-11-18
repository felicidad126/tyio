import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { STREAM_CHANGE_KINDS, type StreamChangeKind } from '@tyio/shared';
import pg from 'pg';
import { APP_CONFIG, type AppConfig } from '../../config.js';

export const CHANGE_CHANNEL = 'tyio_changes';

export type FeedEvent =
  | { type: 'change'; tenantId: string; ticketId: string; kind: StreamChangeKind }
  /** Koneksi ke database sempat putus: kabar di antaranya mungkin hilang. */
  | { type: 'resync' };

/**
 * Mendengarkan NOTIFY `tyio_changes` (trigger di tabel tiket, linimasa, dan TT) lewat satu
 * koneksi database khusus, lalu meneruskannya ke semua pelanggan di proses ini. Bila koneksi
 * putus, menyambung ulang dengan jeda yang makin panjang (sampai 30 detik) dan mengirim
 * `resync` setelah tersambung lagi.
 */
@Injectable()
export class ChangeFeed implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('ChangeFeed');
  private readonly listeners = new Set<(event: FeedEvent) => void>();
  private client: pg.Client | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private failures = 0;
  private stopped = false;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  async onModuleInit(): Promise<void> {
    await this.connect();
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    clearTimeout(this.retryTimer);
    const client = this.client;
    this.client = null;
    await client?.end().catch(() => undefined);
  }

  /** Berlangganan kabar; mengembalikan fungsi untuk berhenti. */
  subscribe(listener: (event: FeedEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  get connected(): boolean {
    return this.client !== null;
  }

  private async connect(): Promise<void> {
    const client = new pg.Client({ connectionString: this.config.databaseUrl, connectionTimeoutMillis: 10_000 });
    let lost = false;
    const onLost = (reason: unknown) => {
      if (lost) return;
      lost = true;
      if (this.client === client) this.client = null;
      void client.end().catch(() => undefined);
      if (!this.stopped) {
        this.logger.warn(`Koneksi kabar perubahan putus: ${reason instanceof Error ? reason.message : String(reason)}`);
        this.scheduleRetry();
      }
    };
    client.on('error', onLost);
    client.on('end', () => onLost('koneksi ditutup'));
    client.on('notification', (message) => {
      if (message.channel !== CHANGE_CHANNEL || !message.payload) return;
      const event = parseChange(message.payload);
      if (event) this.emit(event);
    });
    try {
      await client.connect();
      await client.query(`LISTEN ${CHANGE_CHANNEL}`);
    } catch (error) {
      onLost(error);
      return;
    }
    if (this.stopped) {
      await client.end().catch(() => undefined);
      return;
    }
    this.client = client;
    if (this.failures > 0) {
      this.logger.log('Koneksi kabar perubahan tersambung lagi.');
      this.emit({ type: 'resync' });
    }
    this.failures = 0;
  }

  private scheduleRetry(): void {
    clearTimeout(this.retryTimer);
    this.failures += 1;
    const delay = Math.min(30_000, 1000 * 2 ** Math.min(this.failures - 1, 5));
    this.retryTimer = setTimeout(() => void this.connect(), delay);
  }

  private emit(event: FeedEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        this.logger.error(`Pelanggan kabar perubahan gagal: ${String(error)}`);
      }
    }
  }
}

/** Isi NOTIFY dari trigger; yang tidak dikenal diabaikan. */
export function parseChange(payload: string): FeedEvent | null {
  try {
    const value = JSON.parse(payload) as { tenantId?: unknown; ticketId?: unknown; kind?: unknown };
    if (
      typeof value.tenantId === 'string' &&
      typeof value.ticketId === 'string' &&
      STREAM_CHANGE_KINDS.includes(value.kind as StreamChangeKind)
    ) {
      return { type: 'change', tenantId: value.tenantId, ticketId: value.ticketId, kind: value.kind as StreamChangeKind };
    }
  } catch {
    // Diabaikan: bukan JSON.
  }
  return null;
}
