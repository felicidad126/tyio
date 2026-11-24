import type {
  CloseTicket,
  CloseTroubleTicket,
  CreateTicket,
  CreateTicketAction,
  CreateTroubleTicket,
  GlobalSearchResult,
  MasterValue,
  OpenTicketsConflict,
  RemoteDetail,
  RemotePage,
  RemoteTicketHistoryPage,
  TicketAction,
  TicketDetail,
  TicketQueuePage,
  TicketSummary,
  TicketTimeline,
  TroubleTicketCopied,
  TroubleTicketPage,
} from '@tyio/shared';
import { ApiError, apiMultipart, apiRequest } from '../../api';
import type { QueueApiKey } from './list/queue-query';

// Panggilan API NPR (langkah 1.3), linimasanya (1.4), TT (1.5b), dan penutupan (1.6).
// Cakupan customer dan aturan peran diperiksa server.

const enc = encodeURIComponent;

/** Parameter antrean `GET /api/tickets`; yang kosong tidak dikirim. */
export type TicketQueueQuery = Partial<Record<QueueApiKey | 'sort' | 'page' | 'pageSize', string>>;

export const ticketApi = {
  list: (query: TicketQueueQuery) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) if (value) params.set(key, value);
    return apiRequest<TicketQueuePage>('GET', `/tickets?${params.toString()}`);
  },
  /** "Ambil": `expectedAssigneeId` = penanggung yang terlihat di layar. */
  take: (id: string, expectedAssigneeId: string | null) =>
    apiRequest<TicketTimeline>('POST', `/tickets/${enc(id)}/take`, { expectedAssigneeId }),
  createTroubleTicket: (ticketId: string, input: CreateTroubleTicket) =>
    apiRequest<TicketTimeline>('POST', `/tickets/${enc(ticketId)}/trouble-tickets`, input),
  troubleTickets: (query: Partial<Record<'tenantId' | 'q' | 'page', string>>) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) if (value) params.set(key, value);
    return apiRequest<TroubleTicketPage>('GET', `/trouble-tickets?${params.toString()}`);
  },
  /** "Tutup NPR" (1.6): penyebab dari daftar tetap dan penyelesaian (T98). */
  close: (id: string, input: CloseTicket) => apiRequest<TicketTimeline>('POST', `/tickets/${enc(id)}/close`, input),
  /** Tutup TT (L2/admin, K21) dengan hasil kunjungan / penyelesaian (T100). */
  closeTroubleTicket: (id: string, input: CloseTroubleTicket) =>
    apiRequest<TicketTimeline>('POST', `/trouble-tickets/${enc(id)}/close`, input),
  /** Riwayat semua NPR sebuah remote (T101). */
  remoteHistory: (remoteId: string, page: number) =>
    apiRequest<RemoteTicketHistoryPage>('GET', `/remotes/${enc(remoteId)}/tickets?page=${page}`),
  /** Dicatat setelah ringkasan TT berhasil disalin ke clipboard (K25). */
  troubleTicketCopied: (id: string) => apiRequest<TroubleTicketCopied>('POST', `/trouble-tickets/${enc(id)}/copied`),
  search: (q: string) => apiRequest<GlobalSearchResult>('GET', `/search?q=${enc(q)}`),
  customers: () => apiRequest<Array<{ id: string; name: string; code: string }>>('GET', '/tenants'),
  create: (input: CreateTicket) => apiRequest<TicketDetail>('POST', '/tickets', input),
  get: (id: string) => apiRequest<TicketDetail>('GET', `/tickets/${enc(id)}`),
  actions: (id: string) => apiRequest<TicketAction[]>('GET', `/tickets/${enc(id)}/actions`),
  /** Tambah tindakan; dengan lampiran dikirim multipart (bagian `data` + `lampiran`). */
  addAction: (id: string, input: CreateTicketAction, files: File[] = []) => {
    if (files.length === 0) return apiRequest<TicketTimeline>('POST', `/tickets/${enc(id)}/actions`, input);
    const form = new FormData();
    form.append('data', JSON.stringify(input));
    for (const file of files) form.append('lampiran', file, file.name);
    return apiMultipart<TicketTimeline>(`/tickets/${enc(id)}/actions`, form);
  },
  openTicketsOf: (remoteId: string) => apiRequest<TicketSummary[]>('GET', `/remotes/${enc(remoteId)}/open-tickets`),
  /** Remote aktif yang cocok dengan kata kunci, untuk dipilih di formulir. */
  searchRemotes: (q: string) =>
    apiRequest<RemotePage>('GET', `/remotes?${new URLSearchParams({ q, active: 'true', pageSize: '8' }).toString()}`),
  remote: (id: string) => apiRequest<RemoteDetail>('GET', `/remotes/${enc(id)}`),
  categories: (tenantId: string) => apiRequest<MasterValue[]>('GET', `/master/kategori?tenantId=${enc(tenantId)}`),
  systems: (tenantId: string) => apiRequest<MasterValue[]>('GET', `/master/system?tenantId=${enc(tenantId)}`),
};

/** NPR terbuka dari jawaban 409 `POST /tickets`, atau `null` bila galatnya lain. */
export function openTicketsFromError(cause: unknown): TicketSummary[] | null {
  if (!(cause instanceof ApiError) || cause.status !== 409) return null;
  const tickets = (cause.data as Partial<OpenTicketsConflict> | undefined)?.openTickets;
  return Array.isArray(tickets) ? tickets : null;
}
