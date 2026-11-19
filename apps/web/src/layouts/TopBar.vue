<script setup lang="ts">
import UserMenu from './UserMenu.vue';
import ZoneClock from './ZoneClock.vue';

// Pencarian global, pilihan customer, notifikasi, dan "Buat NPR" (mockup) menyusul
// bersama fitur yang mengisinya (R1, R5), agar tidak ada tombol yang belum berfungsi.
</script>

<template>
  <header class="top">
    <ZoneClock class="top__clock" />
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

@media (max-width: 900px) {
  .top {
    min-height: 0;
    padding: 6px 16px;
  }
}

@media (max-width: 640px) {
  .top {
    justify-content: space-between;
  }
}
</style>
