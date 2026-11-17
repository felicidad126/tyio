<script setup lang="ts">
import { useRegisterSW } from 'virtual:pwa-register/vue';

// Versi baru portal tidak dimuat paksa: operator mungkin sedang mengisi form.
// Tawaran muat ulang muncul, dan operator memilih kapan.
const { needRefresh, updateServiceWorker } = useRegisterSW();
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
