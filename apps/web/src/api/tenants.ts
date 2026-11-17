import type { TenantListResponse, TenantRef } from '@tyio/shared';
import { apiRequest } from './client';

export const tenantsApi = {
  /** Customer aktif yang boleh dilihat pengguna. */
  async list(): Promise<TenantRef[]> {
    return (await apiRequest<TenantListResponse>('GET', '/tenants')).tenants;
  },
};
