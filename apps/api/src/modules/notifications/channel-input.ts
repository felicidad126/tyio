import {
  channelNameError,
  NOTIFICATION_EVENTS,
  type NotificationEvent,
  type TelegramChannelInput,
  telegramChatIdError,
} from '@tyio/shared';
import { invalid } from '../tickets/ticket-input.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEYS = ['name', 'chatId', 'threadId', 'events', 'allTenants', 'tenantIds', 'active'];

/** Isian grup penerima dari form Admin › Notifikasi. Yang tidak sah dijawab 400 dengan kolomnya. */
export function parseChannelInput(body: unknown): TelegramChannelInput {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw invalid('Isian tidak sah.');
  const raw = body as Record<string, unknown>;
  const unknown = Object.keys(raw).find((key) => !KEYS.includes(key));
  if (unknown) throw invalid(`Kolom tidak dikenal: ${unknown}.`);

  const name = typeof raw.name === 'string' ? raw.name.trim().replace(/\s+/g, ' ') : '';
  const nameError = channelNameError(name);
  if (nameError) throw invalid(nameError, 'name');

  const chatId = typeof raw.chatId === 'string' ? raw.chatId.trim() : '';
  const chatError = telegramChatIdError(chatId);
  if (chatError) throw invalid(chatError, 'chatId');

  let threadId: number | null = null;
  if (raw.threadId !== undefined && raw.threadId !== null && raw.threadId !== '') {
    if (typeof raw.threadId !== 'number' || !Number.isInteger(raw.threadId) || raw.threadId < 1 || raw.threadId > 2_147_483_647) {
      throw invalid('ID topik berupa angka bulat positif, atau kosongkan untuk topik umum.', 'threadId');
    }
    threadId = raw.threadId;
  }

  if (!Array.isArray(raw.events) || !raw.events.every((e) => NOTIFICATION_EVENTS.includes(e as NotificationEvent))) {
    throw invalid('Kejadian tidak dikenal.', 'events');
  }
  const events = NOTIFICATION_EVENTS.filter((e) => (raw.events as unknown[]).includes(e));
  if (events.length === 0) throw invalid('Pilih minimal satu kejadian.', 'events');

  if (typeof raw.allTenants !== 'boolean') throw invalid('Pilih semua customer atau customer tertentu.', 'tenantIds');
  if (!Array.isArray(raw.tenantIds) || !raw.tenantIds.every((id) => typeof id === 'string' && UUID.test(id))) {
    throw invalid('Customer tidak sah.', 'tenantIds');
  }
  const tenantIds = raw.allTenants ? [] : [...new Set(raw.tenantIds as string[])];
  if (!raw.allTenants && tenantIds.length === 0) {
    throw invalid('Pilih minimal satu customer, atau Semua customer.', 'tenantIds');
  }

  if (typeof raw.active !== 'boolean') throw invalid('Status aktif tidak sah.', 'active');
  return { name, chatId, threadId, events, allTenants: raw.allTenants, tenantIds, active: raw.active };
}
