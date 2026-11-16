import { APP_NAME } from '@tyio/shared';
import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { safeRedirectTarget } from './safe-redirect';

declare module 'vue-router' {
  interface RouteMeta {
    /** Boleh dibuka tanpa masuk. */
    public?: boolean;
    title?: string;
  }
}

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('../pages/login/LoginPage.vue'),
      meta: { public: true, title: 'Masuk' },
    },
    {
      path: '/',
      name: 'home',
      component: () => import('../pages/home/HomePage.vue'),
      meta: { title: 'Beranda' },
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: () => import('../pages/NotFoundPage.vue'),
      meta: { title: 'Halaman tidak ditemukan' },
    },
  ],
});

// Halaman yang butuh login mengarah ke /login dengan tujuan asli di `next`.
// Penegakan sebenarnya ada di API; penjaga ini hanya mengatur alur layar.
router.beforeEach(async (to) => {
  const auth = useAuthStore();
  await auth.ensureLoaded();
  if (to.name === 'login') {
    return auth.user ? safeRedirectTarget(to.query.next) : true;
  }
  if (!to.meta.public && !auth.user) {
    return { name: 'login', query: { next: to.fullPath } };
  }
  return true;
});

router.afterEach((to) => {
  document.title = to.meta.title ? `${to.meta.title} · ${APP_NAME}` : APP_NAME;
});
