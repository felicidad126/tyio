<script setup lang="ts">
import { OVERVIEW_DAY_ZONE, type OverviewCount, type OverviewDaily } from '@npr/shared';
import { computed, ref } from 'vue';
import { queueLocation } from '../tickets/list/queue-query';
import { seriesColor, seriesSlots } from './series';

// "Tiket baru per hari" (T108, T109, T114): batang bertumpuk per kategori, legenda, tooltip
// saat kursor di atas hari, dan tampilan tabel. Setiap segmen dan setiap angka di tabel
// membuka antrean dengan jumlah yang sama. Grafik disembunyikan dari pembaca layar; tabel
// adalah padanannya yang bisa dibaca dan dijelajahi keyboard.

const props = defineProps<{ daily: OverviewDaily; today: string; asOf: string }>();

const DOW = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const DOW_LONG = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const HEIGHT = 200;
const number = new Intl.NumberFormat('id-ID');

const showTable = ref(false);
const hover = ref<number | null>(null);

interface Series {
  name: string;
  slot: number;
  /** Indeks di `daily.categories`; kosong untuk "Kategori lain". */
  indexes: number[];
}

/** Kategori menurut slot warnanya; kategori di luar 7 slot digabung "Kategori lain". */
const series = computed<Series[]>(() => {
  const slots = seriesSlots(props.daily.categories);
  const named: Series[] = [];
  const other: number[] = [];
  props.daily.categories.forEach((name, index) => {
    const slot = slots.get(name) ?? -1;
    if (slot < 0) other.push(index);
    else named.push({ name, slot, indexes: [index] });
  });
  named.sort((a, b) => a.slot - b.slot);
  return other.length > 0 ? [...named, { name: 'Kategori lain', slot: -1, indexes: other }] : named;
});

interface Cell {
  count: number;
  /** Tautan antrean; tidak ada untuk "Kategori lain" (gabungan beberapa nama). */
  link: OverviewCount | null;
}

const days = computed(() =>
  props.daily.days.map((day) => {
    const date = new Date(`${day.date}T00:00:00Z`);
    const cells: Cell[] = series.value.map((item) => {
      if (item.slot >= 0) {
        const index = item.indexes[0] ?? 0;
        return { count: day.categories[index]?.count ?? 0, link: day.categories[index] ?? null };
      }
      return { count: item.indexes.reduce((sum, index) => sum + (day.categories[index]?.count ?? 0), 0), link: null };
    });
    const isToday = day.date === props.today;
    return {
      date: day.date,
      total: day.total,
      cells,
      isToday,
      dayLabel: String(date.getUTCDate()),
      dowLabel: DOW[date.getUTCDay()] ?? '',
      shortLabel: `${DOW[date.getUTCDay()]}, ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}${isToday ? ' (hari ini)' : ''}`,
      longLabel: `${DOW_LONG[date.getUTCDay()]}, ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}${isToday ? ` (sampai ${props.asOf})` : ''}`,
    };
  }),
);

const empty = computed(() => days.value.every((day) => day.total.count === 0));

/** Skala sumbu: kelipatan 1, 2, atau 5 yang memuat hari terbanyak, empat garis bantu. */
const scale = computed(() => {
  const max = Math.max(1, ...days.value.map((day) => day.total.count));
  const rough = max / 4;
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = Math.max(1, [1, 2, 5, 10].map((m) => m * power).find((value) => value >= rough) ?? power * 10);
  const top = step * Math.ceil(max / step);
  const ticks: number[] = [];
  for (let value = 0; value <= top; value += step) ticks.push(value);
  return { top, ticks };
});

const px = (count: number) => (count / scale.value.top) * HEIGHT;

/** Label tanggal yang ditulis: semua untuk 7 hari, selang-seling untuk 14, tiap 5 hari untuk 30. */
function labelVisible(index: number): 'all' | 'wide' | 'none' {
  const fromEnd = days.value.length - 1 - index;
  if (days.value.length <= 7) return 'all';
  if (days.value.length <= 14) return fromEnd % 2 === 0 ? 'all' : 'wide';
  return fromEnd % 5 === 0 ? 'all' : 'none';
}

const title = computed(() => {
  const first = days.value[0];
  const last = days.value[days.value.length - 1];
  return first && last ? `${first.dayLabel} ${monthOf(first.date)} – ${last.dayLabel} ${monthOf(last.date)}` : '';
});

function monthOf(date: string): string {
  return MONTHS[new Date(`${date}T00:00:00Z`).getUTCMonth()] ?? '';
}
</script>

