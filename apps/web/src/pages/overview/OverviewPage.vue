<script setup lang="ts">
import { IconChevronRight, IconClockHour4, IconRefresh } from '@tabler/icons-vue';
import {
  isOverviewPeriod,
  type Overview,
  type OverviewCount,
  OVERVIEW_DAY_ZONE,
  OVERVIEW_DAY_ZONE_IANA,
  OVERVIEW_PERIOD_DEFAULT,
  OVERVIEW_PERIODS,
  TICKET_STATUS_LABELS,
  type TicketStatus,
} from '@npr/shared';
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { type RouteLocationRaw, useRoute, useRouter } from 'vue-router';
import LiveStatus from '../../components/LiveStatus.vue';
import PageHeader from '../../components/PageHeader.vue';
import { debounced, useStream } from '../../composables/useStream';
import TicketStatusPill from '../tickets/TicketStatusPill.vue';
import { ticketApi } from '../tickets/ticket-api';
import { queueLocation } from '../tickets/list/queue-query';
import { durationLabel } from '../tickets/list/relative-time';
import OverviewBarList, { type BarItem } from './OverviewBarList.vue';
import OverviewDailyChart from './OverviewDailyChart.vue';
import { overviewApi } from './overview-api';

// Overview (langkah 2.1, mockup Main): angka NPR saat ini dan analitik kejadian dalam periode.
// Setiap angka membuka antrean dengan saringan yang dikirim API bersama angka itu, jadi
// jumlahnya sama persis. Periode (T108) dan customer disimpan di alamat halaman.
// Pembaruan langsung (2.2, T128): setiap perubahan NPR memuat ulang Overview diam-diam.

const route = useRoute();
const router = useRouter();
const number = new Intl.NumberFormat('id-ID');
const clockFormat = new Intl.DateTimeFormat('id-ID', {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: OVERVIEW_DAY_ZONE_IANA,
});

const one = (value: unknown) => (typeof value === 'string' ? value : '');
const period = computed(() => {
  const value = Number(one(route.query.periode));
  return isOverviewPeriod(value) ? value : OVERVIEW_PERIOD_DEFAULT;
});
const customer = computed(() => one(route.query.customer));

const customers = ref<Array<{ id: string; name: string }>>([]);
const data = ref<Overview | null>(null);
/** Waktu data yang tampil diterima (ms epoch), untuk penanda langsung. */
const loadedAt = ref<number | null>(null);
const loading = ref(true);
const error = ref('');
const now = ref(Date.now());

void ticketApi.customers().then((list) => (customers.value = list)).catch(() => undefined);

/** Nomor permintaan terakhir: jawaban yang lebih lama (periode/customer usang) diabaikan. */
let latest = 0;
/** `silent`: muat ulang karena pembaruan langsung, tanpa meredupkan layar. */
async function load(silent = false): Promise<void> {
  const mine = ++latest;
  if (!silent) loading.value = true;
  error.value = '';
  try {
    const result = await overviewApi.get({ period: period.value, tenantId: customer.value || undefined });
    if (mine === latest) {
      data.value = result;
      now.value = Date.now();
      loadedAt.value = Date.now();
    }
  } catch (cause) {
    if (mine === latest) error.value = cause instanceof Error ? cause.message : 'Overview gagal dimuat.';
  } finally {
    if (mine === latest) loading.value = false;
  }
}
watch([period, customer], () => void load(), { immediate: true });

const refresh = debounced(() => void load(true), 1_000);
useStream({
  onChange: (event) => {
    if (!customer.value || event.tenantId === customer.value) refresh.schedule();
  },
  onResync: refresh.schedule,
});

const clock = setInterval(() => (now.value = Date.now()), 60_000);
onBeforeUnmount(() => clearInterval(clock));

function setQuery(change: { periode?: string; customer?: string }): void {
  const next: Record<string, string> = { ...(route.query as Record<string, string>), ...change };
  if (next.periode === String(OVERVIEW_PERIOD_DEFAULT)) delete next.periode;
  for (const key of Object.keys(next)) if (!next[key]) delete next[key];
  void router.replace({ query: next });
}

const periodLink = (days: number) => ({
  query: { ...route.query, periode: days === OVERVIEW_PERIOD_DEFAULT ? undefined : String(days) },
});

