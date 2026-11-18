import type { TenantRef } from './auth.js';

/**
 * Notifikasi (R5): kejadian tiket yang dikirim ke grup Telegram. Setiap grup memilih kejadian
 * dan customer yang diterimanya; satu kejadian dikirim sekali ke setiap grup yang cocok.
 */
export const NOTIFICATION_EVENTS = ['npr_baru', 'tt_dibuka', 'npr_selesai', 'npr_dibuka_lagi'] as const;
export type NotificationEvent = (typeof NOTIFICATION_EVENTS)[number];

export const NOTIFICATION_EVENT_LABELS: Readonly<Record<NotificationEvent, string>> = {
  npr_baru: 'NPR baru',
  tt_dibuka: 'TT dibuka (Eskalasi To SD)',
  npr_selesai: 'NPR Selesai (Close)',
  npr_dibuka_lagi: 'NPR dibuka lagi',
};

/** Penjelasan singkat tiap kejadian untuk form pengaturan. */
export const NOTIFICATION_EVENT_HINTS: Readonly<Record<NotificationEvent, string>> = {
  npr_baru: 'Nomor NPR, customer, remote, kategori, waktu kejadian, dan masalah.',
  tt_dibuka: 'Ringkasan TT untuk Service Delivery: remote, lokasi, jaringan, problem, dan kontak PIC.',
  npr_selesai: 'Waktu online lagi, lama gangguan, catatan penyelesaian, dan part yang diganti.',
  npr_dibuka_lagi: 'NPR yang sudah Selesai diubah kembali ke Dikerjakan.',
};

/** Kejadian yang dipilih saat grup baru ditambahkan. */
export const DEFAULT_NOTIFICATION_EVENTS: readonly NotificationEvent[] = ['npr_baru', 'tt_dibuka', 'npr_selesai'];

export const DELIVERY_STATUSES = ['menunggu', 'mengirim', 'terkirim', 'gagal'] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];
export const DELIVERY_STATUS_LABELS: Readonly<Record<DeliveryStatus, string>> = {
  menunggu: 'Menunggu',
  mengirim: 'Sedang dikirim',
  terkirim: 'Terkirim',
  gagal: 'Gagal',
};

/** Notifikasi yang belum terkirim setelah selama ini tidak dikirim lagi (kedaluwarsa). */
export const DELIVERY_EXPIRY_HOURS = 24;

export const CHANNEL_NAME_MAX = 80;

/** Grup (atau topik grup) Telegram penerima notifikasi. */
export interface TelegramChannel {
  id: string;
  name: string;
  /** ID chat Telegram, mis. "-1001234567890", atau "@namakanal". */
  chatId: string;
  /** Topik di grup forum; null = topik umum. */
  threadId: number | null;
  events: NotificationEvent[];
  /** true: semua customer, termasuk yang ditambahkan kemudian. */
  allTenants: boolean;
  tenants: TenantRef[];
  active: boolean;
  /** Pengiriman terakhir yang berhasil dan kegagalan terakhir (24 jam terakhir). */
  lastSentAt: string | null;
  lastError: { at: string; message: string } | null;
  /** Notifikasi yang masih menunggu dikirim ke grup ini. */
  waiting: number;
}

export interface TelegramChannelInput {
  name: string;
  chatId: string;
  threadId?: number | null;
  events: NotificationEvent[];
  allTenants: boolean;
  tenantIds: string[];
  active: boolean;
}

export interface NotificationSettingsResponse {
  bot: {
    /** Token bot terpasang di server (TELEGRAM_BOT_TOKEN). */
    configured: boolean;
    /** Nama pengguna bot dari Telegram, mis. "noc_portal_bot"; null bila belum diketahui. */
    username: string | null;
    /** Pesan bila Telegram tidak bisa dihubungi atau menolak token. */
    error: string | null;
  };
  /** Alamat portal untuk tautan di pesan (PUBLIC_URL); null = pesan tanpa tautan. */
  publicUrl: string | null;
  channels: TelegramChannel[];
}

export interface TelegramChannelResponse {
  channel: TelegramChannel;
}

/** Chat yang baru-baru ini terlihat oleh bot (bot ditambahkan ke grup, atau ada pesan). */
export interface TelegramChatCandidate {
  chatId: string;
  title: string;
  type: 'group' | 'supergroup' | 'channel' | 'private';
  /** Sudah dipakai salah satu grup penerima. */
  used: boolean;
}

export interface TelegramChatsResponse {
  chats: TelegramChatCandidate[];
}

export interface NotificationTestResponse {
  ok: true;
}

export interface NotificationDeliveryRow {
  id: string;
  createdAt: string;
  event: NotificationEvent;
  ticketId: string;
  ticketNumber: string;
  tenant: string;
  channel: { id: string; name: string };
  status: DeliveryStatus;
  attempts: number;
  sentAt: string | null;
  lastError: string | null;
}

export interface NotificationDeliveriesResponse {
  items: NotificationDeliveryRow[];
  page: number;
  pageSize: number;
  total: number;
}

export const NOTIFICATION_DELIVERIES_PAGE_SIZE = 50;

const CHAT_ID = /^(-?\d{1,20}|@[A-Za-z][A-Za-z0-9_]{4,31})$/;

/** Pesan galat untuk ID chat Telegram; kosong bila sah. */
export function telegramChatIdError(value: string): string {
  if (!value) return 'Isi ID chat grup Telegram.';
  if (!CHAT_ID.test(value)) {
    return 'ID chat berupa angka (grup biasanya diawali -100…) atau @namakanal.';
  }
  return '';
}

/** Pesan galat untuk nama grup penerima; kosong bila sah. */
export function channelNameError(value: string): string {
  if (!value) return 'Isi nama grup, mis. "NOC Shift" atau "Service Delivery".';
  if (value.length > CHANNEL_NAME_MAX) return `Nama paling panjang ${CHANNEL_NAME_MAX} karakter.`;
  return '';
}
