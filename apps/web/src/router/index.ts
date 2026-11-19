import { APP_NAME, type Role, type SessionUser } from '@tyio/shared';
import { createRouter, createWebHistory } from 'vue-router';
import { setUnauthorizedHandler } from '../api';
import AppLayout from '../layouts/AppLayout.vue';
import { MODULE_PAGES, type ModulePage } from '../navigation';
import AccountPage from '../pages/account/AccountPage.vue';
import ComingSoonPage from '../pages/coming-soon/ComingSoonPage.vue';
import LoginPage from '../pages/login/LoginPage.vue';
import NotFoundPage from '../pages/not-found/NotFoundPage.vue';
import { useSessionStore } from '../stores/session';
import { safeNextPath } from './next-path';

declare module 'vue-router' {
  interface RouteMeta {
    /** Boleh dibuka tanpa login. Semua rute lain wajib login. */
    public?: boolean;
    /** Judul tab peramban; nama aplikasi ditambahkan otomatis. */
    title?: string;
    /** Peran yang boleh membuka; tidak diisi = semua peran. */
    roles?: readonly Role[];
    /** Modul yang isinya menyusul (halaman "menyusul"). */
    page?: ModulePage;
  }
}

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/masuk', name: 'login', component: LoginPage, meta: { public: true, title: 'Masuk' } },
    {
      path: '/',
      component: AppLayout,
      children: [
        ...MODULE_PAGES.map((page) => ({
          // Anak dari "/" memakai path relatif; Overview adalah path kosong.
          path: page.path.slice(1),
          name: page.name,
          component: ComingSoonPage,
          meta: { title: page.label, roles: page.roles, page },
        })),
        { path: 'akun', name: 'akun', component: AccountPage, meta: { title: 'Akun' } },
        {
          path: ':pathMatch(.*)*',
          name: 'not-found',
          component: NotFoundPage,
          meta: { title: 'Halaman tidak ditemukan' },
        },
      ],
    },
  ],
});

router.beforeEach(async (to) => {
  const session = useSessionStore();
  let user: SessionUser | null;
  try {
    user = await session.ensure();
  } catch {
    user = null; // server tidak terjangkau: halaman login yang menjelaskan saat dicoba
  }

  if (to.name === 'login') return user ? (safeNextPath(to.query.next) ?? '/') : true;
  if (to.meta.public || user) return true;
  return { name: 'login', query: to.fullPath === '/' ? {} : { next: to.fullPath } };
  // Peran diperiksa di AppLayout: halaman terlarang tetap di alamatnya dan menampilkan
  // penjelasan, bukan dialihkan diam-diam. API tetap penjaga yang sebenarnya.
});

router.afterEach((to) => {
  document.title = to.meta.title ? `${to.meta.title} · ${APP_NAME}` : APP_NAME;
});

setUnauthorizedHandler(() => {
  useSessionStore().forget();
  const here = router.currentRoute.value;
  if (!here.meta.public) {
    void router.replace({ name: 'login', query: { next: here.fullPath, sesi: 'berakhir' } });
  }
});