const link = (count: OverviewCount): RouteLocationRaw => queueLocation(count.filter);
/** Kunci baris daftar per status adalah statusnya. */
const statusOf = (key: string) => key as TicketStatus;
const asOf = computed(() =>
  data.value ? `${clockFormat.format(new Date(data.value.generatedAt)).replace('.', ':')} ${OVERVIEW_DAY_ZONE}` : '',
);
const customerName = computed(() => customers.value.find((item) => item.id === customer.value)?.name ?? '');
const showCustomers = computed(() => customers.value.length > 1 && !customer.value);
/** Peta remote (langkah 2.3, T140) dengan customer yang sama. */
const mapLink = computed<RouteLocationRaw>(() => ({
  name: 'remote',
  query: customer.value ? { tampilan: 'peta', customer: customer.value } : { tampilan: 'peta' },
}));
const ttLink = computed<RouteLocationRaw>(() => ({
  name: 'tiket',
  query: customer.value ? { daftar: 'tt', customer: customer.value } : { daftar: 'tt' },
}));

const statusItems = computed<BarItem[]>(() =>
  (data.value?.byStatus ?? []).map((item) => ({
    key: item.status,
    label: TICKET_STATUS_LABELS[item.status],
    count: item.count,
    ariaLabel: `${item.count} NPR ${TICKET_STATUS_LABELS[item.status]}`,
    to: link(item),
  })),
);
const categoryItems = computed<BarItem[]>(() =>
  (data.value?.byCategory ?? []).map((item) => ({
    key: item.name,
    label: item.name,
    count: item.count,
    ariaLabel: `${item.count} NPR berjalan berkategori ${item.name}`,
    to: link(item),
  })),
);
const customerItems = computed<BarItem[]>(() =>
  (data.value?.byCustomer ?? []).map((item) => ({
    key: item.tenantId,
    label: item.name,
    count: item.count,
    ariaLabel: `${item.count} NPR berjalan di ${item.name}`,
    to: link(item),
  })),
);
const regionItems = computed<BarItem[]>(() =>
  (data.value?.regions ?? []).map((item) => ({
    key: item.region,
    label: item.region,
    sublabel: `${number.format(item.remotes)} remote aktif`,
    count: item.count,
    countText: `${number.format(item.count)} NPR`,
    ariaLabel: `${item.count} NPR berjalan di wilayah ${item.region}`,
    to: link(item),
  })),
);
const frequentItems = computed<BarItem[]>(() =>
  (data.value?.frequent ?? []).map((item) => ({
    key: item.remote.id,
    label: item.remote.name,
    sublabel: [item.remote.code, showCustomers.value ? item.remote.customerName : '', item.remote.city]
      .filter(Boolean)
      .join(' · '),
    count: item.count,
    countText: `${number.format(item.count)} NPR`,
    ariaLabel: `${item.count} NPR di ${item.remote.name} dalam ${data.value?.period.days} hari`,
    to: link(item),
    labelTo: { name: 'remote-detail', params: { id: item.remote.id } },
  })),
);
</script>

