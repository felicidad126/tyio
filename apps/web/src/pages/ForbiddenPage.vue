<script setup lang="ts">
import { IconLock } from '@tabler/icons-vue';
</script>

<template>
  <div class="card">
    <div class="empty">
      <div
        class="empty-icon"
        aria-hidden="true"
      >
        <IconLock :size="40" />
      </div>
      <h1 class="empty-title">
        Halaman ini tidak tersedia untuk peran Anda
      </h1>
      <p class="empty-subtitle text-secondary">
        Bila Anda memerlukannya untuk pekerjaan, minta akses ke admin portal.
      </p>
      <div class="empty-action">
        <RouterLink
          to="/"
          class="btn btn-primary"
        >
          Kembali ke Overview
        </RouterLink>
      </div>
    </div>
  </div>
</template>
