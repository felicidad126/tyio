import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit, Optional } from '@nestjs/common';
import type { NotificationEvent } from '@tyio/shared';
import { DataSource } from 'typeorm';
import { withActor } from '../../common/audit/actor.js';
import { APP_CONFIG, type AppConfig } from '../../config.js';
import { ChangeFeed } from '../stream/change-feed.service.js';
import type { TicketNotificationPayload } from './notification-record.js';
import { packMessages, renderNotification } from './telegram-message.js';
import { TelegramClient, TelegramError } from './telegram.client.js';

/** Klien Telegram aplikasi; null bila token bot belum dipasang. */
export const TELEGRAM_CLIENT = 'TELEGRAM_CLIENT';

/** Jarak minimum antarpesan ke satu grup: Telegram membatasi ±20 pesan per menit per grup. */
export const CHAT_INTERVAL_MS = 3_100;
/** Kiriman yang diambil sekali jalan. */
const CLAIM_LIMIT = 50;
/** Lama kiriman "sedang dikirim" dipegang satu pekerja sebelum boleh diambil lagi. */
const LEASE_SECONDS = 120;
/** Data notifikasi disimpan 90 hari. */
const RETENTION_DAYS = 90;
const SYSTEM_ACTOR = { name: 'sistem:notifikasi' };

interface Claimed {
  id: string;
  channel_id: string;
  chat_id: string;
  thread_id: number | null;
  attempts: number;
  event_type: NotificationEvent;
  payload: TicketNotificationPayload;
  /** Waktu kejadian: urutan pesan di dalam satu grup. */
  created_at: Date;
}

/**
 * Mengirim notifikasi yang tercatat ke Telegram. Bangun saat ada kabar perubahan tiket (setiap
 * kejadian notifikasi juga mengubah tiket), saat jadwal coba ulang tiba, dan tiap
 * NOTIFICATION_POLL_MS sebagai pengaman. Kiriman diambil dengan FOR UPDATE SKIP LOCKED dan
 * dipegang sementara (lease), sehingga dua pekerja tidak pernah mengirim kiriman yang sama.
 *
 * Satu kejadian dikirim tepat sekali bila Telegram menjawab; bila koneksi putus setelah pesan
 * diterima Telegram tetapi sebelum jawabannya sampai, kiriman dicoba lagi dan pesan bisa
 * muncul dua kali (Bot API tidak punya kunci idempoten).
 */