<template>
  <div class="overview">
    <PageHeader
      title="Overview"
      :subtitle="`Kondisi NPR ${customerName || 'semua customer'} saat ini. Klik angka mana pun untuk membuka daftarnya.`"
    >
      <template #pretitle>
        <LiveStatus :data-at="loadedAt" />
      </template>
      <template #actions>
        <div
          v-if="customers.length > 1"
          class="overview__customer"
        >
          <label
            class="form-label mb-0"
            for="overview-customer"
          >Customer</label>
          <select
            id="overview-customer"
            class="form-select"
            :value="customer"
            @change="setQuery({ customer: ($event.target as HTMLSelectElement).value })"
          >
            <option value="">
              Semua customer
            </option>
            <option
              v-for="item in customers"
              :key="item.id"
              :value="item.id"
            >
              {{ item.name }}
            </option>
          </select>
        </div>
        <button
          type="button"
          class="btn overview__refresh"
          :disabled="loading"
          @click="load()"
        >
          <IconRefresh
            size="18"
            aria-hidden="true"
          />
          Muat ulang
        </button>
      </template>
    </PageHeader>

    <div
      v-if="error"
      class="alert alert-danger"
      role="alert"
    >
      {{ error }}
    </div>

    <p
      v-if="!data && loading"
      class="text-secondary"
      role="status"
    >
      Memuat Overview…
    </p>

    <div
      v-if="data"
      class="overview__body"
      :aria-busy="loading"
    >
      <section
        aria-label="Angka utama"
        class="overview__stats"
      >
        <div class="card stat">
          <div class="card-body">
            <span class="stat__label">NPR berjalan</span>
            <RouterLink
              :to="link(data.open)"
              class="stat__value stretched-link"
              :aria-label="`${data.open.count} NPR berjalan`"
            >
              {{ number.format(data.open.count) }}
            </RouterLink>
            <span class="stat__sub">
              <RouterLink
                :to="link(data.pending)"
                class="stat__inner"
              >{{ number.format(data.pending.count) }} pending</RouterLink> ·
              <RouterLink
                :to="link(data.escalated)"
                class="stat__inner"
              >{{ number.format(data.escalated.count) }} eskalasi</RouterLink>
            </span>
            <span class="stat__sub">
              <RouterLink
                :to="link(data.ready)"
                class="stat__inner"
              >{{ number.format(data.ready.count) }} pulih · siap ditutup</RouterLink>
            </span>
          </div>
        </div>
        <div class="card stat">
          <div class="card-body">
            <span class="stat__label">TT aktif</span>
            <RouterLink
              :to="ttLink"
              class="stat__value stretched-link"
              :aria-label="`${data.activeTroubleTickets} TT aktif`"
            >
              {{ number.format(data.activeTroubleTickets) }}
            </RouterLink>
            <span class="stat__sub">menunggu Service Delivery</span>
          </div>
        </div>
        <div class="card stat">
          <div class="card-body">
            <span class="stat__label">NPR baru hari ini</span>
            <RouterLink
              :to="link(data.createdToday)"
              class="stat__value stretched-link"
              :aria-label="`${data.createdToday.count} NPR baru hari ini`"
            >
              {{ number.format(data.createdToday.count) }}
            </RouterLink>
            <span class="stat__sub">sejak 00:00 {{ OVERVIEW_DAY_ZONE }}, termasuk yang ditutup</span>
          </div>
        </div>
        <div class="card stat">
          <div class="card-body">
            <span class="stat__label">NPR ditutup hari ini</span>
            <RouterLink
              :to="link(data.closedToday)"
              class="stat__value stretched-link"
              :aria-label="`${data.closedToday.count} NPR ditutup hari ini`"
            >
              {{ number.format(data.closedToday.count) }}
            </RouterLink>
            <span class="stat__sub">sejak 00:00 {{ OVERVIEW_DAY_ZONE }}</span>
          </div>
        </div>
      </section>

      <div class="row row-cards">
        <div class="col-12 col-xl-7">
          <section
            class="card h-100"
            aria-labelledby="judul-tindakan"
          >
            <div class="card-header overview__card-header">
              <div>
                <h2
                  id="judul-tindakan"
                  class="card-title"
                >
                  Perlu tindakan sekarang
                </h2>
                <p class="card-subtitle">
                  NPR berjalan dengan gangguan terlama
                </p>
              </div>
              <RouterLink
                :to="link(data.open)"
                class="overview__more"
              >
                Buka antrean ({{ number.format(data.open.count) }})
              </RouterLink>
            </div>
            <p
              v-if="data.urgent.length === 0"
              class="card-body text-secondary mb-0"
            >
              Tidak ada NPR berjalan.
            </p>
            <ul
              v-else
              class="urgent"
            >
              <li
                v-for="item in data.urgent"
                :key="item.id"
                class="urgent__row"
              >
                <span class="urgent__age">
                  <IconClockHour4
                    size="14"
                    aria-hidden="true"
                  />
                  <span class="visually-hidden">Gangguan </span>{{ durationLabel(item.startedAt, now) }}
                </span>
                <span class="urgent__main">
                  <RouterLink
                    :to="{ name: 'ticket-detail', params: { id: item.id } }"
                    class="urgent__number stretched-link"
                  >{{ item.number }}</RouterLink>
                  <span class="urgent__remote">
                    {{ item.remote.name }}<template v-if="item.remote.city"> · {{ item.remote.city }}</template>
                    · {{ item.remote.zone }}<template v-if="showCustomers"> · {{ item.customerName }}</template>
                  </span>
                </span>
                <TicketStatusPill :status="item.status" />
                <IconChevronRight
                  size="18"
                  class="urgent__chevron"
                  aria-hidden="true"
                />
              </li>
            </ul>
          </section>
        </div>
        <div class="col-12 col-xl-5">
          <section
            class="card h-100"
            aria-labelledby="judul-wilayah"
          >
            <div class="card-header">
              <div>
                <h2
                  id="judul-wilayah"
                  class="card-title"
                >
                  NPR berjalan per wilayah
                </h2>
                <p class="card-subtitle">
                  Saat ini · terbanyak dulu · jumlah remote aktif di bawah nama wilayah
                </p>
              </div>
            </div>
            <div class="card-body pt-2">
              <OverviewBarList
                v-if="regionItems.length > 0"
                :items="regionItems"
                label="NPR berjalan per wilayah"
              />
              <p
                v-else
                class="text-secondary mb-0"
              >
                Belum ada remote aktif.
              </p>
            </div>
            <div class="card-footer">
              <RouterLink :to="mapLink">
                Lihat peta lengkap di halaman Remote
              </RouterLink>
            </div>
          </section>
        </div>
      </div>

      <div class="row row-cards">
        <div
          class="col-12"
          :class="showCustomers ? 'col-lg-4' : 'col-lg-6'"
        >
          <section
            class="card h-100"
            aria-labelledby="judul-status"
          >
            <div class="card-header">
              <h2
                id="judul-status"
                class="card-title"
              >
                NPR berjalan per status
              </h2>
            </div>
            <div class="card-body pt-2">
              <OverviewBarList
                :items="statusItems"
                label="NPR berjalan per status"
              >
                <template #label="{ item }">
                  <TicketStatusPill
                    :status="statusOf(item.key)"
                    class="align-self-start"
                  />
                </template>
              </OverviewBarList>
            </div>
          </section>
        </div>
        <div
          class="col-12"
          :class="showCustomers ? 'col-lg-4' : 'col-lg-6'"
        >
          <section
            class="card h-100"
            aria-labelledby="judul-kategori"
          >
            <div class="card-header">
              <h2
                id="judul-kategori"
                class="card-title"
              >
                NPR berjalan per kategori
              </h2>
            </div>
            <div class="card-body pt-2">
              <OverviewBarList
                v-if="categoryItems.length > 0"
                :items="categoryItems"
                label="NPR berjalan per kategori"
              />
              <p
                v-else
                class="text-secondary mb-0"
              >
                Tidak ada NPR berjalan.
              </p>
            </div>
          </section>
        </div>
        <div
          v-if="showCustomers"
          class="col-12 col-lg-4"
        >
          <section
            class="card h-100"
            aria-labelledby="judul-customer"
          >
            <div class="card-header">
              <h2
                id="judul-customer"
                class="card-title"
              >
                NPR berjalan per customer
              </h2>
            </div>
            <div class="card-body pt-2">
              <OverviewBarList
                v-if="customerItems.length > 0"
                :items="customerItems"
                label="NPR berjalan per customer"
              />
              <p
                v-else
                class="text-secondary mb-0"
              >
                Tidak ada NPR berjalan.
              </p>
            </div>
          </section>
        </div>
      </div>

      <div class="overview__period-head">
        <div>
          <h2 class="overview__section-title">
            Kejadian dalam periode
          </h2>
          <p class="text-secondary mb-0">
            NPR baru, termasuk yang sudah ditutup, per hari menurut {{ OVERVIEW_DAY_ZONE }}.
          </p>
        </div>
        <nav
          class="periods"
          aria-label="Periode"
        >
          <RouterLink
            v-for="days in OVERVIEW_PERIODS"
            :key="days"
            :to="periodLink(days)"
            replace
            class="periods__item"
            :aria-current="period === days ? 'page' : undefined"
          >
            {{ days }} hari
          </RouterLink>
        </nav>
      </div>

      <div class="row row-cards">
        <div class="col-12 col-xl-7">
          <section
            class="card h-100"
            aria-labelledby="judul-harian"
          >
            <div class="card-header">
              <h2
                id="judul-harian"
                class="card-title"
              >
                NPR baru per hari
              </h2>
            </div>
            <div class="card-body">
              <OverviewDailyChart
                :daily="data.daily"
                :today="data.today"
                :as-of="asOf"
              />
            </div>
          </section>
        </div>
        <div class="col-12 col-xl-5">
          <section
            class="card h-100"
            aria-labelledby="judul-sering"
          >
            <div class="card-header">
              <div>
                <h2
                  id="judul-sering"
                  class="card-title"
                >
                  Remote paling sering bermasalah
                </h2>
                <p class="card-subtitle">
                  Jumlah NPR per remote · {{ data.period.days }} hari terakhir
                </p>
              </div>
            </div>
            <div class="card-body pt-2">
              <OverviewBarList
                v-if="frequentItems.length > 0"
                :items="frequentItems"
                label="Remote paling sering bermasalah"
              />
              <p
                v-else
                class="text-secondary mb-0"
              >
                Belum ada NPR dalam periode ini.
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Palet seri tervalidasi (lihat series.ts); tema gelap memakai langkah gelapnya sendiri. */
.overview {
  --series-1: #2a78d6;
  --series-2: #eb6834;
  --series-3: #1baf7a;
  --series-4: #eda100;
  --series-5: #e87ba4;
  --series-6: #008300;
  --series-7: #6250d6;
  --series-other: #9aa5b1;
}

