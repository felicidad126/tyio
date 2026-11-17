import type {
  CreateTicketRequest,
  OpenTicketsResponse,
  TicketDetail,
  TicketResponse,
  TicketSummary,
} from '@tyio/shared';
import { apiRequest } from './client';

export const ticketsApi = {
  async create(request: CreateTicketRequest): Promise<TicketDetail> {
    return (await apiRequest<TicketResponse>('POST', '/tickets', request)).ticket;
  },

  async get(id: string): Promise<TicketDetail> {
    return (await apiRequest<TicketResponse>('GET', `/tickets/${encodeURIComponent(id)}`)).ticket;
  },

  /** Tiket yang belum ditutup pada satu remote. */
  async openForRemote(remoteId: string): Promise<TicketSummary[]> {
    return (await apiRequest<OpenTicketsResponse>('GET', `/remotes/${encodeURIComponent(remoteId)}/open-tickets`))
      .tickets;
  },
};
