import type { MapResponse, MapStatesResponse } from '@tyio/shared';
import { apiRequest } from './client';

export const mapApi = {
  get(): Promise<MapResponse> {
    return apiRequest<MapResponse>('GET', '/map');
  },

  /** Kondisi terkini saja (kecil), untuk pembaruan langsung. */
  states(): Promise<MapStatesResponse> {
    return apiRequest<MapStatesResponse>('GET', '/map/states');
  },
};