@Injectable()
export class NotificationWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Notifikasi');
  /** Kapan grup boleh menerima pesan berikutnya (per chat). */
  private readonly nextAllowed = new Map<string, number>();
  private running: Promise<void> | null = null;
  private again = false;
  private stopped = false;
  private unsubscribe: (() => void) | undefined;
  private pollTimer: ReturnType<typeof setInterval> | undefined;
  private wakeTimer: ReturnType<typeof setTimeout> | undefined;
  private cleanupTimer: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly dataSource: DataSource,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(TELEGRAM_CLIENT) private readonly telegram: TelegramClient | null,
    @Optional() private readonly changes?: ChangeFeed,
  ) {}

  onModuleInit(): void {
    void this.cleanup();
    this.cleanupTimer = setInterval(() => void this.cleanup(), 24 * 60 * 60 * 1000);
    this.cleanupTimer.unref();
    if (!this.telegram) {
      this.logger.log('TELEGRAM_BOT_TOKEN kosong: notifikasi dicatat tetapi tidak dikirim.');
      return;
    }
    this.unsubscribe = this.changes?.subscribe(() => this.kick());
    this.pollTimer = setInterval(() => this.kick(), this.config.notificationPollMs);
    this.pollTimer.unref();
    this.kick();
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    this.unsubscribe?.();
    clearInterval(this.pollTimer);
    clearInterval(this.cleanupTimer);
    clearTimeout(this.wakeTimer);
    await this.running?.catch(() => undefined);
  }

  /** Minta pengiriman segera; panggilan selagi berjalan menjadwalkan satu putaran lagi. */
  kick(): void {
    if (this.stopped || !this.telegram) return;
    if (this.running) {
      this.again = true;
      return;
    }
    this.running = this.drain()
      .catch((error: unknown) => this.logger.error(`Pengiriman notifikasi gagal: ${String(error)}`))
      .finally(() => {
        this.running = null;
      });
  }

  /** Menunggu putaran yang sedang berjalan (untuk uji dan saat berhenti). */
  async idle(): Promise<void> {
    while (this.running) await this.running;
  }

  private async drain(): Promise<void> {
    do {
      this.again = false;
      while (!this.stopped && (await this.runOnce()) > 0) {
        // Ambil lagi sampai tidak ada kiriman yang jatuh tempo.
      }
    } while (this.again && !this.stopped);
    await this.scheduleWake();
  }

  /** Satu putaran: kedaluwarsakan yang terlalu lama, ambil yang jatuh tempo, kirim per grup. */
  async runOnce(): Promise<number> {
    const telegram = this.telegram;
    if (!telegram) return 0;
    await this.dataSource.query(
      `UPDATE notification_deliveries
       SET status = 'gagal', locked_until = NULL,
           last_error = coalesce(last_error || ' ', '') || '(kedaluwarsa: tidak terkirim dalam 24 jam)'
       WHERE expires_at <= now()
         AND (status = 'menunggu' OR (status = 'mengirim' AND locked_until < now()))`,
    );
    // UPDATE … RETURNING dijawab TypeORM sebagai [baris, jumlah].
    const [claimed] = (await this.dataSource.query(
      `WITH due AS (
         SELECT d.id FROM notification_deliveries d
         JOIN notification_channels c ON c.id = d.channel_id AND c.active
         WHERE (d.status = 'menunggu' AND d.next_attempt_at <= now())
            OR (d.status = 'mengirim' AND d.locked_until < now())
         ORDER BY d.next_attempt_at, d.created_at, d.id
         LIMIT ${CLAIM_LIMIT}
         FOR UPDATE OF d SKIP LOCKED
       )
       UPDATE notification_deliveries d
       SET status = 'mengirim', locked_until = now() + interval '${LEASE_SECONDS} seconds',
           attempts = d.attempts + 1, last_attempt_at = now()
       FROM due, notification_channels c, notification_events e
       WHERE d.id = due.id AND c.id = d.channel_id AND e.id = d.event_id
       RETURNING d.id, d.channel_id, c.chat_id, c.thread_id, d.attempts, e.event_type, e.payload, e.created_at`,
    )) as [Claimed[], number];
    if (claimed.length === 0) return 0;

    const byChannel = new Map<string, Claimed[]>();
    // Urutan kejadian dipertahankan di dalam setiap grup.
    for (const row of claimed.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())) {
      byChannel.set(row.channel_id, [...(byChannel.get(row.channel_id) ?? []), row]);
    }
    await Promise.all([...byChannel.values()].map((rows) => this.sendToChannel(telegram, rows)));
    return claimed.length;
  }

  private async sendToChannel(telegram: TelegramClient, rows: Claimed[]): Promise<void> {
    const { chat_id: chatId, thread_id: threadId, channel_id: channelId } = rows[0]!;
    const key = `${chatId}:${threadId ?? 0}`;
    const wait = (this.nextAllowed.get(key) ?? 0) - Date.now();
    if (wait > 0) {
      await this.release(rows, wait);
      return;
    }
    const batches = packMessages(rows.map((r) => renderNotification(r.event_type, r.payload, this.config.publicUrl)));
    const [first, ...later] = batches;
    // Satu pesan sekarang; sisanya dilepas dan dikirim setelah jeda grup.
    if (later.length > 0) await this.release(later.flatMap((b) => b.indexes.map((i) => rows[i]!)), CHAT_INTERVAL_MS);
    const sending = first!.indexes.map((i) => rows[i]!);
    this.nextAllowed.set(key, Date.now() + CHAT_INTERVAL_MS);
    try {
      const { messageId } = await telegram.sendMessage({ chatId, threadId }, first!.text);
      await this.dataSource.query(
        `UPDATE notification_deliveries
         SET status = 'terkirim', sent_at = now(), message_id = $2, locked_until = NULL, last_error = NULL
         WHERE id = ANY ($1::uuid[])`,
        [sending.map((r) => r.id), messageId],
      );
    } catch (error) {
      await this.failed(sending, channelId, error);
    }
  }

  private async failed(rows: Claimed[], channelId: string, error: unknown): Promise<void> {
    const ids = rows.map((r) => r.id);
    const e = error instanceof TelegramError ? error : new TelegramError('retry', `Kesalahan tak terduga: ${String(error)}`);
    if (e.failure === 'permanent') {
      await this.dataSource.query(
        `UPDATE notification_deliveries SET status = 'gagal', locked_until = NULL, last_error = $2 WHERE id = ANY ($1::uuid[])`,
        [ids, e.message],
      );
      this.logger.warn(`Notifikasi ke grup ${channelId} ditolak: ${e.message}`);
      return;
    }
    if (e.failure === 'migrated' && e.migrateToChatId) {
      // Grup menjadi supergroup: ID chat diganti di pengaturan (tercatat di audit), lalu dikirim lagi.
      await withActor(this.dataSource, SYSTEM_ACTOR, (m) =>
        m.query('UPDATE notification_channels SET chat_id = $2, updated_at = now() WHERE id = $1', [channelId, e.migrateToChatId]),
      );
    }
    const attempts = Math.max(...rows.map((r) => r.attempts));
    const delay =
      e.failure === 'migrated'
        ? 0
        : (e.retryAfterMs ?? (e.failure === 'unauthorized' ? 10 * 60_000 : backoffMs(attempts)));
    await this.dataSource.query(
      `UPDATE notification_deliveries
       SET status = 'menunggu', locked_until = NULL, last_error = $2,
           next_attempt_at = now() + ($3 || ' milliseconds')::interval
       WHERE id = ANY ($1::uuid[])`,
      [ids, e.message, String(delay)],
    );
    if (e.failure === 'unauthorized') this.logger.error(e.message);
  }

  /** Kembalikan ke antrean tanpa dihitung sebagai percobaan, dijadwalkan `delayMs` lagi. */
  private async release(rows: Claimed[], delayMs: number): Promise<void> {
    if (rows.length === 0) return;
    await this.dataSource.query(
      `UPDATE notification_deliveries
       SET status = 'menunggu', locked_until = NULL, attempts = attempts - 1,
           next_attempt_at = now() + ($2 || ' milliseconds')::interval
       WHERE id = ANY ($1::uuid[])`,
      [rows.map((r) => r.id), String(Math.ceil(delayMs))],
    );
  }

  /** Bangun lagi tepat saat kiriman berikutnya jatuh tempo (coba ulang, jeda grup). */
  private async scheduleWake(): Promise<void> {
    if (this.stopped) return;
    const [next] = (await this.dataSource.query(
      `SELECT extract(epoch FROM min(next_attempt_at) - now()) * 1000 AS ms
       FROM notification_deliveries WHERE status = 'menunggu'`,
    )) as Array<{ ms: string | null }>;
    clearTimeout(this.wakeTimer);
    if (next?.ms === null || next?.ms === undefined) return;
    const ms = Math.max(50, Math.ceil(Number(next.ms)));
    if (ms >= this.config.notificationPollMs) return;
    this.wakeTimer = setTimeout(() => this.kick(), ms);
    this.wakeTimer.unref();
  }

  /** Hapus kejadian (dan kirimannya) yang lebih tua dari 90 hari. */
  private async cleanup(): Promise<void> {
    try {
      await this.dataSource.query(
        `DELETE FROM notification_events WHERE created_at < now() - interval '${RETENTION_DAYS} days'`,
      );
    } catch (error) {
      this.logger.warn(`Pembersihan notifikasi lama gagal: ${String(error)}`);
    }
  }
}

/** 30 dtk, 1, 2, 4, 8, 16, lalu tiap 30 menit sampai kedaluwarsa (24 jam). */
export function backoffMs(attempts: number): number {
  return Math.min(30 * 60_000, 30_000 * 2 ** Math.max(0, attempts - 1));
}
