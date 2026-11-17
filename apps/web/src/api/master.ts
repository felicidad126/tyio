import type {
  CreateMasterItemRequest,
  MasterItem,
  MasterItemResponse,
  MasterList,
  MasterListResponse,
  UpdateMasterItemRequest,
} from '@tyio/shared';
import { apiRequest } from './client';

const base = (list: MasterList) => `/admin/master/${list}`;

export const masterApi = {
  async list(list: MasterList): Promise<MasterItem[]> {
    return (await apiRequest<MasterListResponse>('GET', base(list))).items;
  },

  async create(list: MasterList, request: CreateMasterItemRequest): Promise<MasterItem> {
    return (await apiRequest<MasterItemResponse>('POST', base(list), request)).item;
  },

  async update(list: MasterList, id: string, request: UpdateMasterItemRequest): Promise<MasterItem> {
    return (await apiRequest<MasterItemResponse>('PATCH', `${base(list)}/${id}`, request)).item;
  },

  remove: (list: MasterList, id: string) => apiRequest<void>('DELETE', `${base(list)}/${id}`),

  /** Pilihan aktif untuk form dan saringan; bisa dibaca semua peran. */
  async options(list: Exclude<MasterList, 'customer'>): Promise<MasterItem[]> {
    return (await apiRequest<MasterListResponse>('GET', `/master/${list}`)).items;
  },
};
