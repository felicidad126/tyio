import {
  type MasterValue,
  type RemoteDetail,
  type RemoteImportReport,
  type RemoteMap,
  type RemotePage,
  type TenantSummary,
  XLSX_MIME,
} from '@npr/shared';
import { apiRequest, apiUpload } from '../../api';

// Panggilan API halaman remote (langkah 1.2). Cakupan customer dan peran diperiksa server.

export interface RemoteQuery {
  q?: string;
  tenantId?: string;
  networkId?: string;
  active?: 'true' | 'false';
  hasCoordinates?: 'true' | 'false';
  page?: number;
}

/** Saringan peta remote (langkah 2.3): sama dengan daftar, tanpa halaman. */
export type RemoteMapQuery = Omit<RemoteQuery, 'page' | 'hasCoordinates'>;

function toParams(query: object): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  return params.toString();
}

export const remoteApi = {
  list: (query: RemoteQuery) => apiRequest<RemotePage>('GET', `/remotes?${toParams(query)}`),
  map: (query: RemoteMapQuery) => apiRequest<RemoteMap>('GET', `/remote-map?${toParams(query)}`),
  get: (id: string) => apiRequest<RemoteDetail>('GET', `/remotes/${encodeURIComponent(id)}`),
  customers: () => apiRequest<TenantSummary[]>('GET', '/tenants'),
  networks: (tenantId: string) =>
    apiRequest<MasterValue[]>('GET', `/master/jarkom?tenantId=${encodeURIComponent(tenantId)}`),
  importFile: (tenantId: string, file: Blob, mode: 'preview' | 'save') =>
    apiUpload<RemoteImportReport>(
      `/remote-import?tenantId=${encodeURIComponent(tenantId)}&mode=${mode}`,
      file,
      XLSX_MIME,
    ),
};

export const TEMPLATE_URL = '/api/remote-import/template';
