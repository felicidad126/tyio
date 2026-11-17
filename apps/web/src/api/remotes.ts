import type {
  RemoteDetail,
  RemoteImportRequest,
  RemoteImportResult,
  RemoteListQuery,
  RemoteListResponse,
  RemoteResponse,
} from '@tyio/shared';
import { apiRequest } from './client';

export const remotesApi = {
  list(query: RemoteListQuery): Promise<RemoteListResponse> {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== '') params.set(key, String(value));
    }
    const search = params.toString();
    return apiRequest<RemoteListResponse>('GET', `/remotes${search ? `?${search}` : ''}`);
  },

  async get(id: string): Promise<RemoteDetail> {
    return (await apiRequest<RemoteResponse>('GET', `/remotes/${encodeURIComponent(id)}`)).remote;
  },

  import: (request: RemoteImportRequest) =>
    apiRequest<RemoteImportResult>('POST', '/admin/remotes/import', request),
};
