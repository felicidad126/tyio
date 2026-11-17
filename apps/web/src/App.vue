<script setup lang="ts">
import UpdatePrompt from './components/UpdatePrompt.vue';
</script>

<template>
  <RouterView />
  <!-- Di tingkat aplikasi: service worker terdaftar sejak halaman pertama, termasuk halaman masuk. -->
  <UpdatePrompt />
</template>
