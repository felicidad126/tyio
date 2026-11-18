<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { computed } from 'vue';
import { useLiveStore } from '../stores/live';

// Indikator pembaruan langsung di header (2.2). Warna disertai teks, bukan warna saja.
defineProps<{ compact?: boolean }>();
const { status } = storeToRefs(useLiveStore());
const view = computed(() => {
  switch (status.value) {
    case 'live':
      return { label: 'Langsung', title: 'Perubahan tiket tampil tanpa muat ulang.', dot: 'bg-success' };
    case 'offline':
      return { label: 'Terputus', title: 'Koneksi pembaruan langsung terputus; menyambung ulang otomatis.', dot: 'bg-danger' };
    default:
      return { label: 'Menyambung…', title: 'Menyambung ke pembaruan langsung.', dot: 'bg-warning' };
  }
});
</script>

<template>
  <span
    v-if="status !== 'idle'"
    class="live-status text-secondary small"
    :title="view.title"
    :aria-label="compact ? `Pembaruan langsung: ${view.label}` : undefined"
    role="status"
    :data-testid="compact ? 'status-langsung-ponsel' : 'status-langsung'"
  >
    <span
      class="status-dot"
      :class="[view.dot, { 'status-dot-animated': status === 'live' }]"
      aria-hidden="true"
    />
    <span :class="compact ? 'visually-hidden' : 'live-label'">{{ view.label }}</span>
  </span>
</template>

<style scoped>
.live-status {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  white-space: nowrap;
}
@media (prefers-reduced-motion: reduce) {
  .status-dot-animated::before {
    animation: none;
  }
}
</style>
