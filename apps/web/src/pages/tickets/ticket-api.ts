import type {
  CreateTicket,
  MasterValue,
  OpenTicketsConflict,
  RemoteDetail,
  RemotePage,
  TicketDetail,
  TicketSummary,
} from '@tyio/shared';
import { ApiError, apiRequest } from '../../api';

// Panggilan API NPR (langkah 1.3). Cakupan customer diperiksa server.

const enc = encodeURIComponent;

export const ticketApi = {
  create: (input: CreateTicket) => apiRequest<TicketDetail>('POST', '/tickets', input),
  get: (id: string) => apiRequest<TicketDetail>('GET', `/tickets/${enc(id)}`),
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
