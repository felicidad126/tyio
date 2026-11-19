import type { SessionUser } from '@tyio/shared';
import { createRouter, createWebHistory } from 'vue-router';
import { setUnauthorizedHandler } from '../api';
import HomePage from '../pages/home/HomePage.vue';
import LoginPage from '../pages/login/LoginPage.vue';
import NotFoundPage from '../pages/not-found/NotFoundPage.vue';
import { ensureSession, forgetSession } from '../session';
import { safeNextPath } from './next-path';

declare module 'vue-router' {
  interface RouteMeta {
    /** Boleh dibuka tanpa login. Semua rute lain wajib login. */
    public?: boolean;
  }
}

// Rute sementara untuk langkah 0.3; layout dan navigasi lengkap menyusul di langkah 0.5.
export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/masuk', name: 'login', component: LoginPage, meta: { public: true } },
    { path: '/', name: 'home', component: HomePage },
    { path: '/:pathMatch(.*)*', name: 'not-found', component: NotFoundPage },
  ],
});

router.beforeEach(async (to) => {
  let user: SessionUser | null;
  try {
    user = await ensureSession();
  } catch {
    user = null; // server tidak terjangkau: halaman login yang menjelaskan saat dicoba
  }

  if (to.name === 'login') return user ? (safeNextPath(to.query.next) ?? '/') : true;
  if (to.meta.public || user) return true;
  return { name: 'login', query: to.fullPath === '/' ? {} : { next: to.fullPath } };
});

setUnauthorizedHandler(() => {
  forgetSession();
  const here = router.currentRoute.value;
  if (!here.meta.public) {
    void router.replace({ name: 'login', query: { next: here.fullPath, sesi: 'berakhir' } });
  }
});
