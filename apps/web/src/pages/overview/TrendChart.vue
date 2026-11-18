<script setup lang="ts">
import type { OverviewResponse } from '@tyio/shared';
import { computed, ref, useId } from 'vue';
import { RouterLink, type RouteLocationRaw } from 'vue-router';
import { formatDay } from './overview-display';

// Tren harian (2.1): dua seri berdampingan per hari WIB, NPR baru (menurut kejadian) dan NPR
// Selesai (menurut online kembali). Kolom tipis dari satu garis dasar, legenda selalu ada,
// tooltip saat hover/fokus, dan tabel untuk yang tidak memakai grafik. Setiap batang menuju
// daftar Tiket dengan jumlah yang sama.
const props = defineProps<{ trend: OverviewResponse['trend'] }>();

type Series = 'opened' | 'closed';
const SERIES: ReadonlyArray<{ key: Series; label: string; link: (date: string) => RouteLocationRaw }> = [
  {
    key: 'opened',
    label: 'NPR baru',
    link: (date) => ({ name: 'tiket', query: { tampilan: 'semua', dari: date, sampai: date } }),
  },
  {
    key: 'closed',
    label: 'Selesai',
    link: (date) => ({ name: 'tiket', query: { tampilan: 'selesai', ditutupDari: date, ditutupSampai: date } }),
  },
];

// Sumbu: angka genap "bulat" terkecil di atas nilai terbesar, agar garis tengahnya bilangan bulat.
const max = computed(() => {
  const top = Math.max(1, ...props.trend.flatMap((d) => [d.opened, d.closed]));
  const magnitude = 10 ** Math.floor(Math.log10(top));
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) {
    const value = m * magnitude;
    if (value >= top && value % 2 === 0) return value;
  }
  return 20 * magnitude;
});
const ticks = computed(() => [max.value, max.value / 2, 0]);
const totals = computed(() =>
  Object.fromEntries(SERIES.map((s) => [s.key, props.trend.reduce((sum, d) => sum + d[s.key], 0)])) as Record<Series, number>,
);

/** Label hari di sumbu: tanggalnya saja; rentang bulan dan tahun ada di judul kartu. */
const dayLabel = (date: string) => String(Number(date.slice(8)));

const tooltipId = useId();
const tip = ref<{ date: string; left: number } | null>(null);
function show(event: Event, date: string): void {
  const slot = (event.currentTarget as HTMLElement).closest('.day') as HTMLElement;
  const plot = slot.parentElement as HTMLElement;
  // Tooltip tetap di dalam grafik walau batangnya di tepi.
  const half = 70;
  const center = slot.offsetLeft + slot.offsetWidth / 2;
  tip.value = { date, left: Math.min(Math.max(center, half), Math.max(half, plot.clientWidth - half)) };
}
const tipDay = computed(() => (tip.value ? props.trend.find((d) => d.date === tip.value!.date) : undefined));
</script>

