import { type AppModule, APP_NAME, canOpenModule, MASTER_LISTS } from '@tyio/shared';
import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { NAV_ITEMS } from '../navigation';
import { useAuthStore } from '../stores/auth';
import { safeRedirectTarget } from './safe-redirect';

declare module 'vue-router' {
  interface RouteMeta {
    /** Boleh dibuka tanpa masuk. */
    public?: boolean;
    title?: string;
    /** Modul pemilik halaman; siapa yang boleh membuka diatur MODULE_ROLES di @tyio/shared. */
    module?: AppModule;
  }
}

const OverviewPage = () => import('../pages/overview/OverviewPage.vue');
const ModulePage = () => import('../pages/ModulePage.vue');

// Satu rute per modul. Halaman modul yang belum dibangun memakai halaman penanda.
const BUILT_MODULES: readonly AppModule[] = ['admin', 'remote'];
const moduleRoutes: RouteRecordRaw[] = NAV_ITEMS.filter((item) => !BUILT_MODULES.includes(item.module)).map(
  (item) => ({
    path: item.path === '/' ? '' : item.path.slice(1),
    name: item.module,
    component: item.module === 'overview' ? OverviewPage : ModulePage,
    meta: { module: item.module, title: item.label },
  }),
);

// Remote (1.2): daftar dan detail untuk semua peran; impor khusus admin (K18).
const remoteRoutes: RouteRecordRaw[] = [
  {
    path: 'remote',
    name: 'remote',
    component: () => import('../pages/remotes/RemoteListPage.vue'),
    meta: { module: 'remote', title: 'Remote' },
  },
  {
    path: 'remote/impor',
    name: 'remote-import',
    component: () => import('../pages/remotes/RemoteImportPage.vue'),
    meta: { module: 'admin', title: 'Impor remote' },
  },
  {
    path: 'remote/:id',
    name: 'remote-detail',
    component: () => import('../pages/remotes/RemoteDetailPage.vue'),
    meta: { module: 'remote', title: 'Remote' },
  },
];

// Tiket (1.3): buat tiket dan ringkasannya. Antrean tiket menyusul (1.5); sampai itu, /tiket
// tetap halaman penanda.
const ticketRoutes: RouteRecordRaw[] = [
  {
    path: 'tiket/baru',
    name: 'ticket-create',
    component: () => import('../pages/tickets/new/TicketCreatePage.vue'),
    meta: { module: 'tiket', title: 'Buat tiket' },
  },
  {
    path: 'tiket/:id',
    name: 'ticket-detail',
    component: () => import('../pages/tickets/detail/TicketDetailPage.vue'),
    meta: { module: 'tiket', title: 'Tiket' },
  },
];

// Admin: untuk sekarang hanya master data (1.1); daftar yang dibuka tersimpan di alamat.
const adminRoutes: RouteRecordRaw[] = [
  { path: 'admin', name: 'admin', redirect: { name: 'admin-master', params: { list: 'customer' } } },
  {
    path: `admin/master/:list(${MASTER_LISTS.join('|')})`,
    name: 'admin-master',
    component: () => import('../pages/admin/master/MasterDataPage.vue'),
    meta: { module: 'admin', title: 'Master data' },
  },
];

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
      component: () => import('../layouts/AppLayout.vue'),
      children: [
        ...moduleRoutes,
        ...remoteRoutes,
        ...ticketRoutes,
        ...adminRoutes,
        {
          path: 'tanpa-akses',
          name: 'forbidden',
          component: () => import('../pages/ForbiddenPage.vue'),
          meta: { title: 'Tanpa akses' },
        },
        {
          path: ':pathMatch(.*)*',
          name: 'not-found',
          component: () => import('../pages/NotFoundPage.vue'),
          meta: { title: 'Halaman tidak ditemukan' },
        },
      ],
    },
  ],
});

// Alur layar saja: penegakan sebenarnya ada di API.
router.beforeEach(async (to) => {
  const auth = useAuthStore();
  await auth.ensureLoaded();
  if (to.name === 'login') {
    return auth.user ? safeRedirectTarget(to.query.next) : true;
  }
  if (!to.meta.public && !auth.user) {
    return { name: 'login', query: { next: to.fullPath } };
  }
  const module = to.meta.module;
  if (module && auth.user && !canOpenModule(auth.user.role, module)) {
    // Arahkan ke halaman tanpa akses; alamat yang dituju disimpan di ?dari= untuk konteks.
    return { name: 'forbidden', replace: true, query: { dari: to.fullPath } };
  }
  return true;
});

router.afterEach((to) => {
  document.title = to.meta.title ? `${to.meta.title} · ${APP_NAME}` : APP_NAME;
});
