<script setup lang="ts">
import { computed } from 'vue';
import type { RouteLocationRaw } from 'vue-router';

// Daftar angka dengan batang tipis (mockup: Remote down per wilayah, Remote paling sering
// bermasalah). Angkanya tautan ke antrean dengan jumlah yang sama; seluruh baris bisa diklik.
// `labelTo` (mis. halaman remote) menjadi tautan kedua di atas tautan baris.

export interface BarItem {
  key: string;
  label: string;
  sublabel?: string;
  count: number;
  /** Teks angka, mis. "5 NPR"; bawaan angkanya saja. */
  countText?: string;
  /** Nama aksesibel tautan angka, mis. "5 NPR berjalan di Sulawesi". */
  ariaLabel: string;
  to: RouteLocationRaw;
  labelTo?: RouteLocationRaw;
}

const props = defineProps<{ items: BarItem[]; label: string }>();
defineSlots<{ label?(props: { item: BarItem }): unknown }>();

const number = new Intl.NumberFormat('id-ID');
const max = computed(() => Math.max(1, ...props.items.map((item) => item.count)));
const width = (count: number) => (count === 0 ? 0 : Math.max(3, Math.round((count / max.value) * 100)));
</script>

<template>
  <ul
    class="bar-list"
    :aria-label="label"
  >
    <li
      v-for="item in items"
      :key="item.key"
      class="bar-list__row"
    >
      <span class="bar-list__head">
        <span class="bar-list__label">
          <slot
            name="label"
            :item="item"
          >
            <RouterLink
              v-if="item.labelTo"
              :to="item.labelTo"
              class="bar-list__name bar-list__name--link"
            >{{ item.label }}</RouterLink>
            <span
              v-else
              class="bar-list__name"
            >{{ item.label }}</span>
          </slot>
          <span
            v-if="item.sublabel"
            class="bar-list__sub"
          >{{ item.sublabel }}</span>
        </span>
        <RouterLink
          :to="item.to"
          class="bar-list__count stretched-link"
          :aria-label="item.ariaLabel"
        >{{ item.countText ?? number.format(item.count) }}</RouterLink>
      </span>
      <span
        class="bar-list__track"
        aria-hidden="true"
      ><span
        class="bar-list__bar"
        :style="{ width: `${width(item.count)}%` }"
      /></span>
    </li>
  </ul>
</template>

<style scoped>
.bar-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.bar-list__row {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 0;
  border-top: 1px solid var(--tblr-border-color-translucent);
}

.bar-list__row:first-child {
  border-top: 0;
}

.bar-list__row:hover {
  background: var(--tblr-active-bg);
}

.bar-list__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.bar-list__label {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.bar-list__name {
  font-weight: 600;
  overflow-wrap: anywhere;
}

/* Tautan nama di atas tautan baris (stretched-link). */
.bar-list__name--link {
  position: relative;
  z-index: 2;
}

.bar-list__sub {
  color: var(--tblr-secondary);
  font-size: 13px;
}

.bar-list__count {
  flex: 0 0 auto;
  font-size: 15px;
  font-weight: 700;
  color: var(--tblr-body-color);
  white-space: nowrap;
}

.bar-list__count:hover,
.bar-list__count:focus-visible {
  color: var(--tblr-primary);
  text-decoration: underline;
}

.bar-list__track {
  display: block;
  height: 4px;
  overflow: hidden;
  border-radius: 2px;
  background: var(--tblr-border-color-translucent);
}

.bar-list__bar {
  display: block;
  height: 100%;
  border-radius: 2px;
  background: var(--series-1);
}

@media (max-width: 767.98px) {
  .bar-list__row {
    min-height: 44px;
  }
}
</style>
