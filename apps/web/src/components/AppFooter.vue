<script setup lang="ts">
import { COMPANY_NAME } from '@npr/shared';

// Kaki halaman (T165): di setiap halaman setelah login dan di halaman login.
const year = new Date().getFullYear();
</script>

<template>
  <footer class="app-footer">
    © {{ year }} {{ COMPANY_NAME }}
  </footer>
</template>

<style scoped>
.app-footer {
  padding: 12px 16px 16px;
  font-size: 12px;
  color: var(--tblr-secondary);
  text-align: center;
}
</style>
