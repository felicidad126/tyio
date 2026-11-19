import type { LoginRequest, SessionUser } from '@tyio/shared';
import { readonly, shallowRef } from 'vue';
import { ApiError, apiRequest } from './api';

// Pengguna yang sedang login. Sumber kebenarannya sesi di server; di sini hanya salinan
// untuk tampilan. Dipindah ke store Pinia saat kerangka aplikasi dibangun (langkah 0.5).

const current = shallowRef<SessionUser | null>(null);
let loading: Promise<SessionUser | null> | undefined;

export const sessionUser = readonly(current);

/** Memuat pengguna dari sesi sekali; berikutnya memakai hasil yang sama. */
export function ensureSession(): Promise<SessionUser | null> {
  loading ??= apiRequest<SessionUser>('GET', '/auth/me', undefined, { handleUnauthorized: false })
    .then((user) => (current.value = user))
    .catch((error: unknown) => {
      if (error instanceof ApiError && error.status === 401) return (current.value = null);
      loading = undefined; // server tidak terjangkau: coba lagi di navigasi berikutnya
      throw error;
    });
  return loading;
}

export async function login(input: LoginRequest): Promise<SessionUser> {
  const user = await apiRequest<SessionUser>('POST', '/auth/login', input, {
    handleUnauthorized: false,
  });
  current.value = user;
  loading = Promise.resolve(user);
  return user;
}

export async function logout(): Promise<void> {
  await apiRequest<void>('POST', '/auth/logout');
  forgetSession();
}

/** Sesi sudah berakhir di server; lupakan salinan lokalnya. */
export function forgetSession(): void {
  current.value = null;
  loading = Promise.resolve(null);
}
