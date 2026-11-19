<script setup lang="ts">
import { IconRefresh } from '@tabler/icons-vue';
import { useRegisterSW } from 'virtual:pwa-register/vue';

// Versi baru tidak dipasang diam-diam: halaman yang sedang dipakai operator tidak boleh
// dimuat ulang sendiri di tengah pekerjaan. Layar yang menyala 24 jam tetap memeriksa
// versi baru setiap jam.
const CHECK_EVERY_MS = 60 * 60 * 1000;

const { needRefresh, updateServiceWorker } = useRegisterSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    if (registration) setInterval(() => void registration.update(), CHECK_EVERY_MS);
  },
});
</script>

<template>
  <div
    v-if="needRefresh"
    class="update-prompt alert alert-info d-flex flex-wrap align-items-center gap-2 mb-0"
    role="status"
  >
    <IconRefresh
      class="alert-icon"
      aria-hidden="true"
    />
    <span class="me-auto">Versi baru portal tersedia.</span>
    <button
      type="button"
      class="btn btn-sm btn-ghost-secondary"
      @click="needRefresh = false"
    >
      Nanti saja
    </button>
    <button
      type="button"
      class="btn btn-sm btn-primary"
      @click="updateServiceWorker(true)"
    >
      Muat ulang sekarang
    </button>
  </div>
</template>

<style scoped>
.update-prompt {
  position: fixed;
  right: 16px;
  bottom: 16px;
  left: 16px;
  z-index: 1040;
  max-width: 480px;
  margin-left: auto;
  background: var(--tblr-bg-surface);
  box-shadow: var(--tblr-box-shadow-dropdown);
}
</style>
