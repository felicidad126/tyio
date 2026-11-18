<script setup lang="ts">
import { IconAlertTriangle, IconDeviceTv, IconRefresh } from '@tabler/icons-vue';
import {
  type ActiveTicketStatus,
  canOpenModule,
  type OverviewResponse,
  TICKET_FLAG_DAYS,
  TICKET_STATUS_LABELS,
} from '@tyio/shared';
import { storeToRefs } from 'pinia';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { RouterLink, type RouteLocationRaw } from 'vue-router';
import { ApiError } from '../../api/client';
import { overviewApi } from '../../api/overview';
import { ROLE_LABELS, tenantScopeLabel } from '../../labels';
import DataReceived from '../../components/DataReceived.vue';
import { useAuthStore } from '../../stores/auth';
import { useLiveNotices } from '../../stores/live';
import { TICKET_STATUS_BADGE } from '../tickets/detail/ticket-display';
import { formatDayRange } from './overview-display';
import RemoteMap from './map/RemoteMap.vue';
import RankedBars from './RankedBars.vue';
import TrendChart from './TrendChart.vue';

// Pola halaman: dashboard (2.1). Kondisi sekarang di atas (angka tiket aktif), analitik di
// bawah (per kategori/customer, tren, remote). Setiap angka adalah tautan ke daftar Tiket yang
// menghasilkan jumlah yang sama. Dimuat ulang tiap menit selama halaman terlihat.
const REFRESH_MS = 60_000;
const { user } = storeToRefs(useAuthStore());
const canOpenTickets = computed(() => (user.value ? canOpenModule(user.value.role, 'tiket') : false));

const data = ref<OverviewResponse | null>(null);
const state = ref<'loading' | 'ready' | 'error'>('loading');
const refreshing = ref(false);
const loadError = ref('');

async function load(): Promise<void> {
  refreshing.value = true;
  try {
    data.value = await overviewApi.get();
    state.value = 'ready';
    loadError.value = '';
  } catch (error) {
    loadError.value = error instanceof ApiError ? error.message : 'Overview gagal dimuat.';
    if (!data.value) state.value = 'error';
  } finally {
    refreshing.value = false;
  }
}

// Kabar perubahan tiket (2.2) memuat ulang angka saat itu juga; muat ulang tiap menit tetap
// berjalan untuk angka yang berubah karena waktu (Down ≥ 7 hari, hari baru di tren).
useLiveNotices(() => void load());

let timer: ReturnType<typeof setInterval> | undefined;
function onVisibility(): void {
  if (document.visibilityState === 'visible') void load();
}
onMounted(() => {
  void load();
  timer = setInterval(() => document.visibilityState === 'visible' && void load(), REFRESH_MS);
  document.addEventListener('visibilitychange', onVisibility);
});
onBeforeUnmount(() => {
  clearInterval(timer);
  document.removeEventListener('visibilitychange', onVisibility);
});

const list = (query: Record<string, string>): RouteLocationRaw => ({ name: 'tiket', query });
const STATUS_LINKS: Record<ActiveTicketStatus, Record<string, string>> = {
  terbuka: { status: 'terbuka' },
  dikerjakan: { status: 'dikerjakan' },
  pending: { tampilan: 'pending' },
  eskalasi: { tampilan: 'eskalasi' },
};
const tiles = computed(() => {
  const a = data.value?.active;
  if (!a) return [];
  return [
    ...(['terbuka', 'dikerjakan', 'pending', 'eskalasi'] as const).map((status) => ({
      key: status,
      label: TICKET_STATUS_LABELS[status],
      value: a.byStatus[status],
      to: list(STATUS_LINKS[status]),
      badge: TICKET_STATUS_BADGE[status],
    })),
    { key: 'tt', label: 'TT aktif', value: a.tt, to: list({ tampilan: 'tt' }), badge: 'badge bg-azure-lt' },
    {
      key: 'lama',
      label: `Down ≥ ${TICKET_FLAG_DAYS} hari`,
      value: a.flagged,
      to: list({ lama: String(TICKET_FLAG_DAYS) }),
      badge: 'badge bg-danger text-white',
    },
  ];
});

const categoryBars = computed(() =>
  (data.value?.byCategory ?? []).map((c) => ({
    key: c.category.id,
    label: c.category.name,
    count: c.count,
    to: list({ kategori: c.category.id }),
  })),
);
const customerBars = computed(() =>
  (data.value?.byCustomer ?? []).map((c) => ({
    key: c.tenant.id,
    label: c.tenant.name,
    count: c.count,
    to: list({ customer: c.tenant.id }),
  })),
);
const trendRange = computed(() =>
  data.value ? formatDayRange(data.value.trend[0]!.date, data.value.today) : '',
);
const topRange = computed(() =>
  data.value ? formatDayRange(data.value.topRemotes.from, data.value.topRemotes.to) : '',
);
const topLink = (remoteId: string) =>
  list({ tampilan: 'semua', remote: remoteId, dari: data.value!.topRemotes.from, sampai: data.value!.topRemotes.to });
