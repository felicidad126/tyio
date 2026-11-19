<script setup lang="ts">
import { IconMapPin } from '@tabler/icons-vue';
import PageHeader from '../../components/PageHeader.vue';
</script>

<template>
  <div>
    <PageHeader title="Halaman tidak ditemukan" />
    <div class="card">
      <div class="empty">
        <div
          class="empty-icon"
          aria-hidden="true"
        >
          <IconMapPin
            size="48"
            stroke="1.5"
          />
        </div>
        <p class="empty-title">
          Alamat ini belum ada atau sudah dipindah
        </p>
        <p class="empty-subtitle text-secondary">
          Periksa alamatnya, atau buka halaman lain lewat menu.
        </p>
        <div class="empty-action">
          <RouterLink
            :to="{ name: 'overview' }"
            class="btn btn-primary"
          >
            Kembali ke Overview
          </RouterLink>
        </div>
      </div>
    </div>
  </div>
</template>
