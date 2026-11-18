import { ConflictException, HttpStatus, Inject, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import {
  type DeliveryStatus,
  DELIVERY_STATUSES,
  NOTIFICATION_DELIVERIES_PAGE_SIZE,
  NOTIFICATION_EVENT_LABELS,
  type NotificationDeliveriesResponse,
  type NotificationEvent,
  type NotificationSettingsResponse,
  type TelegramChannel,
  type TelegramChannelInput,
  type TelegramChatCandidate,
  type TenantRef,
} from '@tyio/shared';
import { DataSource, type EntityManager, QueryFailedError } from 'typeorm';
import { type Actor, withActor } from '../../common/audit/actor.js';
import { APP_CONFIG, type AppConfig } from '../../config.js';
import { invalid } from '../tickets/ticket-input.js';
import { NotificationWorker, TELEGRAM_CLIENT } from './notification-worker.service.js';
import { renderTestMessage } from './telegram-message.js';
import { TelegramClient, TelegramError } from './telegram.client.js';

const UNIQUE_VIOLATION = '23505';
/** Nama bot dari Telegram disimpan sebentar agar halaman Admin tidak memanggil Telegram tiap kali. */
const BOT_CACHE_MS = 60_000;

interface ChannelRow {
  id: string;
  name: string;
  chat_id: string;
  thread_id: number | null;
  events: NotificationEvent[];
  all_tenants: boolean;
  active: boolean;
  tenants: TenantRef[] | null;
  last_sent_at: Date | null;
  last_error: string | null;
  last_error_at: Date | null;
  waiting: string;
}

/** Pengaturan notifikasi di Admin › Notifikasi: grup penerima, uji kirim, dan log pengiriman. */
@Injectable()
export class NotificationSettingsService {
  private bot: { at: number; value: NotificationSettingsResponse['bot'] } | null = null;

  constructor(
    private readonly dataSource: DataSource,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(TELEGRAM_CLIENT) private readonly telegram: TelegramClient | null,
    private readonly worker: NotificationWorker,
  ) {}

  async settings(): Promise<NotificationSettingsResponse> {
    return { bot: await this.botStatus(), publicUrl: this.config.publicUrl ?? null, channels: await this.channels() };
  }

  async create(input: TelegramChannelInput, actor: Actor): Promise<TelegramChannel> {
    const id = await this.save(actor, async (m) => {
      const [row] = (await m.query(
        `INSERT INTO notification_channels (name, chat_id, thread_id, events, all_tenants, active)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [input.name, input.chatId, input.threadId ?? null, input.events, input.allTenants, input.active],
      )) as Array<{ id: string }>;
      await setTenants(m, row!.id, input.tenantIds);
      return row!.id;
    });
    return this.channel(id);
  }

  async update(id: string, input: TelegramChannelInput, actor: Actor): Promise<TelegramChannel> {
    await this.save(actor, async (m) => {
      const [, count] = (await m.query(
        `UPDATE notification_channels
         SET name = $2, chat_id = $3, thread_id = $4, events = $5, all_tenants = $6, active = $7, updated_at = now()
         WHERE id = $1`,
        [id, input.name, input.chatId, input.threadId ?? null, input.events, input.allTenants, input.active],
      )) as [unknown, number];
      if (count === 0) throw channelNotFound();
      await m.query('DELETE FROM notification_channel_tenants WHERE channel_id = $1', [id]);
      await setTenants(m, id, input.tenantIds);
    });
    return this.channel(id);
  }

  /** Menghapus grup beserta antrean dan log kirimannya. */
  async remove(id: string, actor: Actor): Promise<void> {
    await withActor(this.dataSource, actor, async (m) => {
      const [, count] = (await m.query('DELETE FROM notification_channels WHERE id = $1', [id])) as [unknown, number];
      if (count === 0) throw channelNotFound();
    });
  }

  /** Kirim pesan uji sekarang juga; galat Telegram dijawab sebagai pesan yang bisa ditindaklanjuti. */
  async test(id: string, migrated = false): Promise<void> {
    const telegram = this.requireBot();
    const channel = await this.channel(id);
    const scope = channel.allTenants ? 'semua customer' : channel.tenants.map((t) => t.name).join(', ');
    try {
      await telegram.sendMessage(
        { chatId: channel.chatId, threadId: channel.threadId },
        renderTestMessage(channel.name, channel.events.map((e) => NOTIFICATION_EVENT_LABELS[e]), scope),
      );
    } catch (error) {
      // Grup baru saja menjadi supergroup: ID chat diperbarui, lalu dicoba sekali lagi.
      if (!migrated && error instanceof TelegramError && error.failure === 'migrated' && error.migrateToChatId) {
        await withActor(this.dataSource, { name: 'sistem:notifikasi' }, (m) =>
          m.query('UPDATE notification_channels SET chat_id = $2, updated_at = now() WHERE id = $1', [id, error.migrateToChatId]),
        );
        return this.test(id, true);
      }
      throw new ServiceUnavailableException({
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        message: error instanceof TelegramError ? error.message : 'Pesan uji gagal dikirim.',
      });
    }
  }

  /** Grup yang baru-baru ini terlihat bot, untuk dipilih tanpa mencari ID chat sendiri. */
  async chats(): Promise<TelegramChatCandidate[]> {
    if (!this.telegram) return [];
    let chats;
    try {
      chats = await this.telegram.recentChats();
    } catch (error) {
      throw new ServiceUnavailableException({
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        message: error instanceof TelegramError ? error.message : 'Daftar grup dari Telegram gagal dibaca.',
      });
    }
    const used = new Set(
      ((await this.dataSource.query('SELECT chat_id FROM notification_channels')) as Array<{ chat_id: string }>).map(
        (r) => r.chat_id,
      ),
    );
    return chats
      .filter((chat) => chat.type !== 'private')
      .map((chat) => ({
        chatId: String(chat.id),
        title: chat.title ?? chat.username ?? String(chat.id),
        type: chat.type,
        used: used.has(String(chat.id)),
      }))
      .sort((a, b) => a.title.localeCompare(b.title, 'id'));
  }

  async deliveries(query: Record<string, unknown>): Promise<NotificationDeliveriesResponse> {
    const unknown = Object.keys(query).find((key) => key !== 'status' && key !== 'page');
    if (unknown) throw invalid(`Parameter tidak dikenal: ${unknown}.`);
    const status = typeof query.status === 'string' && query.status ? query.status : undefined;
    if (status !== undefined && !DELIVERY_STATUSES.includes(status as DeliveryStatus)) {
      throw invalid(`Status harus salah satu dari: ${DELIVERY_STATUSES.join(', ')}.`);
    }
    const page = query.page === undefined ? 1 : Number(query.page);
    if (!Number.isInteger(page) || page < 1 || page > 100_000) throw invalid('Halaman harus bilangan bulat mulai 1.');
    const where = status ? 'WHERE d.status = $1' : '';
    const params = status ? [status] : [];
    const [rows, [count]] = await Promise.all([
      this.dataSource.query(
        `SELECT d.id, d.created_at, e.event_type, e.ticket_id, e.payload->>'number' AS ticket_number,
                e.payload->>'tenant' AS tenant, c.id AS channel_id, c.name AS channel_name,
                d.status, d.attempts, d.sent_at, d.last_error
         FROM notification_deliveries d
         JOIN notification_events e ON e.id = d.event_id
         JOIN notification_channels c ON c.id = d.channel_id
         ${where}
         ORDER BY d.created_at DESC, d.id DESC
         LIMIT ${NOTIFICATION_DELIVERIES_PAGE_SIZE} OFFSET ${(page - 1) * NOTIFICATION_DELIVERIES_PAGE_SIZE}`,
        params,
      ) as Promise<
        Array<{
          id: string;
          created_at: Date;
          event_type: NotificationEvent;
          ticket_id: string;
          ticket_number: string;
          tenant: string;
          channel_id: string;
          channel_name: string;
          status: DeliveryStatus;
          attempts: number;
          sent_at: Date | null;
          last_error: string | null;
        }>
      >,
      this.dataSource.query(`SELECT count(*) AS total FROM notification_deliveries d ${where}`, params) as Promise<
        Array<{ total: string }>
      >,
    ]);
    return {
      items: rows.map((r) => ({
        id: r.id,
        createdAt: new Date(r.created_at).toISOString(),
        event: r.event_type,
        ticketId: r.ticket_id,
        ticketNumber: r.ticket_number,
        tenant: r.tenant,
        channel: { id: r.channel_id, name: r.channel_name },
        status: r.status,
        attempts: r.attempts,
        sentAt: r.sent_at ? new Date(r.sent_at).toISOString() : null,
        lastError: r.last_error,
      })),
      page,
      pageSize: NOTIFICATION_DELIVERIES_PAGE_SIZE,
      total: Number(count?.total ?? 0),
    };
  }

  /** Kirim ulang kiriman yang gagal: kembali ke antrean dengan batas 24 jam yang baru. */
  async retry(id: string): Promise<void> {
    const [, count] = (await this.dataSource.query(
      `UPDATE notification_deliveries
       SET status = 'menunggu', next_attempt_at = now(), expires_at = now() + interval '24 hours',
           locked_until = NULL, attempts = 0
       WHERE id = $1 AND status = 'gagal'`,
      [id],
    )) as [unknown, number];
    if (count === 0) {
      const [exists] = (await this.dataSource.query('SELECT status FROM notification_deliveries WHERE id = $1', [id])) as Array<{
        status: DeliveryStatus;
      }>;
      if (!exists) throw new NotFoundException({ statusCode: HttpStatus.NOT_FOUND, message: 'Kiriman tidak ditemukan.' });
      throw new ConflictException({ statusCode: HttpStatus.CONFLICT, message: 'Hanya kiriman yang gagal yang bisa dikirim ulang.' });
    }
    this.worker.kick();
  }

  private requireBot(): TelegramClient {
    if (!this.telegram) {
      throw new ConflictException({
        statusCode: HttpStatus.CONFLICT,
        message: 'Token bot Telegram belum dipasang di server (TELEGRAM_BOT_TOKEN).',
      });
    }
    return this.telegram;
  }

  private async botStatus(): Promise<NotificationSettingsResponse['bot']> {
    if (!this.telegram) return { configured: false, username: null, error: null };
    if (this.bot && Date.now() - this.bot.at < BOT_CACHE_MS) return this.bot.value;
    let value: NotificationSettingsResponse['bot'];
    try {
      const me = await this.telegram.getMe();
      value = { configured: true, username: me.username, error: null };
    } catch (error) {
      value = {
        configured: true,
        username: null,
        error: error instanceof TelegramError ? error.message : 'Telegram tidak bisa dihubungi.',
      };
    }
    this.bot = { at: Date.now(), value };
    return value;
  }

  private async channel(id: string): Promise<TelegramChannel> {
    const [channel] = await this.channels(id);
    if (!channel) throw channelNotFound();
    return channel;
  }

  private async channels(id?: string): Promise<TelegramChannel[]> {
    const rows = (await this.dataSource.query(
      `SELECT c.id, c.name, c.chat_id, c.thread_id, c.events, c.all_tenants, c.active,
              (SELECT json_agg(json_build_object('id', t.id, 'code', t.code, 'name', t.name) ORDER BY t.name)
                 FROM notification_channel_tenants ct JOIN tenants t ON t.id = ct.tenant_id
                 WHERE ct.channel_id = c.id) AS tenants,
              s.last_sent_at, f.last_error, f.last_attempt_at AS last_error_at,
              (SELECT count(*) FROM notification_deliveries w
                 WHERE w.channel_id = c.id AND w.status IN ('menunggu', 'mengirim')) AS waiting
       FROM notification_channels c
       LEFT JOIN LATERAL (
         SELECT max(d.sent_at) AS last_sent_at FROM notification_deliveries d
         WHERE d.channel_id = c.id AND d.status = 'terkirim'
       ) s ON true
       LEFT JOIN LATERAL (
         SELECT d.last_error, d.last_attempt_at FROM notification_deliveries d
         WHERE d.channel_id = c.id AND d.last_error IS NOT NULL AND d.status IN ('menunggu', 'gagal')
           AND d.last_attempt_at > now() - interval '24 hours'
           AND d.last_attempt_at > coalesce(s.last_sent_at, '-infinity')
         ORDER BY d.last_attempt_at DESC LIMIT 1
       ) f ON true
       ${id ? 'WHERE c.id = $1' : ''}
       ORDER BY lower(c.name)`,
      id ? [id] : [],
    )) as ChannelRow[];
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      chatId: r.chat_id,
      threadId: r.thread_id,
      events: r.events,
      allTenants: r.all_tenants,
      tenants: r.tenants ?? [],
      active: r.active,
      lastSentAt: r.last_sent_at ? new Date(r.last_sent_at).toISOString() : null,
      lastError: r.last_error && r.last_error_at ? { at: new Date(r.last_error_at).toISOString(), message: r.last_error } : null,
      waiting: Number(r.waiting),
    }));
  }

  /** Simpan pengaturan; nama atau tujuan kembar dijawab dengan kolom yang bermasalah. */
  private async save<T>(actor: Actor, work: (m: EntityManager) => Promise<T>): Promise<T> {
    try {
      return await withActor(this.dataSource, actor, work);
    } catch (error) {
      const constraint = error instanceof QueryFailedError ? (error.driverError as { code?: string; constraint?: string }) : undefined;
      if (constraint?.code === UNIQUE_VIOLATION && constraint.constraint === 'notification_channels_name_key') {
        throw invalid('Nama ini sudah dipakai grup lain.', 'name');
      }
      if (constraint?.code === UNIQUE_VIOLATION && constraint.constraint === 'notification_channels_target_key') {
        throw invalid('Grup (dan topik) ini sudah terdaftar.', 'chatId');
      }
      if (constraint?.code === '23503' && constraint.constraint === 'notification_channel_tenants_tenant_fkey') {
        throw invalid('Customer tidak ditemukan.', 'tenantIds');
      }
      throw error;
    }
  }
}

async function setTenants(m: EntityManager, channelId: string, tenantIds: string[]): Promise<void> {
  if (tenantIds.length === 0) return;
  await m.query(
    'INSERT INTO notification_channel_tenants (channel_id, tenant_id) SELECT $1, unnest($2::uuid[])',
    [channelId, tenantIds],
  );
}

function channelNotFound(): NotFoundException {
  return new NotFoundException({ statusCode: HttpStatus.NOT_FOUND, message: 'Grup penerima tidak ditemukan.' });
}
