import type { OverviewResponse } from '@tyio/shared';
import { apiRequest } from './client';

export const overviewApi = {
  get(): Promise<OverviewResponse> {
    return apiRequest<OverviewResponse>('GET', '/overview');
  },
};
