import type { LoginRequest, SessionUser } from '@tyio/shared';
import { defineStore } from 'pinia';
import { ref } from 'vue';
import { authApi } from '../api/auth';

export const useAuthStore = defineStore('auth', () => {
  const user = ref<SessionUser | null>(null);
  const loaded = ref(false);
  let loading: Promise<void> | undefined;

  /** Memeriksa sesi ke server sekali; pemanggilan berikutnya memakai hasil yang sama. */
  async function ensureLoaded(): Promise<void> {
    if (loaded.value) return;
    loading ??= authApi
      .me()
      // Server tidak terjangkau: perlakukan sebagai belum masuk; halaman masuk menampilkan galatnya.
      .catch(() => null)
      .then((current) => {
        user.value = current;
        loaded.value = true;
      });
    await loading;
  }

  async function login(request: LoginRequest): Promise<void> {
    user.value = (await authApi.login(request)).user;
    loaded.value = true;
  }

  async function logout(): Promise<void> {
    try {
      await authApi.logout();
    } finally {
      user.value = null;
    }
  }

  return { user, ensureLoaded, login, logout };
});
