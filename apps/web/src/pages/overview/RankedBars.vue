<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink, type RouteLocationRaw } from 'vue-router';

// Batang horizontal berperingkat, satu warna (besaran, bukan identitas): nama, batang, angka.
// Satu baris = satu tautan ke daftar Tiket dengan jumlah yang sama.
const props = defineProps<{
  items: Array<{ key: string; label: string; count: number; to: RouteLocationRaw }>;
  unit: string;
  empty: string;
}>();
const max = computed(() => Math.max(1, ...props.items.map((i) => i.count)));
</script>

<template>
  <p
    v-if="items.length === 0"
    class="text-secondary mb-0"
  >
    {{ empty }}
  </p>
  <ul
    v-else
    class="list-unstyled mb-0 ranked"
  >
    <li
      v-for="item in items"
      :key="item.key"
    >
      <RouterLink
        :to="item.to"
        class="row-link"
        :aria-label="`${item.label}: ${item.count.toLocaleString('id-ID')} ${unit}`"
      >
        <span class="name text-truncate">{{ item.label }}</span>
        <span
          class="track"
          aria-hidden="true"
        >
          <span
            class="bar"
            :style="{ width: `${(item.count / max) * 100}%` }"
          />
        </span>
        <span class="count">{{ item.count.toLocaleString('id-ID') }}</span>
      </RouterLink>
    </li>
  </ul>
</template>

<style scoped>
.ranked {
  --bar: #2a78d6;
}
:global([data-bs-theme='dark']) .ranked {
  --bar: #3987e5;
}
.row-link {
  display: grid;
  grid-template-columns: minmax(0, 12rem) minmax(0, 1fr) 3rem;
  grid-template-areas: 'name track count';
  align-items: center;
  column-gap: 0.75rem;
  min-height: 44px;
  color: inherit;
  text-decoration: none;
  border-radius: 4px;
  padding-inline: 0.25rem;
}
.row-link:hover,
.row-link:focus-visible {
  background: var(--tblr-bg-surface-secondary);
}
.row-link:hover .name {
  color: var(--tblr-primary);
  text-decoration: underline;
}
.name {
  grid-area: name;
}
.track {
  grid-area: track;
  display: block;
  height: 12px;
}
/* Di layar sempit nama di baris sendiri, batang dan angka di bawahnya. */
@media (max-width: 575.98px) {
  .row-link {
    grid-template-columns: minmax(0, 1fr) 3rem;
    grid-template-areas:
      'name name'
      'track count';
    padding-block: 0.25rem;
  }
}
.bar {
  display: block;
  height: 100%;
  min-width: 2px;
  border-radius: 0 4px 4px 0;
  background: var(--bar);
}
.count {
  grid-area: count;
  text-align: end;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
</style>
