import type { LoginRequest, SessionUser } from '@tyio/shared';
import { defineStore } from 'pinia';
import { computed, shallowRef } from 'vue';
import { ApiError, apiRequest } from '../api';

// Pengguna yang sedang login. Sumber kebenarannya sesi di server (cookie HttpOnly);
// di sini hanya salinan untuk tampilan dan penjaga rute.
export const useSessionStore = defineStore('session', () => {
  const user = shallowRef<SessionUser | null>(null);
  let loading: Promise<SessionUser | null> | undefined;

  const initials = computed(() =>
    (user.value?.name ?? '')
      .split(/\s+/)
      .filter((part) => /\p{L}/u.test(part))
      .slice(0, 2)
      .map((part) => part.charAt(0).toLocaleUpperCase('id'))
      .join(''),
  );

  /** Memuat pengguna dari sesi sekali; berikutnya memakai hasil yang sama. */
  function ensure(): Promise<SessionUser | null> {
    loading ??= apiRequest<SessionUser>('GET', '/auth/me', undefined, { handleUnauthorized: false })
      .then((loaded) => (user.value = loaded))
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 401) return (user.value = null);
        loading = undefined; // server tidak terjangkau: coba lagi di navigasi berikutnya
        throw error;
      });
    return loading;
  }

  async function login(input: LoginRequest): Promise<SessionUser> {
    const loggedIn = await apiRequest<SessionUser>('POST', '/auth/login', input, {
      handleUnauthorized: false,
    });
    user.value = loggedIn;
    loading = Promise.resolve(loggedIn);
    return loggedIn;
  }

  async function logout(): Promise<void> {
    await apiRequest<void>('POST', '/auth/logout');
    forget();
  }

  /** Sesi sudah berakhir di server; lupakan salinan lokalnya. */
  function forget(): void {
    user.value = null;
    loading = Promise.resolve(null);
  }

  return { user, initials, ensure, login, logout, forget };
});