</script>

<template>
  <div class="page-header mb-3 d-flex flex-wrap align-items-end gap-2">
    <div class="me-auto">
      <div class="page-pretitle">
        Overview
      </div>
      <h1 class="page-title">
        Selamat datang, {{ user?.displayName }}
      </h1>
      <!-- Angka di halaman ini mencakup customer yang boleh dilihat akun ini. -->
      <p
        v-if="user"
        class="text-secondary mb-0 mt-1"
      >
        <span>{{ ROLE_LABELS[user.role] }}</span> · <span>{{ tenantScopeLabel(user.tenantScope) }}</span>
      </p>
    </div>
    <div
      v-if="data"
      class="d-flex flex-wrap align-items-center gap-2"
    >
      <DataReceived
        :at="data.generatedAt"
        data-testid="overview-diperbarui"
      />
      <!-- Layar dinding untuk monitor besar di ruang NOC; tidak ditawarkan di ponsel. -->
      <RouterLink
        :to="{ name: 'wall' }"
        class="btn action-target d-none d-md-inline-flex"
        title="Tampilan untuk layar besar di ruang NOC, berjalan tanpa disentuh"
      >
        <IconDeviceTv
          class="icon"
          :size="18"
          aria-hidden="true"
        />
        Layar dinding
      </RouterLink>
      <button
        type="button"
        class="btn btn-icon action-target"
        aria-label="Muat ulang Overview"
        title="Muat ulang Overview"
        :disabled="refreshing"
        @click="load"
      >
        <IconRefresh
          :size="18"
          aria-hidden="true"
        />
      </button>
    </div>
  </div>

  <p
    v-if="state === 'loading'"
    class="text-secondary"
    aria-busy="true"
  >
    Memuat Overview…
  </p>

  <div
    v-else-if="state === 'error'"
    class="card"
  >
    <div class="empty">
      <div class="empty-icon text-danger">
        <IconAlertTriangle
          :size="40"
          aria-hidden="true"
        />
      </div>
      <p class="empty-title">
        Overview gagal dimuat
      </p>
      <p class="empty-subtitle text-secondary">
        {{ loadError }}
      </p>
      <div class="empty-action">
        <button
          type="button"
          class="btn btn-primary"
          @click="load"
        >
          Muat ulang
        </button>
      </div>
    </div>
  </div>

  <div
    v-else-if="data"
    class="overview"
    :class="{ refreshing }"
  >
    <div
      v-if="loadError"
      class="alert alert-warning"
      role="alert"
    >
      Gagal memperbarui: {{ loadError }} Angka di bawah dari pembaruan terakhir.
    </div>

    <section
      class="card mb-3"
      aria-labelledby="tiket-aktif"
    >
      <div class="card-body">
        <div class="row g-3 align-items-center">
          <div class="col-12 col-md-3">
            <h2
              id="tiket-aktif"
              class="subheader mb-1"
            >
              Tiket aktif
            </h2>
            <RouterLink
              v-if="canOpenTickets"
              :to="list({})"
              class="hero"
              :aria-label="`${data.active.total.toLocaleString('id-ID')} tiket aktif`"
            >
              {{ data.active.total.toLocaleString('id-ID') }}
            </RouterLink>
            <span
              v-else
              class="hero"
            >{{ data.active.total.toLocaleString('id-ID') }}</span>
            <div class="text-secondary small">
              belum Selesai
            </div>
          </div>
          <div class="col-12 col-md-9">
            <ul class="tiles list-unstyled mb-0">
              <li
                v-for="tile in tiles"
                :key="tile.key"
              >
                <RouterLink
                  :to="tile.to"
                  class="tile"
                  :aria-label="`${tile.label}: ${tile.value.toLocaleString('id-ID')} tiket`"
                >
                  <span :class="tile.badge">{{ tile.label }}</span>
                  <span class="tile-value">{{ tile.value.toLocaleString('id-ID') }}</span>
                </RouterLink>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>

    <section
      class="card mb-3"
      aria-labelledby="peta"
    >
      <div class="card-header">
        <div>
          <h2
            id="peta"
            class="card-title"
          >
            Peta remote
          </h2>
          <div class="card-subtitle text-secondary small mt-1">
            Warna menurut NPR aktif; titik yang berdekatan dikelompokkan dengan warna kondisi terparah.
            Klik titik untuk membuka remote.
          </div>
        </div>
      </div>
      <div class="card-body">
        <RemoteMap height="min(420px, 60vh)" />
      </div>
    </section>

    <div class="row row-cards mb-3">
      <div class="col-12 col-lg-6">
        <section
          class="card h-100"
          aria-labelledby="per-kategori"
        >
          <div class="card-header">
            <h2
              id="per-kategori"
              class="card-title"
            >
              Tiket aktif per kategori
            </h2>
          </div>
          <div class="card-body">
            <RankedBars
              :items="categoryBars"
              unit="tiket aktif"
              empty="Tidak ada tiket aktif."
            />
          </div>
        </section>
      </div>
      <div class="col-12 col-lg-6">
        <section
          class="card h-100"
          aria-labelledby="per-customer"
        >
          <div class="card-header">
            <h2
              id="per-customer"
              class="card-title"
            >
              Tiket aktif per customer
            </h2>
          </div>
          <div class="card-body">
            <RankedBars
              :items="customerBars"
              unit="tiket aktif"
              empty="Tidak ada tiket aktif."
            />
          </div>
        </section>
      </div>
    </div>

    <section
      class="card mb-3"
      aria-labelledby="tren"
    >
      <div class="card-header">
        <div>
          <h2
            id="tren"
            class="card-title"
          >
            NPR baru dan Selesai per hari
          </h2>
          <div class="card-subtitle text-secondary small mt-1">
            {{ trendRange }} (WIB) · NPR baru menurut waktu kejadian, Selesai menurut waktu online kembali
          </div>
        </div>
      </div>
      <div class="card-body">
        <TrendChart :trend="data.trend" />
      </div>
    </section>

    <section
      class="card"
      aria-labelledby="remote-teratas"
    >
      <div class="card-header">
        <div>
          <h2
            id="remote-teratas"
            class="card-title"
          >
            Remote paling sering bermasalah
          </h2>
          <div class="card-subtitle text-secondary small mt-1">
            Jumlah NPR menurut waktu kejadian, {{ topRange }}
          </div>
        </div>
      </div>
      <p
        v-if="data.topRemotes.items.length === 0"
        class="card-body text-secondary mb-0"
      >
        Belum ada NPR dalam rentang ini.
      </p>
      <ol
        v-else
        class="list-group list-group-flush top-remotes"
      >
        <li
          v-for="(item, index) in data.topRemotes.items"
          :key="item.remote.id"
          class="list-group-item d-flex align-items-center gap-3"
        >
          <span
            class="rank text-secondary"
            aria-hidden="true"
          >{{ index + 1 }}</span>
          <div class="me-auto remote-main">
            <RouterLink
              :to="{ name: 'remote-detail', params: { id: item.remote.id } }"
              class="fw-bold"
            >
              {{ item.remote.name }}
            </RouterLink>
            <div class="small text-secondary">
              <span class="font-monospace">{{ item.remote.siteId }}</span> · {{ item.remote.city }} · {{ item.tenant.name }}
            </div>
          </div>
          <RouterLink
            :to="topLink(item.remote.id)"
            class="btn btn-ghost-primary action-target count-link"
            :aria-label="`${item.count.toLocaleString('id-ID')} NPR di ${item.remote.siteId}, ${topRange}`"
          >
            {{ item.count.toLocaleString('id-ID') }} NPR
          </RouterLink>
        </li>
      </ol>
    </section>
  </div>
