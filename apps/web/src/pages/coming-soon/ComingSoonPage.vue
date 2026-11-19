<script setup lang="ts">
import { IconClockHour4 } from '@tabler/icons-vue';
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import PageHeader from '../../components/PageHeader.vue';

// Halaman sementara untuk modul yang isinya dibangun di rilis berikutnya (rencana §8).
const route = useRoute();
const page = computed(() => route.meta.page);
</script>

<template>
  <div v-if="page">
    <PageHeader :title="page.label" />
    <div class="card">
      <div class="empty">
        <div
          class="empty-icon"
          aria-hidden="true"
        >
          <IconClockHour4
            size="48"
            stroke="1.5"
          />
        </div>
        <p class="empty-title">
          Isi halaman ini menyusul
        </p>
        <p class="empty-subtitle text-secondary">
          {{ page.summary }}
        </p>
        <div class="empty-action">
          <span class="badge bg-secondary-subtle text-secondary-emphasis">Rilis {{ page.release }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
