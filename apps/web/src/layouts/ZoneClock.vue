<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';

// Jam di tiga zona waktu Indonesia (R-H): NOC melayani remote di seluruh zona.
const ZONES = [
  { label: 'WIB', timeZone: 'Asia/Jakarta' },
  { label: 'WITA', timeZone: 'Asia/Makassar' },
  { label: 'WIT', timeZone: 'Asia/Jayapura' },
] as const;

const formatters = ZONES.map(
  (zone) =>
    new Intl.DateTimeFormat('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      timeZone: zone.timeZone,
    }),
);

/** "17:51", bukan "17.51" bawaan locale id-ID (ATURAN.md §4, sama dengan mockup). */
function hhmm(index: number, date: Date): string {
  const parts = formatters[index]?.formatToParts(date) ?? [];
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '--';
  return `${part('hour')}:${part('minute')}`;
}

const now = ref(new Date());
let timer: ReturnType<typeof setTimeout> | undefined;

/** Diperbarui tepat saat menit berganti, bukan tiap detik. */
function scheduleTick(): void {
  const msToNextMinute = 60_000 - (Date.now() % 60_000) + 50;
  timer = setTimeout(() => {
    now.value = new Date();
    scheduleTick();
  }, msToNextMinute);
}

onMounted(scheduleTick);
onBeforeUnmount(() => clearTimeout(timer));
</script>

<template>
  <ul
    class="clock"
    aria-label="Jam sekarang"
  >
    <li
      v-for="(zone, index) in ZONES"
      :key="zone.label"
    >
      <time
        class="clock__time"
        :datetime="now.toISOString()"
      >{{ hhmm(index, now) }}</time>
      {{ zone.label }}
    </li>
  </ul>
</template>

<style scoped>
.clock {
  display: flex;
  gap: 12px;
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 13px;
  color: var(--tblr-secondary);
  font-variant-numeric: tabular-nums;
}

.clock__time {
  color: var(--tblr-body-color);
  font-weight: 600;
}
</style>
