<script setup lang="ts">
import { IconPlugConnectedX } from '@tabler/icons-vue';
import { computed, onBeforeUnmount, ref } from 'vue';
import { useStream } from '../composables/useStream';

// Penanda pembaruan langsung (langkah 2.2): "Langsung · 8 dtk lalu" selama aliran hidup
// (waktu pesan terakhir dari server), "Terputus · menyambung ulang" bila putus, dengan waktu
// data yang sedang tampil ("data terakhir diterima"). Status dibacakan pembaca layar saat
// berubah saja, tidak setiap detik.

const props = defineProps<{ dataAt: number | null }>();
const { state } = useStream();
const now = ref(Date.now());
const ticker = setInterval(() => (now.value = Date.now()), 1_000);
onBeforeUnmount(() => clearInterval(ticker));

const clock = new Intl.DateTimeFormat('id-ID', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
  timeZone: 'Asia/Jakarta',
});
const wib = (at: number) => `${clock.format(new Date(at)).replace(/\./g, ':')} WIB`;

function ago(at: number | null): string {
  if (at === null) return '';
  const seconds = Math.max(0, Math.round((now.value - at) / 1_000));
  if (seconds < 60) return `${seconds} dtk lalu`;
  return `${Math.floor(seconds / 60)} mnt lalu`;
}

const label = computed(() => {
  if (state.status === 'langsung') return 'Langsung';
  if (state.status === 'terputus') return 'Terputus';
  return 'Menyambung';
});
const spoken = computed(() =>
  state.status === 'terputus'
    ? `Pembaruan langsung terputus, sedang menyambung ulang.${props.dataAt ? ` Data di layar per ${wib(props.dataAt)}.` : ''}`
    : state.status === 'langsung'
      ? 'Pembaruan langsung tersambung.'
      : 'Menyambung pembaruan langsung.',
);
</script>

<template>
  <span
    class="live"
    :class="`live--${state.status}`"
    data-testid="status-langsung"
  >
    <span
      class="live__pill"
      aria-hidden="true"
    >
      <IconPlugConnectedX
        v-if="state.status === 'terputus'"
        size="14"
        stroke="2.5"
      />
      <span
        v-else
        class="live__dot"
      />
      {{ label }}
    </span>
    <span
      class="live__text"
      aria-hidden="true"
    >
      <template v-if="state.status === 'langsung'">{{ ago(state.lastMessageAt) }}</template>
      <template v-else-if="state.status === 'terputus'">
        menyambung ulang<template v-if="dataAt"> · data per {{ wib(dataAt) }}</template>
      </template>
    </span>
    <span
      class="visually-hidden"
      role="status"
    >{{ spoken }}</span>
  </span>
</template>

<style scoped>
.live {
  /* Di judul halaman (page-pretitle Tabler) teks tidak ikut huruf kapital. */
  text-transform: none;
  letter-spacing: normal;
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 8px;
  font-size: 13px;
  color: var(--tblr-secondary);
}

.live__pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 26px;
  padding: 0 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}

.live__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentcolor;
}

/* Warna ATURAN.md §3: hijau = tersambung, kuning + ikon = terputus (bukan merah: tidak ada
   remote yang harus ditindak karenanya, §6). */
.live--langsung .live__pill {
  background: #dcf2e1;
  color: #1b6430;
}

.live--terputus .live__pill {
  background: #fcefd2;
  color: #7a4a00;
}

.live--menyambung .live__pill {
  background: #eaedf1;
  color: #454f5c;
}

.live--terputus .live__text {
  color: var(--tblr-body-color);
  font-weight: 500;
}
</style>
