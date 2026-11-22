import type {
  CreateTicket,
  CreateTicketAction,
  MasterValue,
  OpenTicketsConflict,
  RemoteDetail,
  RemotePage,
  TicketAction,
  TicketDetail,
  TicketSummary,
  TicketTimeline,
} from '@tyio/shared';
import { ApiError, apiMultipart, apiRequest } from '../../api';

// Panggilan API NPR (langkah 1.3) dan linimasanya (1.4). Cakupan customer diperiksa server.

const enc = encodeURIComponent;

export const ticketApi = {
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
