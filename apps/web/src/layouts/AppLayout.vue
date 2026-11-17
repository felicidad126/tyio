<script setup lang="ts">
import { IconMenu2, IconX } from '@tabler/icons-vue';
import { APP_NAME, canOpenModule } from '@tyio/shared';
import { storeToRefs } from 'pinia';
import { computed, ref, watch } from 'vue';
import { RouterLink, RouterView, useRoute } from 'vue-router';
import UserMenu from '../components/UserMenu.vue';
import { NAV_ITEMS } from '../navigation';
import { useAuthStore } from '../stores/auth';

const { user } = storeToRefs(useAuthStore());
const route = useRoute();
const menuOpen = ref(false);

// Menu hanya menampilkan modul yang boleh dibuka peran pengguna (aturan di @tyio/shared).
const items = computed(() =>
  user.value ? NAV_ITEMS.filter((item) => canOpenModule(user.value!.role, item.module)) : [],
);

// Di ponsel, menu tertutup sendiri setelah berpindah halaman.
watch(
  () => route.fullPath,
  () => {
    menuOpen.value = false;
  },
);

function isActive(path: string): boolean {
  return path === '/' ? route.path === '/' : route.path === path || route.path.startsWith(`${path}/`);
}
</script>

<template>
  <div class="page">
    <a
      class="visually-hidden-focusable skip-link"
      href="#konten"
    >Langsung ke konten</a>

    <aside class="navbar navbar-vertical navbar-expand-md">
      <div class="container-fluid">
        <button
          type="button"
          class="navbar-toggler menu-toggle"
          aria-controls="menu-utama"
          :aria-expanded="menuOpen"
          @click="menuOpen = !menuOpen"
        >
          <component
            :is="menuOpen ? IconX : IconMenu2"
            :size="24"
            aria-hidden="true"
          />
          <span class="visually-hidden">{{ menuOpen ? 'Tutup menu' : 'Buka menu' }}</span>
        </button>
        <RouterLink
          to="/"
          class="navbar-brand navbar-brand-autodark brand"
        >
          <img
            src="/favicon.svg"
            alt=""
            width="28"
            height="28"
          >
          <span class="brand-name">{{ APP_NAME }}</span>
        </RouterLink>
        <div class="navbar-nav flex-row d-md-none">
          <UserMenu />
        </div>
        <div
          id="menu-utama"
          class="collapse navbar-collapse"
          :class="{ show: menuOpen }"
        >
          <nav
            class="w-100"
            aria-label="Menu utama"
          >
            <ul class="navbar-nav pt-md-3">
              <li
                v-for="item in items"
                :key="item.module"
                class="nav-item"
                :class="{ active: isActive(item.path) }"
              >
                <RouterLink
                  :to="item.path"
                  class="nav-link nav-target"
                  :aria-current="isActive(item.path) ? 'page' : undefined"
                >
                  <span class="nav-link-icon">
                    <component
                      :is="item.icon"
                      :size="20"
                      aria-hidden="true"
                    />
                  </span>
                  <span class="nav-link-title">{{ item.label }}</span>
                </RouterLink>
              </li>
            </ul>
          </nav>
        </div>
      </div>
    </aside>

    <div class="page-wrapper">
      <header class="navbar navbar-expand-md d-none d-md-flex d-print-none">
        <div class="container-fluid">
          <div class="navbar-nav flex-row ms-auto">
            <UserMenu />
          </div>
        </div>
      </header>
      <main
        id="konten"
        class="page-body"
        tabindex="-1"
      >
        <div class="container-fluid app-content">
          <RouterView />
        </div>
      </main>
    </div>
  </div>
</template>

<style scoped>
/* Batas lebar hanya untuk isi halaman, bukan untuk shell (sidebar dan header melebar penuh). */
.app-content {
  max-width: 1280px;
}
/* Target sentuh minimal 44×44 px. */
.menu-toggle,
.nav-target {
  min-height: 44px;
  min-width: 44px;
}
/* Hanya di layar sempit: di >=768px Tabler menyembunyikan tombol ini, jangan ditimpa. */
@media (max-width: 767.98px) {
  .menu-toggle {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  /* Header ponsel selalu satu baris: tombol menu, nama portal, menu pengguna. Dengan font
     yang lebih lebar atau teks diperbesar, nama portal yang mengalah (dipotong "…"), bukan
     menu pengguna yang turun ke baris kedua. */
  .brand {
    flex: 1 1 0;
    min-width: 0;
  }
  .brand-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}
.brand {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}
.skip-link {
  position: absolute;
  z-index: 1100;
  top: 0.5rem;
  left: 0.5rem;
  padding: 0.5rem 0.75rem;
  background: var(--tblr-bg-surface);
  border: 1px solid var(--tblr-border-color);
  border-radius: var(--tblr-border-radius);
}
</style>
