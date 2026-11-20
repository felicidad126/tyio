import type {
  CreateCustomer,
  CreateMasterValue,
  CustomerRecord,
  MasterKind,
  MasterValue,
  TenantSummary,
  UpdateCustomer,
  UpdateMasterValue,
} from '@tyio/shared';
import { apiRequest } from '../../../api';

// Panggilan API halaman data master (langkah 1.1). API tetap penjaga yang sebenarnya:
// cakupan customer dan peran diperiksa di server.

export const masterApi = {
  /** Customer aktif yang boleh dipilih pengguna (untuk menambah nilai master). */
  activeCustomers: () => apiRequest<TenantSummary[]>('GET', '/tenants'),

  listValues: (kind: MasterKind, tenantId: string) =>
    apiRequest<MasterValue[]>('GET', `/master/${kind}?tenantId=${encodeURIComponent(tenantId)}`),
  createValue: (kind: MasterKind, input: CreateMasterValue) =>
    apiRequest<MasterValue>('POST', `/master/${kind}`, input),
  updateValue: (kind: MasterKind, id: string, patch: UpdateMasterValue) =>
    apiRequest<MasterValue>('PATCH', `/master/${kind}/${id}`, patch),
  deleteValue: (kind: MasterKind, id: string) => apiRequest<void>('DELETE', `/master/${kind}/${id}`),

  listCustomers: () => apiRequest<CustomerRecord[]>('GET', '/master/customer'),
  createCustomer: (input: CreateCustomer) => apiRequest<CustomerRecord>('POST', '/master/customer', input),
  updateCustomer: (id: string, patch: UpdateCustomer) =>
    apiRequest<CustomerRecord>('PATCH', `/master/customer/${id}`, patch),
  deleteCustomer: (id: string) => apiRequest<void>('DELETE', `/master/customer/${id}`),
};

/** Pesan galat yang aman ditampilkan (ApiError sudah berbahasa Indonesia). */
export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Terjadi kesalahan. Coba lagi.';
}
