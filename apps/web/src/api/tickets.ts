import type {
  AddTicketActionRequest,
  AddTicketActionResponse,
  CreateTicketRequest,
  TicketAction,
  TicketActionsResponse,
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

  async actions(id: string): Promise<TicketAction[]> {
    return (await apiRequest<TicketActionsResponse>('GET', `/tickets/${encodeURIComponent(id)}/actions`)).actions;
  },

  /** Satu entri linimasa; lampiran ikut dalam satu kiriman multipart. */
  addAction(id: string, request: AddTicketActionRequest, files: File[]): Promise<AddTicketActionResponse> {
    const form = new FormData();
    form.append('data', JSON.stringify(request));
    for (const file of files) form.append('lampiran', file, file.name);
    return apiRequest<AddTicketActionResponse>('POST', `/tickets/${encodeURIComponent(id)}/actions`, form);
  },

  async setCustomerTicketNumber(id: string, customerTicketNumber: string | null): Promise<TicketDetail> {
    return (
      await apiRequest<TicketResponse>('PATCH', `/tickets/${encodeURIComponent(id)}`, { customerTicketNumber })
    ).ticket;
  },

  attachmentUrl: (id: string) => `/api/attachments/${encodeURIComponent(id)}`,

  /** Tiket yang belum ditutup pada satu remote. */
  async openForRemote(remoteId: string): Promise<TicketSummary[]> {
    return (await apiRequest<OpenTicketsResponse>('GET', `/remotes/${encodeURIComponent(remoteId)}/open-tickets`))
      .tickets;
  },
};
