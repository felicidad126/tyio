<script setup lang="ts">
defineProps<{ title: string; subtitle?: string }>();
</script>

<template>
  <div class="page-header d-print-none mt-0 mb-4">
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
</template>
