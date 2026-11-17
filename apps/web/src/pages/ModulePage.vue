<script setup lang="ts">
import { IconTools } from '@tabler/icons-vue';
import type { AppModule } from '@tyio/shared';
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { navItem } from '../navigation';

// Halaman penanda untuk modul yang belum dibangun: menjelaskan isinya dan kapan hadir.
const route = useRoute();
const item = computed(() => navItem(route.meta.module as AppModule));
</script>

<template>
  <div class="page-header mb-3">
    <h1 class="page-title">
      {{ item.label }}
    </h1>
  </div>
  <div class="card">
    <div class="empty">
      <div
        class="empty-icon"
        aria-hidden="true"
      >
        <IconTools :size="40" />
      </div>
      <p class="empty-title">
        Modul {{ item.label }} sedang dibangun
      </p>
      <p class="empty-subtitle text-secondary">
        {{ item.summary }} Hadir di rilis {{ item.release }}.
      </p>
    </div>
  </div>
</template>
