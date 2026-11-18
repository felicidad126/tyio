<script setup lang="ts">
import { RouterLink, useRoute } from 'vue-router';

// Bagian halaman Admin; tiap bagian punya alamat sendiri.
const route = useRoute();
const SECTIONS = [
  { name: 'admin-master', label: 'Master data', to: { name: 'admin-master', params: { list: 'customer' } } },
  { name: 'admin-notifications', label: 'Notifikasi', to: { name: 'admin-notifications' } },
] as const;
</script>

<template>
  <nav
    class="mb-2"
    aria-label="Bagian Admin"
  >
    <ul class="nav nav-pills gap-1">
      <li
        v-for="section in SECTIONS"
        :key="section.name"
        class="nav-item"
      >
        <RouterLink
          :to="section.to"
          class="nav-link section-link"
          :class="{ active: route.name === section.name }"
          :aria-current="route.name === section.name ? 'page' : undefined"
        >
          {{ section.label }}
        </RouterLink>
      </li>
    </ul>
  </nav>
</template>

<style scoped>
.section-link {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
}
</style>