[data-bs-theme='dark'] .overview {
  --series-1: #3987e5;
  --series-2: #d95926;
  --series-3: #199e70;
  --series-4: #c98500;
  --series-5: #d55181;
  --series-6: #0ca30c;
  --series-7: #9085e9;
  --series-other: #66727f;
}

.overview__customer {
  display: flex;
  align-items: center;
  gap: 8px;
}

.overview__customer .form-select {
  min-width: 180px;
}

.overview__refresh {
  gap: 6px;
}

.overview__body {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.overview__body[aria-busy='true'] {
  opacity: 0.6;
}

.overview__stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
}

.stat .card-body {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.stat__label {
  color: var(--tblr-secondary);
  font-size: 13px;
  font-weight: 500;
}

.stat__value {
  align-self: flex-start;
  color: var(--tblr-body-color);
  font-size: 32px;
  font-weight: 700;
  line-height: 1.1;
}

.stat__value:hover,
.stat__value:focus-visible {
  color: var(--tblr-primary);
}

.stat__sub {
  color: var(--tblr-secondary);
  font-size: 13px;
}

/* Tautan di dalam kartu berada di atas tautan kartu (stretched-link). */
.stat__inner {
  position: relative;
  z-index: 2;
  display: inline-block;
  min-height: 32px;
  line-height: 32px;
  white-space: nowrap;
}

.overview__card-header {
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 8px;
}

.overview__more {
  font-size: 13px;
  font-weight: 600;
}

.urgent {
  margin: 0;
  padding: 0 20px;
  list-style: none;
}

.urgent__row {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  padding: 14px 0;
  border-top: 1px solid var(--tblr-border-color-translucent);
}

.urgent__row:first-child {
  border-top: 0;
}

.urgent__row:hover {
  background: var(--tblr-active-bg);
}

.urgent__age {
  display: inline-flex;
  flex: 0 0 96px;
  align-items: center;
  gap: 4px;
  min-height: 26px;
  padding: 0 8px;
  border-radius: 999px;
  background: var(--tblr-bg-surface-secondary);
  color: var(--tblr-body-color);
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}

.urgent__main {
  display: flex;
  flex: 1 1 220px;
  flex-direction: column;
  min-width: 0;
}

.urgent__number {
  font-family: var(--tblr-font-monospace);
  font-weight: 600;
  overflow-wrap: anywhere;
}

.urgent__remote {
  color: var(--tblr-secondary);
  font-size: 13px;
}

.urgent__chevron {
  color: var(--tblr-secondary);
}

.overview__period-head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  margin-top: 8px;
}

