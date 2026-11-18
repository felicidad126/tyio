<script setup lang="ts">
import { IconPlugConnectedX } from '@tabler/icons-vue';
import { storeToRefs } from 'pinia';
import { useLiveStore } from '../stores/live';

// Koneksi putus harus terlihat jelas (2.2): spanduk di atas isi halaman selama terputus.
const live = useLiveStore();
const { status } = storeToRefs(live);
</script>

<template>
  <div
    v-if="status === 'offline'"
    class="alert alert-warning d-flex align-items-center gap-3 mb-3"
    role="alert"
    data-testid="spanduk-terputus"
  >
    <IconPlugConnectedX
      :size="24"
      aria-hidden="true"
      class="flex-shrink-0"
    />
    <div class="me-auto">
      <strong>Koneksi pembaruan langsung terputus.</strong>
      Data di layar mungkin tidak terbaru. Menyambung ulang otomatis.
    </div>
    <button
      type="button"
      class="btn action-target"
      @click="live.reconnectNow()"
    >
      Sambungkan sekarang
    </button>
  </div>
</template>

<style scoped>
.action-target {
  min-height: 44px;
}
</style>
