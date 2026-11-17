import type { SearchResponse } from '@tyio/shared';
import { apiRequest } from './client';

export const searchApi = {
  search: (q: string) => apiRequest<SearchResponse>('GET', `/search?q=${encodeURIComponent(q)}`),
};