<template>
  <div class="daily">
    <div class="daily__top">
      <p class="daily__sub">
        {{ title }} · hari menurut {{ OVERVIEW_DAY_ZONE }}, hari ini sampai {{ asOf }}
      </p>
      <button
        v-if="!empty"
        type="button"
        class="btn btn-sm"
        :aria-pressed="showTable"
        @click="showTable = !showTable"
      >
        {{ showTable ? 'Lihat sebagai grafik' : 'Lihat sebagai tabel' }}
      </button>
    </div>

    <p
      v-if="empty"
      class="daily__empty"
    >
      Belum ada NPR baru dalam periode ini.
    </p>

    <template v-else>
      <ul
        v-if="series.length > 1"
        class="daily__legend"
        aria-label="Kategori"
      >
        <li
          v-for="item in series"
          :key="item.name"
        >
          <span
            class="daily__swatch"
            :style="{ background: seriesColor(item.slot) }"
            aria-hidden="true"
          />{{ item.name }}
        </li>
      </ul>
      <p
        v-else-if="series[0]"
        class="daily__single"
      >
        Semua NPR berkategori {{ series[0].name }}.
      </p>

      <div
        v-if="!showTable"
        class="daily__chart"
        aria-hidden="true"
        data-testid="grafik-harian"
      >
        <div
          class="daily__axis"
          :style="{ height: `${HEIGHT}px` }"
        >
          <span
            v-for="tick in scale.ticks"
            :key="tick"
            class="daily__tick"
            :style="{ bottom: `${px(tick) - 7}px` }"
          >{{ number.format(tick) }}</span>
        </div>
        <div class="daily__plot">
          <div
            class="daily__area"
            :style="{ height: `${HEIGHT}px` }"
          >
            <div
              v-for="tick in scale.ticks"
              :key="tick"
              class="daily__grid"
              :class="{ 'daily__grid--base': tick === 0 }"
              :style="{ bottom: `${px(tick)}px` }"
            />
            <div class="daily__bars">
              <div
                v-for="(day, index) in days"
                :key="day.date"
                class="daily__day"
                @mouseenter="hover = index"
                @mouseleave="hover = null"
              >
                <span
                  v-if="day.isToday"
                  class="daily__today-total"
                >{{ number.format(day.total.count) }}</span>
                <div
                  class="daily__stack"
                  :class="{ 'daily__stack--dim': hover !== null && hover !== index }"
                >
                  <template
                    v-for="(cell, position) in day.cells"
                    :key="position"
                  >
                    <RouterLink
                      v-if="cell.count > 0 && cell.link"
                      :to="queueLocation(cell.link.filter)"
                      tabindex="-1"
                      class="daily__seg"
                      :style="{ height: `${Math.max(2, px(cell.count) - 2)}px`, background: seriesColor(series[position]?.slot ?? -1) }"
                    />
                    <span
                      v-else-if="cell.count > 0"
                      class="daily__seg"
                      :style="{ height: `${Math.max(2, px(cell.count) - 2)}px`, background: seriesColor(-1) }"
                    />
                  </template>
                </div>
                <div
                  v-if="hover === index"
                  class="daily__tip"
                  :class="{ 'daily__tip--start': index < 2, 'daily__tip--end': index > days.length - 3 }"
                >
                  <strong>{{ day.longLabel }}</strong>
                  <span
                    v-for="(cell, position) in day.cells"
                    :key="position"
                    class="daily__tip-row"
                  >
                    <span><span
                      class="daily__swatch"
                      :style="{ background: seriesColor(series[position]?.slot ?? -1) }"
                    />{{ series[position]?.name }}</span>
                    <b>{{ number.format(cell.count) }}</b>
                  </span>
                  <span class="daily__tip-row daily__tip-total"><span>Total</span><b>{{ number.format(day.total.count) }}</b></span>
                </div>
              </div>
            </div>
          </div>
          <div class="daily__labels">
            <span
              v-for="(day, index) in days"
              :key="day.date"
              class="daily__label"
              :class="[`daily__label--${labelVisible(index)}`, { 'daily__label--today': day.isToday }]"
            >
              <span>{{ day.dayLabel }}</span>
              <span>{{ day.dowLabel }}</span>
            </span>
          </div>
        </div>
      </div>

      <div
        v-else
        class="daily__table"
      >
        <table class="table table-sm card-table">
          <caption class="visually-hidden">
            NPR baru per hari, per kategori
          </caption>
          <thead>
            <tr>
              <th scope="col">
                Tanggal
              </th>
              <th
                v-for="item in series"
                :key="item.name"
                scope="col"
                class="text-end"
              >
                {{ item.name }}
              </th>
              <th
                scope="col"
                class="text-end"
              >
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="day in days"
              :key="day.date"
            >
              <th
                scope="row"
                class="fw-normal daily__date"
              >
                {{ day.shortLabel }}
              </th>
              <td
                v-for="(cell, position) in day.cells"
                :key="position"
                class="text-end"
                :data-label="series[position]?.name"
              >
                <RouterLink
                  v-if="cell.count > 0 && cell.link"
                  :to="queueLocation(cell.link.filter)"
                  :aria-label="`${cell.count} NPR ${series[position]?.name}, ${day.longLabel}`"
                >
                  {{ number.format(cell.count) }}
                </RouterLink>
                <span
                  v-else
                  :class="{ 'text-secondary': cell.count === 0 }"
                >{{ number.format(cell.count) }}</span>
              </td>
              <td
                class="text-end fw-bold"
                data-label="Total"
              >
                <RouterLink
                  v-if="day.total.count > 0"
                  :to="queueLocation(day.total.filter)"
                  :aria-label="`${day.total.count} NPR baru, ${day.longLabel}`"
                >
                  {{ number.format(day.total.count) }}
                </RouterLink>
                <span
                  v-else
                  class="text-secondary"
                >0</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>