</template>

<style scoped>
.action-target {
  min-height: 44px;
  min-width: 44px;
}
/* Pembaruan berjalan: bingkai tetap, isi diredupkan sebentar (tanpa lompatan tata letak). */
.overview {
  transition: opacity 0.2s;
}
.overview.refreshing {
  opacity: 0.7;
}
.hero {
  display: inline-block;
  font-size: 3.5rem;
  font-weight: 600;
  line-height: 1.1;
  color: inherit;
  text-decoration: none;
}
.hero:hover,
.hero:focus-visible {
  color: var(--tblr-primary);
}
.tiles {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(8.5rem, 1fr));
  gap: 0.5rem;
}
.tile {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.5rem;
  min-height: 44px;
  padding: 0.75rem;
  border: 1px solid var(--tblr-border-color);
  border-radius: 4px;
  color: inherit;
  text-decoration: none;
}
.tile:hover,
.tile:focus-visible {
  border-color: var(--tblr-primary);
}
.tile-value {
  font-size: 1.75rem;
  font-weight: 600;
  line-height: 1;
}
.rank {
  width: 1.5rem;
  text-align: end;
  font-variant-numeric: tabular-nums;
}
.remote-main {
  min-width: 0;
}
.count-link {
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
@media (prefers-reduced-motion: reduce) {
  .overview {
    transition: none;
  }
}
</style>
