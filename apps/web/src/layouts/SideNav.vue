<script setup lang="ts">
import type { SessionUser } from '@npr/shared';
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue';
import { useRoute } from 'vue-router';
import AppLogo from '../components/AppLogo.vue';
import { debounced, useStream } from '../composables/useStream';
import { ticketApi } from '../pages/tickets/ticket-api';
import { type ModulePage, MONITOR_PAGE, navFor } from '../navigation';

const props = defineProps<{ user: SessionUser }>();
const route = useRoute();
const groups = computed(() => navFor(props.user.role));
const nav = useTemplateRef<HTMLElement>('nav');

/**
 * Menu aktif dihitung sendiri, bukan dari kelas aktif RouterLink: Overview berada di
 * path kosong di bawah kerangka, sehingga RouterLink menganggapnya aktif di setiap halaman.
 * Halaman turunan kelak (mis. /tiket/NPR-1) tetap menyalakan menu induknya.
 */
function isActive(item: ModulePage): boolean {
  if (item.path === '/') return route.name === item.name;
  return route.path === item.path || route.path.startsWith(`${item.path}/`);
}

/**
 * Angka di menu Tiket = NPR berjalan dalam cakupan customer pengguna (T130), sama dengan
 * "Semua terbuka" di antrean; diperbarui langsung (2.2). Kosong selama belum termuat.
 */
const openCount = ref<number | null>(null);
const number = new Intl.NumberFormat('id-ID');
async function loadCount(): Promise<void> {
  try {
    openCount.value = (await ticketApi.list({ pageSize: '1' })).counts.semua;
  } catch {
    // Gagal: angka lama tetap; dicoba lagi pada perubahan berikutnya.
  }
}
void loadCount();
const countRefresh = debounced(() => void loadCount(), 1_500);
useStream({ onChange: countRefresh.schedule, onResync: countRefresh.schedule });

// Di layar sempit menu bergulir mendatar; pastikan menu yang aktif terlihat.
watch(
  () => route.path,
  async () => {
    await nextTick();
    nav.value?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  },
  { immediate: true },
);
</script>

<template>
  <!-- Selalu gelap, juga di tema terang (mockup). -->
  <aside
    class="side"
    data-bs-theme="dark"
  >
    <RouterLink
      to="/"
      class="side__brand"
      aria-label="Tyio NOC, ke Overview"
    >
      <AppLogo class="side__logo" />
      <span class="side__brand-text">
        <span class="side__brand-name">Tyio NOC</span>
        <span class="side__brand-sub">Portal NOC Terpusat</span>
      </span>
    </RouterLink>

    <nav
      ref="nav"
      class="side__nav"
      aria-label="Menu utama"
    >
      <div
        v-for="group in groups"
        :key="group.title"
        class="side__group"
      >
        <span
          :id="`menu-${group.title}`"
          class="side__title"
        >{{ group.title }}</span>
        <ul
          class="side__items"
          :aria-labelledby="`menu-${group.title}`"
        >
          <li
            v-for="item in group.items"
            :key="item.name"
          >
            <RouterLink
              v-slot="{ href, navigate }"
              :to="{ name: item.name }"
              custom
            >
              <a
                :href="href"
                class="side__link"
                :class="{ 'is-active': isActive(item) }"
                :aria-current="isActive(item) ? 'page' : undefined"
                @click="navigate"
              >
                <component
                  :is="item.icon"
                  class="side__icon"
                  size="18"
                  stroke="2"
                  aria-hidden="true"
                />
                <span>{{ item.label }}</span>
                <span
                  v-if="item.name === 'tiket' && openCount !== null"
                  class="side__count"
                  data-testid="angka-menu-tiket"
                  :aria-label="`${openCount} NPR berjalan`"
                >{{ number.format(openCount) }}</span>
              </a>
            </RouterLink>
          </li>
        </ul>
      </div>
    </nav>

    <RouterLink
      v-slot="{ href, navigate }"
      :to="{ name: MONITOR_PAGE.name }"
      custom
    >
      <a
        :href="href"
        class="side__link side__foot"
        :class="{ 'is-active': isActive(MONITOR_PAGE) }"
        :aria-current="isActive(MONITOR_PAGE) ? 'page' : undefined"
        @click="navigate"
      >
        <component
          :is="MONITOR_PAGE.icon"
          class="side__icon"
          size="18"
          stroke="2"
          aria-hidden="true"
        />
        <span>{{ MONITOR_PAGE.label }}</span>
      </a>
    </RouterLink>
  </aside>
</template>

<style scoped>
/* Angka di menu (mockup): pil gelap kecil di ujung kanan. */
.side__count {
  margin-left: auto;
  min-width: 22px;
  height: 20px;
  padding: 0 6px;
  border-radius: 999px;
  background: #2c3a4d;
  color: #e6ebf1;
  font-size: 12px;
  font-weight: 600;
  line-height: 20px;
  text-align: center;
}

.side {
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 20px 12px;
  background: #182433;
  color: #c3cdd9;
}

.side__brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 10px;
  color: inherit;
  text-decoration: none;
}

.side__logo {
  flex: 0 0 auto;
  width: 34px;
  height: 34px;
}

.side__brand-text {
  display: flex;
  flex-direction: column;
}

.side__brand-name {
  font-size: 15px;
  font-weight: 700;
  color: #ffffff;
  white-space: nowrap;
}

.side__brand-sub,
.side__title {
  font-size: 12px;
  color: #8d9aab;
}

.side__nav {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.side__group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.side__title {
  padding: 0 10px 4px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.side__items {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.side__link {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 40px;
  padding: 0 10px;
  border-radius: 6px;
  color: #c3cdd9;
  font-weight: 500;
  text-decoration: none;
  white-space: nowrap;
}

.side__link:hover {
  background: rgb(255 255 255 / 0.06);
  color: #ffffff;
}

.side__link.is-active {
  background: rgb(255 255 255 / 0.1);
  color: #ffffff;
  font-weight: 600;
}

.side__link:focus-visible {
  outline: 2px solid #86b6ef;
  outline-offset: -2px;
}

.side__icon {
  flex: 0 0 auto;
}

.side__foot {
  margin-top: auto;
  border: 1px solid #2c3a4d;
}

/* Bilah mendatar yang bisa digulir; judul kelompok disembunyikan (mockup). */
@media (max-width: 900px) {
  .side {
    flex-direction: row;
    align-items: center;
    gap: 12px;
    padding: 8px 12px;
    overflow-x: auto;
    scrollbar-width: thin;
  }

  .side__brand-sub,
  .side__title {
    display: none;
  }

  .side__nav,
  .side__group,
  .side__items {
    flex-direction: row;
    gap: 2px;
  }

  .side__foot {
    margin-top: 0;
  }

  /* Area sentuh minimal 44px di ponsel. */
  .side__link {
    min-height: 44px;
  }
}
</style>