.overview__section-title {
  margin: 0 0 2px;
  font-size: 17px;
  font-weight: 600;
}

.periods {
  display: inline-flex;
  padding: 2px;
  border: 1px solid var(--tblr-border-color);
  border-radius: 8px;
  background: var(--tblr-bg-surface);
}

.periods__item {
  display: inline-flex;
  align-items: center;
  min-height: 36px;
  padding: 0 14px;
  border-radius: 6px;
  color: var(--tblr-secondary);
  font-weight: 500;
  text-decoration: none;
  white-space: nowrap;
}

.periods__item[aria-current='page'] {
  background: var(--tblr-primary);
  color: #ffffff;
  font-weight: 600;
}

@media (max-width: 1199.98px) {
  .overview__stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 767.98px) {
  .periods__item,
  .stat__inner {
    min-height: 44px;
    line-height: 44px;
  }

  .overview__stats {
    gap: 12px;
  }

  .stat .card-body {
    padding: 12px;
  }

  .stat__value {
    font-size: 28px;
  }

  /* Ponsel: lama gangguan dan status di baris pertama, nomor dan remote di bawahnya. */
  .urgent {
    padding: 0 16px;
  }

  .urgent__main {
    flex-basis: 100%;
    order: 3;
  }

  .urgent__chevron {
    display: none;
  }

  .overview__customer {
    flex: 1 1 100%;
  }

  .overview__customer .form-select {
    flex: 1 1 auto;
    min-width: 0;
  }
}

</style>
