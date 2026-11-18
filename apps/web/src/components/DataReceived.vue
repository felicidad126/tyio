<script setup lang="ts">
import { computed } from 'vue';

// "Data terakhir diterima" (2.2): kapan isi panel ini terakhir dimuat dari server, jam WIB
// dengan detik, agar pembaruan langsung dalam menit yang sama tetap terlihat.
const props = defineProps<{ at: Date | string | null }>();
const CLOCK = new Intl.DateTimeFormat('id-ID', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
  timeZone: 'Asia/Jakarta',
});
const text = computed(() => (props.at ? `${CLOCK.format(new Date(props.at)).replace(/:/g, '.')} WIB` : ''));
</script>

<template>
  <span
    v-if="text"
    class="text-secondary small text-nowrap"
  >Data diterima {{ text }}</span>
</template>