<style scoped>
.daily {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.daily__top {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px 12px;
}

.daily__sub,
.daily__single,
.daily__empty {
  margin: 0;
  color: var(--tblr-secondary);
  font-size: 13px;
}

.daily__empty {
  padding: 24px 0;
  text-align: center;
}

.daily__top .btn {
  min-height: 32px;
}

.daily__legend {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 13px;
}

.daily__legend li {
  display: inline-flex;
  align-items: center;
}

.daily__swatch {
  display: inline-block;
  flex: 0 0 auto;
  width: 10px;
  height: 10px;
  margin-right: 6px;
  border-radius: 2px;
}

.daily__chart {
  display: flex;
  gap: 8px;
  padding-top: 16px;
}

.daily__axis {
  position: relative;
  flex: 0 0 auto;
  width: 24px;
  font-size: 12px;
  color: var(--tblr-secondary);
}

.daily__tick {
  position: absolute;
  right: 0;
  line-height: 14px;
}

.daily__plot {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.daily__area {
  position: relative;
}

.daily__grid {
  position: absolute;
  right: 0;
  left: 0;
  border-top: 1px solid var(--tblr-border-color-translucent);
}

.daily__grid--base {
  border-top-color: var(--tblr-border-color);
}

.daily__bars {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: flex-end;
  gap: 4px;
}

.daily__day {
  position: relative;
  display: flex;
  flex: 1 1 0;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  min-width: 0;
  height: 100%;
}

.daily__today-total {
  margin-bottom: 4px;
  font-size: 12px;
  font-weight: 600;
}

.daily__stack {
  display: flex;
  flex-direction: column-reverse;
  gap: 2px;
  width: 100%;
  max-width: 30px;
}

.daily__stack--dim {
  opacity: 0.45;
}

.daily__seg {
  display: block;
}

/* Ujung data membulat 4 px, pangkal di garis dasar tetap rata. */
.daily__seg:last-child {
  border-radius: 4px 4px 0 0;
}

.daily__tip {
  position: absolute;
  top: 0;
  left: 50%;
  z-index: 3;
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 190px;
  padding: 10px 12px;
  border-radius: 6px;
  background: #182433;
  color: #ffffff;
  font-size: 12px;
  box-shadow: 0 4px 12px rgb(24 36 51 / 18%);
  pointer-events: none;
  transform: translateX(-50%);
}

.daily__tip--start {
  left: 0;
  transform: none;
}

.daily__tip--end {
  right: 0;
  left: auto;
  transform: none;
}

.daily__tip strong {
  font-size: 13px;
}

.daily__tip-row {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}

.daily__tip-total {
  padding-top: 4px;
  border-top: 1px solid #3a4a5e;
}

.daily__labels {
  display: flex;
  gap: 4px;
}

.daily__label {
  display: flex;
  flex: 1 1 0;
  flex-direction: column;
  align-items: center;
  min-width: 0;
  font-size: 12px;
  line-height: 1.3;
  color: var(--tblr-secondary);
  white-space: nowrap;
}

.daily__label--today {
  color: var(--tblr-body-color);
  font-weight: 700;
}

.daily__label--none {
  visibility: hidden;
}

.daily__table {
  max-height: 320px;
  overflow: auto;
  border: 1px solid var(--tblr-border-color);
  border-radius: 6px;
}

.daily__table th {
  font-size: 12px;
  text-transform: none;
  letter-spacing: normal;
  white-space: normal;
}

.daily__table .daily__date {
  white-space: nowrap;
}

.daily__table a {
  display: inline-block;
  min-width: 32px;
  min-height: 32px;
  line-height: 32px;
}

@media (max-width: 767.98px) {
  .daily__bars,
  .daily__labels {
    gap: 2px;
  }

  .daily__label--wide {
    visibility: hidden;
  }

  .daily__table a {
    min-width: 44px;
    min-height: 44px;
    line-height: 44px;
    text-align: center;
  }

  /* Ponsel: setiap hari satu blok bertumpuk (nama kategori di depan angkanya), tanpa geser mendatar. */
  .daily__table thead {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
  }

  .daily__table tr {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0 14px;
    padding: 8px 12px;
    border-bottom: 1px solid var(--tblr-border-color-translucent);
  }

  .daily__table.daily__table th[scope='row'],
  .daily__table.daily__table td {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 0;
    border: 0;
    text-align: left;
  }

  .daily__table.daily__table th[scope='row'] {
    flex-basis: 100%;
    font-size: 13px;
  }

  .daily__table td::before {
    content: attr(data-label);
    color: var(--tblr-secondary);
    font-size: 12px;
    font-weight: 400;
  }
}
</style>