<template>
  <div class="trend">
    <ul
      class="legend list-unstyled mb-3"
      aria-label="Keterangan grafik"
    >
      <li
        v-for="s in SERIES"
        :key="s.key"
      >
        <span
          class="swatch"
          :class="`series-${s.key}`"
          aria-hidden="true"
        />
        {{ s.label }}
        <span class="text-secondary">· {{ totals[s.key].toLocaleString('id-ID') }} dalam {{ trend.length }} hari</span>
      </li>
    </ul>

    <div class="chart">
      <div
        class="axis"
        aria-hidden="true"
      >
        <span
          v-for="t in ticks"
          :key="t"
          class="tick"
          :style="{ top: `${(1 - t / max) * 100}%` }"
        >{{ t.toLocaleString('id-ID') }}</span>
      </div>
      <div
        class="plot"
        @mouseleave="tip = null"
      >
        <div
          class="grid-layer"
          aria-hidden="true"
        >
          <div
            v-for="t in ticks"
            :key="t"
            class="grid"
            :style="{ top: `${(1 - t / max) * 100}%` }"
          />
        </div>
        <div
          v-for="day in trend"
          :key="day.date"
          class="day"
        >
          <div class="bars">
            <RouterLink
              v-for="s in SERIES"
              :key="s.key"
              :to="s.link(day.date)"
              class="hit"
              :aria-label="`${formatDay(day.date)}: ${day[s.key].toLocaleString('id-ID')} ${s.label}`"
              :aria-describedby="tip?.date === day.date ? tooltipId : undefined"
              @mouseenter="show($event, day.date)"
              @focus="show($event, day.date)"
              @blur="tip = null"
            >
              <span
                class="bar"
                :class="`series-${s.key}`"
                :style="{ height: `${(day[s.key] / max) * 100}%` }"
              />
            </RouterLink>
          </div>
          <span
            class="day-label"
            aria-hidden="true"
          >{{ dayLabel(day.date) }}</span>
        </div>
        <div
          v-if="tip && tipDay"
          :id="tooltipId"
          class="tooltip-box"
          role="tooltip"
          :style="{ left: `${tip.left}px` }"
        >
          <div class="small text-secondary">
            {{ formatDay(tipDay.date) }}
          </div>
          <div
            v-for="s in SERIES"
            :key="s.key"
            class="d-flex align-items-center gap-2"
          >
            <span
              class="key"
              :class="`series-${s.key}`"
              aria-hidden="true"
            />
            <strong>{{ tipDay[s.key].toLocaleString('id-ID') }}</strong>
            <span class="text-secondary">{{ s.label }}</span>
          </div>
        </div>
      </div>
    </div>

    <details class="mt-3">
      <summary class="py-2">
        Lihat sebagai tabel
      </summary>
      <div class="table-responsive">
        <table class="table table-sm mb-0">
          <thead>
            <tr>
              <th scope="col">
                Tanggal (WIB)
              </th>
              <th
                v-for="s in SERIES"
                :key="s.key"
                scope="col"
                class="text-end"
              >
                {{ s.label }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="day in [...trend].reverse()"
              :key="day.date"
            >
              <th
                scope="row"
                class="fw-normal"
              >
                {{ formatDay(day.date) }}
              </th>
              <td
                v-for="s in SERIES"
                :key="s.key"
                class="text-end numeric"
              >
                <RouterLink :to="s.link(day.date)">
                  {{ day[s.key].toLocaleString('id-ID') }}
                </RouterLink>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </details>
  </div>
</template>

<style scoped>
/* Warna seri dari palet kategorikal yang sudah divalidasi (biru, oranye), terang dan gelap. */
.trend {
  --series-opened: #2a78d6;
  --series-closed: #eb6834;
  --grid: var(--tblr-border-color);
  --plot-height: 180px;
}
:global([data-bs-theme='dark']) .trend {
  --series-opened: #3987e5;
  --series-closed: #d95926;
}
.series-opened {
  background: var(--series-opened);
}
.series-closed {
  background: var(--series-closed);
}
.legend {
  display: flex;
  flex-wrap: wrap;
  column-gap: 1.5rem;
  row-gap: 0.25rem;
}
.swatch {
  display: inline-block;
  width: 12px;
  height: 12px;
  border-radius: 2px;
  margin-right: 0.25rem;
  vertical-align: -1px;
}
.chart {
  display: flex;
  gap: 0.5rem;
}
.axis {
  position: relative;
  height: var(--plot-height);
  min-width: 1.75rem;
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
  color: var(--tblr-secondary);
}
.tick {
  position: absolute;
  right: 0;
  transform: translateY(-50%);
  line-height: 1;
}
.plot {
  position: relative;
  flex: 1;
  display: flex;
  min-width: 0;
}
.grid-layer {
  position: absolute;
  inset: 0 0 auto;
  height: var(--plot-height);
}
.grid {
  position: absolute;
  left: 0;
  right: 0;
  height: 1px;
  background: var(--grid);
}
.day {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.bars {
  position: relative;
  height: var(--plot-height);
  width: 100%;
  display: flex;
  justify-content: center;
  gap: 2px;
}
/* Area sentuh setinggi grafik, lebih besar dari batangnya. */
.hit {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  height: 100%;
  flex: 0 1 24px;
  min-width: 0;
  border-radius: 4px;
}
.hit:hover .bar,
.hit:focus-visible .bar {
  filter: brightness(1.12);
}
.hit:focus-visible {
  outline: 2px solid var(--tblr-primary);
  outline-offset: 1px;
}
.bar {
  display: block;
  width: 100%;
  max-width: 24px;
  border-radius: 4px 4px 0 0;
}
.day-label {
  margin-top: 0.25rem;
  font-size: 0.75rem;
  color: var(--tblr-secondary);
  white-space: nowrap;
}
.tooltip-box {
  position: absolute;
  top: 0;
  transform: translateX(-50%);
  z-index: 2;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--tblr-border-color);
  border-radius: 4px;
  background: var(--tblr-bg-surface);
  box-shadow: var(--tblr-shadow-dropdown, 0 4px 12px rgb(0 0 0 / 10%));
  pointer-events: none;
  white-space: nowrap;
}
.key {
  display: inline-block;
  width: 12px;
  height: 2px;
}
.numeric {
  font-variant-numeric: tabular-nums;
}
</style>
