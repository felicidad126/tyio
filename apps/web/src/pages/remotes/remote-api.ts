import {
  type MasterValue,
  type RemoteDetail,
  type RemoteImportReport,
  type RemotePage,
  type TenantSummary,
  XLSX_MIME,
} from '@tyio/shared';
import { apiRequest, apiUpload } from '../../api';

// Panggilan API halaman remote (langkah 1.2). Cakupan customer dan peran diperiksa server.

export interface RemoteQuery {
  q?: string;
  tenantId?: string;
  networkId?: string;
  active?: 'true' | 'false';
  page?: number;
}

export const remoteApi = {
  list(query: RemoteQuery) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== '') params.set(key, String(value));
    }
    return apiRequest<RemotePage>('GET', `/remotes?${params.toString()}`);
  },
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
