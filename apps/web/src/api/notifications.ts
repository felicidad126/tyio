import type {
  DeliveryStatus,
  NotificationDeliveriesResponse,
  NotificationSettingsResponse,
  TelegramChannel,
  TelegramChannelInput,
  TelegramChannelResponse,
  TelegramChatCandidate,
  TelegramChatsResponse,
} from '@tyio/shared';
import { apiRequest } from './client';

const base = '/admin/notifications';

/** Admin › Notifikasi (R5): grup Telegram penerima dan log pengiriman. */
export const notificationsApi = {
  settings: () => apiRequest<NotificationSettingsResponse>('GET', base),

  async create(input: TelegramChannelInput): Promise<TelegramChannel> {
    return (await apiRequest<TelegramChannelResponse>('POST', `${base}/channels`, input)).channel;
  },

  async update(id: string, input: TelegramChannelInput): Promise<TelegramChannel> {
    return (await apiRequest<TelegramChannelResponse>('PATCH', `${base}/channels/${id}`, input)).channel;
  },

  remove: (id: string) => apiRequest<void>('DELETE', `${base}/channels/${id}`),

  test: (id: string) => apiRequest<{ ok: true }>('POST', `${base}/channels/${id}/test`),

  async chats(): Promise<TelegramChatCandidate[]> {
    return (await apiRequest<TelegramChatsResponse>('GET', `${base}/chats`)).chats;
  },

  deliveries(query: { status?: DeliveryStatus; page?: number }): Promise<NotificationDeliveriesResponse> {
    const params = new URLSearchParams();
    if (query.status) params.set('status', query.status);
    if (query.page && query.page > 1) params.set('page', String(query.page));
    const search = params.toString();
    return apiRequest<NotificationDeliveriesResponse>('GET', `${base}/deliveries${search ? `?${search}` : ''}`);
  },

  retry: (id: string) => apiRequest<void>('POST', `${base}/deliveries/${id}/retry`),
};
