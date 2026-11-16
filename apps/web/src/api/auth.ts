import type { LoginRequest, SessionResponse, SessionUser } from '@tyio/shared';
import { ApiError, apiRequest } from './client';

export const authApi = {
  login: (request: LoginRequest) => apiRequest<SessionResponse>('POST', '/auth/login', request),

  logout: () => apiRequest<void>('POST', '/auth/logout'),

  /** Pengguna sesi saat ini, atau null bila belum masuk. */
  async me(): Promise<SessionUser | null> {
    try {
      return (await apiRequest<SessionResponse>('GET', '/auth/me')).user;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return null;
      throw error;
    }
  },
};
