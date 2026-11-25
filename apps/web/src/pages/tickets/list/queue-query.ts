import type { TicketQueueFilter } from '@npr/shared';
import type { LocationQuery, RouteLocationRaw } from 'vue-router';

// Saringan antrean NPR di dua bentuk: parameter `GET /api/tickets` (TicketQueueFilter) dan
// alamat halaman Tiket (nama Indonesia, bisa dibagikan). Overview (2.1) membuat tautan dari
// saringan yang dikirim API bersama setiap angka; halaman Tiket membaca alamat kembali ke
// parameter yang sama, jadi daftar yang terbuka berisi jumlah yang sama persis.

/** Parameter API → kunci alamat halaman Tiket. */
export const QUEUE_PAGE_KEYS = {
  view: 'view',
  tenantId: 'customer',
  categoryId: 'kategori',
  categoryName: 'kategoriNama',
  systemId: 'system',
  status: 'status',
  remoteId: 'remote',
  region: 'wilayah',
  q: 'q',
  createdFrom: 'dibuatDari',
  createdTo: 'dibuatSampai',
  closedFrom: 'ditutupDari',
  closedTo: 'ditutupSampai',
} as const satisfies Record<keyof TicketQueueFilter, string>;

export type QueueApiKey = keyof typeof QUEUE_PAGE_KEYS;
export type QueuePageKey = (typeof QUEUE_PAGE_KEYS)[QueueApiKey];

/** Alamat halaman Tiket untuk saringan antrean (tampilan "Semua terbuka" tidak ditulis). */
export function queueLocation(filter: TicketQueueFilter): RouteLocationRaw {
  const query: Record<string, string> = {};
  for (const [key, value] of Object.entries(filter) as Array<[QueueApiKey, string | undefined]>) {
    if (value && !(key === 'view' && value === 'semua')) query[QUEUE_PAGE_KEYS[key]] = value;
  }
  return { name: 'tiket', query };
}

/** Parameter API dari alamat halaman Tiket; yang kosong tidak ikut. */
export function queueApiParams(query: LocationQuery): Partial<Record<QueueApiKey, string>> {
  const params: Partial<Record<QueueApiKey, string>> = {};
  for (const [key, pageKey] of Object.entries(QUEUE_PAGE_KEYS) as Array<[QueueApiKey, QueuePageKey]>) {
    const value = query[pageKey];
    if (typeof value === 'string' && value !== '') params[key] = value;
  }
  return params;
}
