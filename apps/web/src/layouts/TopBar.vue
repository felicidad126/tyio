<script setup lang="ts">
import { IconPlus } from '@tabler/icons-vue';
import UserMenu from './UserMenu.vue';
import ZoneClock from './ZoneClock.vue';

// "Buat NPR" berfungsi sejak langkah 1.3. Pencarian global, pilihan customer, dan
// notifikasi (mockup) menyusul bersama fitur yang mengisinya (1.5, R5), agar tidak ada
// tombol yang belum berfungsi (T36).
</script>

<template>
  <header class="top">
    <ZoneClock class="top__clock" />
    <!-- Tombol global bergaya sekunder; tombol utama milik halaman (ATURAN.md §5). -->
    <RouterLink
      :to="{ name: 'ticket-new' }"
      class="btn top__new"
      title="Buat NPR"
    >
      <IconPlus
        size="18"
        aria-hidden="true"
      />
      <span class="top__new-label">Buat NPR</span>
    </RouterLink>
    <UserMenu />
  </header>
</template>

<style scoped>
.top {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 16px;
  min-height: 61px;
  padding: 10px 24px;
  border-bottom: 1px solid var(--tblr-border-color);
  background: var(--tblr-bg-surface);
}

.top__new {
  gap: 6px;
  min-height: 36px;
}

@media (max-width: 900px) {
  .top {
    min-height: 0;
    padding: 6px 16px;
  }
}

@media (max-width: 640px) {
  .top {
    justify-content: space-between;
    gap: 8px;
  }

  .top__new {
    min-width: 44px;
    min-height: 44px;
    padding: 0 10px;
  }
}

/* Di ponsel sempit tinggal ikon; nama aksesibel tetap "Buat NPR". */
@media (max-width: 479.98px) {
  .top__new-label {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
}
</style>
