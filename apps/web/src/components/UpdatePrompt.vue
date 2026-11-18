<script setup lang="ts">
import { useRegisterSW } from 'virtual:pwa-register/vue';
import { watch } from 'vue';
import { useRoute } from 'vue-router';

// Versi baru portal tidak dimuat paksa: operator mungkin sedang mengisi form.
// Tawaran muat ulang muncul, dan operator memilih kapan. Kecuali di layar dinding (2.4),
// yang tidak disentuh siapa pun: versi baru dipasang sendiri setelah 30 detik.
const { needRefresh, updateServiceWorker } = useRegisterSW();
const route = useRoute();
let autoUpdate: ReturnType<typeof setTimeout> | undefined;
watch(
  () => needRefresh.value && route.name === 'wall',
  (onWall) => {
    clearTimeout(autoUpdate);
    if (onWall) autoUpdate = setTimeout(() => void updateServiceWorker(true), 30_000);
  },
  { immediate: true },
);
</script>

<template>
  <div
    v-if="needRefresh"
    class="update-prompt alert alert-info d-flex flex-wrap align-items-center gap-2 mb-0"
    role="status"
  >
    <span class="me-auto">Versi baru portal tersedia.</span>
    <button
      type="button"
      class="btn btn-primary"
      @click="updateServiceWorker(true)"
    >
      Muat ulang sekarang
    </button>
    <button
      type="button"
      class="btn btn-link"
      @click="needRefresh = false"
    >
      Nanti
    </button>
  </div>
</template>

<style scoped>
.update-prompt {
  position: fixed;
  z-index: 1080;
  right: 1rem;
  bottom: 1rem;
  left: 1rem;
  max-width: 32rem;
  margin-inline-start: auto;
}
.update-prompt .btn {
  min-height: 44px;
}
</style>
