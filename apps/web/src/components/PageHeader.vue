<script setup lang="ts">
defineProps<{ title: string; subtitle?: string }>();
</script>

<template>
  <div class="page-header d-print-none mt-0 mb-4">
    <div class="d-flex flex-wrap align-items-end gap-3">
      <div class="me-auto">
        <div class="page-pretitle">
          <slot name="pretitle" />
        </div>
        <h1 class="page-title">
          {{ title }}
        </h1>
        <p
          v-if="subtitle"
          class="text-secondary mt-1 mb-0"
        >
          {{ subtitle }}
        </p>
      </div>
      <!-- Satu aksi utama halaman (ATURAN.md §5), mis. "Impor dari Excel". -->
      <div
        v-if="$slots.actions"
        class="d-flex flex-wrap align-items-center gap-2"
      >
        <slot name="actions" />
      </div>
    </div>
  </div>
</template>
