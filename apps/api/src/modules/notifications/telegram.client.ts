/**
 * Klien kecil Telegram Bot API (https://core.telegram.org/bots/api) untuk notifikasi R5.
 * Token ada di jalur URL; jalur itu tidak pernah ikut di pesan galat atau log.
 */

/** Bagaimana kegagalan ditangani pemanggil. */
export type TelegramFailure =
  /** Gangguan sementara (jaringan, 5xx, 429): coba lagi nanti. */
  | 'retry'
  /** Ditolak untuk chat ini (chat tidak ada, bot dikeluarkan, tanpa izin): tidak dicoba lagi. */
  | 'permanent'
  /** Token ditolak: semua kiriman tertahan sampai token diperbaiki. */
  | 'unauthorized'
  /** Grup ditingkatkan menjadi supergroup dengan ID baru (`migrateToChatId`). */
  | 'migrated';

export class TelegramError extends Error {
  constructor(
    readonly failure: TelegramFailure,
    message: string,
    readonly retryAfterMs?: number,
    readonly migrateToChatId?: string,
  ) {
    super(message);
    this.name = 'TelegramError';
  }
}

export interface TelegramChat {
  id: number;
  type: 'private' | 'group' | 'supergroup' | 'channel';
  title?: string;
  username?: string;
  first_name?: string;
}

interface TelegramUpdate {
  update_id: number;
  message?: { chat: TelegramChat };
  channel_post?: { chat: TelegramChat };
  my_chat_member?: { chat: TelegramChat; new_chat_member?: { status?: string } };
}

interface TelegramResponse<T> {
  ok: boolean;
  result?: T;
  error_code?: number;
  description?: string;
  parameters?: { retry_after?: number; migrate_to_chat_id?: number };
}

export interface TelegramSendTarget {
  chatId: string;
  threadId: number | null;
}

export class TelegramClient {
  constructor(
    private readonly apiUrl: string,
    private readonly token: string,
    private readonly timeoutMs = 15_000,
  ) {}

  async sendMessage(target: TelegramSendTarget, html: string): Promise<{ messageId: number }> {
    const result = await this.call<{ message_id: number }>('sendMessage', {
      chat_id: target.chatId,
      ...(target.threadId ? { message_thread_id: target.threadId } : {}),
      text: html,
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
    });
    return { messageId: result.message_id };
  }

  async getMe(): Promise<{ username: string }> {
    const result = await this.call<{ username: string }>('getMe', {});
    return { username: result.username };
  }

  /**
   * Chat yang terlihat bot dalam 24 jam terakhir (bot ditambahkan ke grup, pesan, atau posting
   * kanal). Tanpa `offset`, jadi pembaruan tidak dikonfirmasi dan tetap ada untuk pemanggilan
   * berikutnya.
   */
  async recentChats(): Promise<TelegramChat[]> {
    const updates = await this.call<TelegramUpdate[]>('getUpdates', {
      allowed_updates: ['message', 'channel_post', 'my_chat_member'],
      timeout: 0,
    });
    const chats = new Map<number, TelegramChat>();
    for (const update of updates) {
      const member = update.my_chat_member;
      // Bot yang baru dikeluarkan dari grup tidak bisa mengirim ke sana.
      if (member && ['left', 'kicked'].includes(member.new_chat_member?.status ?? '')) {
        chats.delete(member.chat.id);
        continue;
      }
      const chat = member?.chat ?? update.message?.chat ?? update.channel_post?.chat;
      if (chat) chats.set(chat.id, chat);
    }
    return [...chats.values()];
  }

  private async call<T>(method: string, body: object): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.apiUrl}/bot${this.token}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      throw new TelegramError('retry', `Telegram tidak bisa dihubungi (${networkReason(error)}).`);
    }
    const data = (await res.json().catch(() => null)) as TelegramResponse<T> | null;
    if (res.ok && data?.ok) return data.result as T;
    throw classify(res.status, data);
  }
}

function classify(status: number, data: TelegramResponse<unknown> | null): TelegramError {
  const code = data?.error_code ?? status;
  const description = (data?.description ?? `HTTP ${status}`).slice(0, 300);
  const retryAfter = data?.parameters?.retry_after;
  if (code === 429) {
    return new TelegramError('retry', 'Telegram meminta jeda (batas kirim).', (retryAfter ?? 5) * 1000);
  }
  if (data?.parameters?.migrate_to_chat_id) {
    return new TelegramError(
      'migrated',
      'Grup ditingkatkan menjadi supergroup; ID chat diperbarui.',
      undefined,
      String(data.parameters.migrate_to_chat_id),
    );
  }
  if (code === 401 || code === 404) {
    return new TelegramError('unauthorized', 'Token bot ditolak Telegram. Periksa TELEGRAM_BOT_TOKEN di server.');
  }
  if (code === 400 || code === 403) return new TelegramError('permanent', explain(description));
  return new TelegramError('retry', `Telegram sedang bermasalah (${description}).`);
}

/** Pesan Telegram yang paling sering, dalam bahasa yang bisa langsung ditindaklanjuti. */
function explain(description: string): string {
  const d = description.toLowerCase();
  if (d.includes('chat not found')) {
    return 'Grup tidak ditemukan. Periksa ID chat dan pastikan bot sudah ditambahkan ke grup.';
  }
  if (d.includes('kicked') || d.includes('not a member') || d.includes('bot was blocked')) {
    return 'Bot tidak lagi ada di grup ini. Tambahkan lagi bot ke grup.';
  }
  if (d.includes('not enough rights') || d.includes('have no rights')) {
    return 'Bot tidak boleh mengirim pesan di grup ini. Beri izin kirim pesan untuk bot.';
  }
  if (d.includes('thread not found') || d.includes('topic')) {
    return 'Topik grup tidak ditemukan. Periksa ID topik, atau kosongkan untuk topik umum.';
  }
  if (d.includes("can't parse entities")) {
    return `Isi pesan ditolak Telegram (${description}).`;
  }
  return `Telegram menolak pesan: ${description}`;
}

function networkReason(error: unknown): string {
  if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) return 'waktu habis';
  const cause = (error as { cause?: { code?: string } } | undefined)?.cause?.code;
  return cause ?? 'jaringan';
}
