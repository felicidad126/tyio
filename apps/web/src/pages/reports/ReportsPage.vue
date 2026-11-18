<script setup lang="ts">
import { IconAlertTriangle, IconDownload, IconFileSpreadsheet, IconPrinter, IconRefresh } from '@tabler/icons-vue';
import {
  canOpenModule,
  formatInZone,
  isDateString,
  type MasterItem,
  type NprReportFigures,
  type NprReportGroup,
  type NprReportQuery,
  type NprReportResponse,
  REPLACED_PART_LABELS,
  REPORT_EXPORT_MAX_ROWS,
  REPORT_STATUS_FILTERS,
  REPORT_STATUS_LABELS,
  type ReportStatusFilter,
  type TenantRef,
  TICKET_STATUS_LABELS,
  wibDate,
} from '@tyio/shared';
import { storeToRefs } from 'pinia';
import { computed, ref, watch } from 'vue';
import { type LocationQuery, RouterLink, type RouteLocationRaw, useRoute, useRouter } from 'vue-router';
import { ApiError } from '../../api/client';
import { masterApi } from '../../api/master';
import { reportsApi } from '../../api/reports';
import { tenantsApi } from '../../api/tenants';
import DataReceived from '../../components/DataReceived.vue';
import TicketNumber from '../../components/TicketNumber.vue';
import { useAuthStore } from '../../stores/auth';
import { formatDayRange } from '../overview/overview-display';
import { formatMinutes, TICKET_STATUS_BADGE } from '../tickets/detail/ticket-display';
import { periodPresets, type ReportFilters, ticketListQuery } from './report-display';

// Pola halaman: analitik. Periode dan saringan di atas, angka ringkas, rincian per customer dan
// kategori, lalu daftar NPR. Semua saringan tersimpan di alamat (bisa dibagikan). Angka menurut
// tanggal kejadian WIB dan sama dengan daftar Tiket yang dituju tautannya. Laporan tidak dimuat
// ulang sendiri saat ada perubahan (T98): angka tidak berubah selagi dibaca atau dicetak.
const route = useRoute();
const router = useRouter();
const { user } = storeToRefs(useAuthStore());
const canOpenTickets = computed(() => (user.value ? canOpenModule(user.value.role, 'tiket') : false));
const WIB = 'Asia/Jakarta';

const one = (value: LocationQuery[string] | undefined) => (typeof value === 'string' ? value : '');
const date = (value: string) => (isDateString(value) ? value : '');
const filters = computed<ReportFilters & { halaman: number }>(() => ({
  dari: date(one(route.query.dari)),
  sampai: date(one(route.query.sampai)),
  customer: one(route.query.customer),
  kategori: one(route.query.kategori),
  jarkom: one(route.query.jarkom),
  status: (REPORT_STATUS_FILTERS as readonly string[]).includes(one(route.query.status))
    ? (one(route.query.status) as ReportStatusFilter)
    : 'semua',
  halaman: Math.max(1, Number(one(route.query.halaman)) || 1),
}));
const apiQuery = computed<Omit<NprReportQuery, 'page'>>(() => {
  const f = filters.value;
  return {
    from: f.dari || undefined,
    to: f.sampai || undefined,
    tenantId: f.customer || undefined,
    categoryId: f.kategori || undefined,
    jarkomId: f.jarkom || undefined,
    status: f.status === 'semua' ? undefined : f.status,
  };
});

/** Alamat halaman ini dengan saringan diganti; selalu kembali ke halaman 1. */
function setQuery(changes: Partial<Record<keyof ReportFilters, string>>): void {
  const query: Record<string, string> = {};
  const next = { ...filters.value, ...changes };
  for (const key of ['dari', 'sampai', 'customer', 'kategori', 'jarkom'] as const) {
    if (next[key]) query[key] = next[key];
  }
  if (next.status && next.status !== 'semua') query.status = next.status;
  void router.replace({ query });
}
function goToPage(page: number): void {
  void router.push({ query: { ...route.query, halaman: page > 1 ? String(page) : undefined } });
}

const tenants = ref<TenantRef[]>([]);
const categories = ref<MasterItem[]>([]);
const jarkoms = ref<MasterItem[]>([]);
void tenantsApi.list().then((list) => (tenants.value = list)).catch(() => undefined);
void masterApi.options('kategori').then((list) => (categories.value = list)).catch(() => undefined);
void masterApi.options('jarkom').then((list) => (jarkoms.value = list)).catch(() => undefined);
const showCustomer = computed(() => tenants.value.length > 1);

const data = ref<NprReportResponse | null>(null);
const state = ref<'loading' | 'ready' | 'error'>('loading');
const loadError = ref('');
const receivedAt = ref<Date | null>(null);
const refreshing = ref(false);
let latest = 0;

async function load(): Promise<void> {
  const request = ++latest;
  refreshing.value = true;
  if (!data.value) state.value = 'loading';
  try {
    const response = await reportsApi.npr({ ...apiQuery.value, page: filters.value.halaman });
    if (request !== latest) return;
    data.value = response;
    receivedAt.value = new Date();
    state.value = 'ready';
    loadError.value = '';
  } catch (error) {
    if (request !== latest) return;
    loadError.value = error instanceof ApiError ? error.message : 'Laporan gagal dimuat.';
    data.value = null;
    state.value = 'error';
  } finally {
    if (request === latest) refreshing.value = false;
  }
}
watch(filters, load, { immediate: true, deep: true });

// Periode: isian tanggal mengikuti periode yang sedang tampil; diterapkan saat diubah.
const fromInput = ref('');
const toInput = ref('');
const periodError = ref('');
watch(
  () => [data.value?.from, data.value?.to, filters.value.dari, filters.value.sampai],
  () => {
    fromInput.value = filters.value.dari || data.value?.from || '';
    toInput.value = filters.value.sampai || data.value?.to || '';
    periodError.value = '';
  },
  { immediate: true },
);
function applyPeriod(): void {
  if (!isDateString(fromInput.value) || !isDateString(toInput.value)) {
    periodError.value = 'Isi tanggal awal dan akhir periode.';
    return;
  }
  if (fromInput.value > toInput.value) {
    periodError.value = 'Tanggal awal tidak boleh setelah tanggal akhir.';
    return;
  }
  periodError.value = '';
  setQuery({ dari: fromInput.value, sampai: toInput.value });
}
const presets = computed(() => periodPresets(wibDate(new Date())));
const shownPeriod = computed(() => (data.value ? { from: data.value.from, to: data.value.to } : null));
const periodText = computed(() => (shownPeriod.value ? formatDayRange(shownPeriod.value.from, shownPeriod.value.to) : ''));

/** Tautan ke daftar Tiket dengan angka yang sama; tanpa modul Tiket tidak ada tautan. */
function listLink(extra: Parameters<typeof ticketListQuery>[2] = {}): RouteLocationRaw | null {
  if (!canOpenTickets.value || !shownPeriod.value) return null;
  return { name: 'tiket', query: ticketListQuery(filters.value, shownPeriod.value, extra) };
}
// Status yang disaring laporan: jumlah Selesai/aktif yang lain selalu 0, jadi tanpa tautan.
const closedLink = (extra: Parameters<typeof ticketListQuery>[2] = {}) =>
  filters.value.status === 'aktif' ? null : listLink({ ...extra, status: 'selesai' });
const activeLink = (extra: Parameters<typeof ticketListQuery>[2] = {}) =>
  filters.value.status === 'selesai' ? null : listLink({ ...extra, status: 'aktif' });

const number = (n: number) => n.toLocaleString('id-ID');
const minutes = (value: number | null) => (value === null ? '—' : formatMinutes(value));
const tiles = computed(() => {
  const s = data.value?.summary;
  if (!s) return [];
  return [
    { key: 'total', label: 'Jumlah NPR', value: number(s.total), to: listLink() },
    { key: 'closed', label: 'Selesai', value: number(s.closed), to: closedLink() },
    { key: 'active', label: 'Masih aktif', value: number(s.active), to: activeLink() },
    { key: 'tt', label: 'Dengan TT', value: number(s.withTt), to: null },
    { key: 'avg', label: 'Rata-rata lama', value: minutes(s.avgMinutes), to: null },
    { key: 'median', label: 'Median lama', value: minutes(s.medianMinutes), to: null },
  ];
});

const groupTables = computed(() => {
  const r = data.value;
  if (!r) return [];
  const tables: Array<{ key: string; title: string; column: string; rows: NprReportGroup[]; filter: 'customer' | 'kategori' }> = [];
  if (showCustomer.value || r.byCustomer.length > 1) {
    tables.push({ key: 'per-customer', title: 'Per customer', column: 'Customer', rows: r.byCustomer, filter: 'customer' });
  }
  tables.push({ key: 'per-kategori', title: 'Per kategori', column: 'Kategori', rows: r.byCategory, filter: 'kategori' });
  return tables;
});
const rowLinks = (filter: 'customer' | 'kategori', g: NprReportGroup) => ({
  total: listLink({ [filter]: g.ref.id }),
  closed: closedLink({ [filter]: g.ref.id }),
});
const share = (part: number, f: NprReportFigures) => (f.total ? Math.round((part / f.total) * 100) : 0);

const range = computed(() => {
  const r = data.value;
  if (!r || r.summary.total === 0) return '';
  const first = (r.page - 1) * r.pageSize + 1;
  const last = Math.min(r.page * r.pageSize, r.summary.total);
  return `${number(first)}–${number(last)} dari ${number(r.summary.total)} NPR`;
});
const lastPage = computed(() => (data.value ? Math.max(1, Math.ceil(data.value.summary.total / data.value.pageSize)) : 1));

const filterText = computed(() => {
  const f = filters.value;
  const name = (list: Array<{ id: string; name: string }>, id: string) => list.find((x) => x.id === id)?.name ?? 'terpilih';
  return [
    f.customer ? `Customer ${name(tenants.value, f.customer)}` : '',
    f.kategori ? `Kategori ${name(categories.value, f.kategori)}` : '',
    f.jarkom ? `Jarkom ${name(jarkoms.value, f.jarkom)}` : '',
    f.status !== 'semua' ? `Status ${REPORT_STATUS_LABELS[f.status]}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
});

// Unduh Excel: semua baris periode ini (bukan hanya halaman yang tampil).
const tooMany = computed(() => (data.value?.summary.total ?? 0) > REPORT_EXPORT_MAX_ROWS);
const downloading = ref(false);
const downloadError = ref('');
async function downloadExcel(): Promise<void> {
  downloading.value = true;
  downloadError.value = '';
  try {
    const { file, fileName } = await reportsApi.nprExcel(apiQuery.value);
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (error) {
    downloadError.value = error instanceof ApiError ? error.message : 'Berkas Excel gagal dibuat.';
  } finally {
    downloading.value = false;
  }
}
const printReport = () => window.print();
</script>

<template>
  <div class="page-header mb-3 d-flex flex-wrap align-items-end gap-2">
    <div class="me-auto">
      <h1 class="page-title">
        Laporan
      </h1>
      <p class="text-secondary mb-0 mt-1">
        Rekap NPR menurut tanggal kejadian (WIB)<template v-if="periodText">
          · <strong class="text-body">{{ periodText }}</strong>
        </template>
        <span
          v-if="filterText"
          class="d-none d-print-inline"
        > · {{ filterText }}</span>
      </p>
    </div>
    <div class="d-flex flex-wrap align-items-center gap-2 d-print-none">
      <DataReceived
        :at="receivedAt"
        data-testid="laporan-diperbarui"
      />
      <button
        type="button"
        class="btn btn-icon action-target"
        aria-label="Muat ulang laporan"
        title="Muat ulang laporan"
        :disabled="refreshing"
        @click="load"
      >
        <IconRefresh
          :size="18"
          aria-hidden="true"
        />
      </button>
      <button
        type="button"
        class="btn action-target"
        :disabled="!data || data.summary.total === 0"
        title="Cetak atau simpan sebagai PDF lewat dialog cetak browser"
        @click="printReport"
      >
        <IconPrinter
          class="icon"
          :size="18"
          aria-hidden="true"
        />
        Cetak / PDF
      </button>
      <button
        type="button"
        class="btn btn-primary action-target"
        :disabled="!data || data.summary.total === 0 || tooMany || downloading"
        :title="tooMany ? `Lebih dari ${number(REPORT_EXPORT_MAX_ROWS)} NPR; persempit periode atau saringan.` : 'Semua NPR periode ini dalam satu berkas Excel'"
        @click="downloadExcel"
      >
        <IconDownload
          class="icon"
          :size="18"
          aria-hidden="true"
        />
        {{ downloading ? 'Menyiapkan Excel…' : 'Unduh Excel' }}
      </button>
    </div>
  </div>

  <div
    v-if="downloadError"
    class="alert alert-danger d-print-none"
    role="alert"
  >
    Unduhan Excel gagal: {{ downloadError }}
  </div>

  <div class="card mb-3 d-print-none">
    <div
      class="card-body"
      role="search"
      aria-label="Periode dan saringan laporan"
    >
      <div class="row g-2 align-items-end">
        <div class="col-6 col-lg-2">
          <label
            class="form-label"
            for="report-from"
          >Dari tanggal</label>
          <input
            id="report-from"
            v-model="fromInput"
            type="date"
            class="form-control"
            :max="toInput || undefined"
            :aria-invalid="periodError ? 'true' : undefined"
            aria-describedby="report-period-error"
            @change="applyPeriod"
          >
        </div>
        <div class="col-6 col-lg-2">
          <label
            class="form-label"
            for="report-to"
          >Sampai tanggal</label>
          <input
            id="report-to"
            v-model="toInput"
            type="date"
            class="form-control"
            :min="fromInput || undefined"
            :aria-invalid="periodError ? 'true' : undefined"
            aria-describedby="report-period-error"
            @change="applyPeriod"
          >
        </div>
        <div
          v-if="showCustomer"
          class="col-6 col-lg-2"
        >
          <label
            class="form-label"
            for="report-customer"
          >Customer</label>
          <select
            id="report-customer"
            class="form-select"
            :value="filters.customer"
            @change="setQuery({ customer: ($event.target as HTMLSelectElement).value })"
          >
            <option value="">
              Semua
            </option>
            <option
              v-for="t in tenants"
              :key="t.id"
              :value="t.id"
            >
              {{ t.name }}
            </option>
          </select>
        </div>
        <div class="col-6 col-lg-2">
          <label
            class="form-label"
            for="report-category"
          >Kategori</label>
          <select
            id="report-category"
            class="form-select"
            :value="filters.kategori"
            @change="setQuery({ kategori: ($event.target as HTMLSelectElement).value })"
          >
            <option value="">
              Semua
            </option>
            <option
              v-for="c in categories"
              :key="c.id"
              :value="c.id"
            >
              {{ c.name }}
            </option>
          </select>
        </div>
        <div class="col-6 col-lg-2">
          <label
            class="form-label"
            for="report-jarkom"
          >Jarkom</label>
          <select
            id="report-jarkom"
            class="form-select"
            :value="filters.jarkom"
            @change="setQuery({ jarkom: ($event.target as HTMLSelectElement).value })"
          >
            <option value="">
              Semua
            </option>
            <option
              v-for="j in jarkoms"
              :key="j.id"
              :value="j.id"
            >
              {{ j.name }}
            </option>
          </select>
        </div>
        <div class="col-6 col-lg-2">
          <label
            class="form-label"
            for="report-status"
          >Status</label>
          <select
            id="report-status"
            class="form-select"
            :value="filters.status"
            @change="setQuery({ status: ($event.target as HTMLSelectElement).value })"
          >
            <option
              v-for="s in REPORT_STATUS_FILTERS"
              :key="s"
              :value="s"
            >
              {{ REPORT_STATUS_LABELS[s] }}
            </option>
          </select>
        </div>
      </div>
      <p
        v-if="periodError"
        id="report-period-error"
        class="text-danger small mt-2 mb-0"
        role="alert"
      >
        {{ periodError }}
      </p>
      <div
        class="d-flex flex-wrap gap-2 mt-3"
        role="group"
        aria-label="Periode cepat"
      >
        <button
          v-for="p in presets"
          :key="p.key"
          type="button"
          class="btn btn-sm action-target"
          :class="shownPeriod?.from === p.from && shownPeriod?.to === p.to ? 'btn-primary' : 'btn-outline-secondary'"
          :aria-pressed="shownPeriod?.from === p.from && shownPeriod?.to === p.to"
          @click="setQuery({ dari: p.from, sampai: p.to })"
        >
          {{ p.label }}
        </button>
      </div>
    </div>
  </div>

  <p
    v-if="state === 'loading'"
    class="text-secondary"
    aria-busy="true"
  >
    Memuat laporan…
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
        Laporan gagal dimuat
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
          Muat ulang laporan
        </button>
      </div>
    </div>
  </div>

  <div
    v-else-if="data && data.summary.total === 0"
    class="card"
  >
    <div class="empty">
      <div class="empty-icon">
        <IconFileSpreadsheet
          :size="40"
          aria-hidden="true"
        />
      </div>
      <p class="empty-title">
        Tidak ada NPR dalam periode ini
      </p>
      <p class="empty-subtitle text-secondary">
        Pilih periode lain di atas, atau ubah saringan customer, kategori, jarkom, dan status.
      </p>
    </div>
  </div>

  <div
    v-else-if="data"
    class="report"
    :class="{ refreshing }"
  >
    <section
      class="card mb-3"
      aria-labelledby="ringkasan"
    >
      <div class="card-body">
        <h2
          id="ringkasan"
          class="subheader mb-2"
        >
          Ringkasan
        </h2>
        <ul class="tiles list-unstyled mb-0">
          <li
            v-for="tile in tiles"
            :key="tile.key"
          >
            <RouterLink
              v-if="tile.to"
              :to="tile.to"
              class="tile tile-link"
              :data-testid="`ringkasan-${tile.key}`"
            >
              <span class="text-secondary small">{{ tile.label }}</span>
              <span class="tile-value">{{ tile.value }}</span>
            </RouterLink>
            <div
              v-else
              class="tile"
              :data-testid="`ringkasan-${tile.key}`"
            >
              <span class="text-secondary small">{{ tile.label }}</span>
              <span class="tile-value">{{ tile.value }}</span>
            </div>
          </li>
        </ul>
        <p class="text-secondary small mt-3 mb-0">
          Lama gangguan dihitung dari waktu kejadian sampai link online lagi (waktu Close), hanya untuk
          NPR yang sudah Selesai.
        </p>
      </div>
    </section>

    <div class="row row-cards mb-3">
      <div
        v-for="table in groupTables"
        :key="table.key"
        class="col-12"
        :class="groupTables.length > 1 ? 'col-xl-6' : ''"
      >
        <section
          class="card h-100"
          :aria-labelledby="table.key"
        >
          <div class="card-header">
            <h2
              :id="table.key"
              class="card-title"
            >
              {{ table.title }}
            </h2>
          </div>
          <table
            class="table table-vcenter card-table group-table"
            :data-testid="`tabel-${table.key}`"
          >
            <thead>
              <tr>
                <th scope="col">
                  {{ table.column }}
                </th>
                <th
                  scope="col"
                  class="text-end"
                >
                  NPR
                </th>
                <th
                  scope="col"
                  class="text-end"
                >
                  Selesai
                </th>
                <th
                  scope="col"
                  class="text-end d-none d-sm-table-cell"
                >
                  Dengan TT
                </th>
                <th
                  scope="col"
                  class="text-end d-none d-md-table-cell"
                >
                  Rata-rata lama
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="g in table.rows"
                :key="g.ref.id"
              >
                <th
                  scope="row"
                  class="fw-normal"
                >
                  {{ g.ref.name }}
                </th>
                <td class="text-end num">
                  <RouterLink
                    v-if="rowLinks(table.filter, g).total"
                    :to="rowLinks(table.filter, g).total!"
                    :aria-label="`${number(g.total)} NPR ${g.ref.name}`"
                  >
                    {{ number(g.total) }}
                  </RouterLink>
                  <template v-else>
                    {{ number(g.total) }}
                  </template>
                </td>
                <td class="text-end num">
                  <RouterLink
                    v-if="rowLinks(table.filter, g).closed"
                    :to="rowLinks(table.filter, g).closed!"
                    :aria-label="`${number(g.closed)} NPR Selesai ${g.ref.name}`"
                  >
                    {{ number(g.closed) }}
                  </RouterLink>
                  <template v-else>
                    {{ number(g.closed) }}
                  </template>
                  <div
                    v-if="g.total"
                    class="small text-secondary"
                  >
                    {{ share(g.closed, g) }}%
                  </div>
                </td>
                <td class="text-end num d-none d-sm-table-cell">
                  {{ number(g.withTt) }}
                </td>
                <td class="text-end d-none d-md-table-cell text-nowrap">
                  {{ minutes(g.avgMinutes) }}
                </td>
              </tr>
            </tbody>
          </table>
        </section>
      </div>
    </div>

    <div class="row row-cards mb-3">
      <div class="col-12 col-lg-4">
        <section
          class="card h-100"
          aria-labelledby="part-diganti"
        >
          <div class="card-header">
            <h2
              id="part-diganti"
              class="card-title"
            >
              Part diganti
            </h2>
          </div>
          <p
            v-if="data.parts.length === 0"
            class="card-body text-secondary mb-0"
          >
            Tidak ada part yang dicatat diganti saat Close dalam periode ini.
          </p>
          <ul
            v-else
            class="list-group list-group-flush"
            data-testid="daftar-part"
          >
            <li
              v-for="p in data.parts"
              :key="p.part"
              class="list-group-item d-flex justify-content-between"
            >
              <span>{{ REPLACED_PART_LABELS[p.part] }}</span>
              <span class="num fw-bold">{{ number(p.count) }}</span>
            </li>
          </ul>
        </section>
      </div>
      <div class="col-12 col-lg-8">
        <section
          class="card h-100"
          aria-labelledby="remote-terbanyak"
        >
          <div class="card-header">
            <h2
              id="remote-terbanyak"
              class="card-title"
            >
              Remote dengan NPR terbanyak
            </h2>
          </div>
          <ol class="list-group list-group-flush">
            <li
              v-for="(item, index) in data.topRemotes"
              :key="item.id"
              class="list-group-item d-flex align-items-center gap-3"
            >
              <span
                class="rank text-secondary"
                aria-hidden="true"
              >{{ index + 1 }}</span>
              <div class="me-auto remote-main">
                <RouterLink
                  :to="{ name: 'remote-detail', params: { id: item.id } }"
                  class="fw-bold"
                >
                  {{ item.name }}
                </RouterLink>
                <div class="small text-secondary">
                  <span class="font-monospace">{{ item.siteId }}</span> · {{ item.tenant }}
                </div>
              </div>
              <RouterLink
                v-if="listLink({ remote: item.id })"
                :to="listLink({ remote: item.id })!"
                class="btn btn-ghost-primary action-target num text-nowrap"
                :aria-label="`${number(item.total)} NPR di ${item.siteId}`"
              >
                {{ number(item.total) }} NPR
              </RouterLink>
              <span
                v-else
                class="num text-nowrap"
              >{{ number(item.total) }} NPR</span>
            </li>
          </ol>
        </section>
      </div>
    </div>

    <section
      class="card"
      aria-labelledby="daftar-npr"
    >
      <div class="card-header">
        <h2
          id="daftar-npr"
          class="card-title"
        >
          Daftar NPR
        </h2>
        <span class="card-subtitle ms-2 text-secondary d-none d-print-inline">
          {{ range }}. Daftar lengkap ada di berkas Excel.
        </span>
      </div>
      <table
        class="table table-vcenter card-table"
        data-testid="tabel-daftar-npr"
      >
        <caption class="visually-hidden">
          Daftar NPR {{ periodText }}, {{ range }}
        </caption>
        <thead>
          <tr>
            <th scope="col">
              NPR
            </th>
            <th
              v-if="showCustomer"
              scope="col"
              class="d-none d-xl-table-cell"
            >
              Customer
            </th>
            <th
              scope="col"
              class="d-none d-md-table-cell"
            >
              Kejadian (WIB)
            </th>
            <th
              scope="col"
              class="d-none d-lg-table-cell"
            >
              Online lagi
            </th>
            <th scope="col">
              Status
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="item in data.items"
            :key="item.id"
          >
            <td class="ticket-cell">
              <RouterLink
                v-if="canOpenTickets"
                :to="{ name: 'ticket-detail', params: { id: item.id } }"
                class="ticket-link font-monospace"
              >
                <TicketNumber :number="item.number" />
              </RouterLink>
              <span
                v-else
                class="font-monospace fw-bold"
              ><TicketNumber :number="item.number" /></span>
              <div class="text-truncate">
                {{ item.remote }}
                <span class="text-secondary">· {{ item.siteId }} · {{ item.city }}</span>
              </div>
              <div
                v-if="item.ttNumber"
                class="small"
              >
                <span class="badge bg-azure-lt">TT</span>
                <span class="font-monospace"><TicketNumber :number="item.ttNumber" /></span>
              </div>
              <div class="d-md-none small text-secondary">
                {{ formatInZone(item.occurredAt, WIB) }} · {{ item.category }}
              </div>
            </td>
            <td
              v-if="showCustomer"
              class="d-none d-xl-table-cell"
            >
              {{ item.tenant }}
            </td>
            <td class="d-none d-md-table-cell text-nowrap">
              {{ formatInZone(item.occurredAt, WIB) }}
              <div class="small text-secondary">
                {{ item.category }}
              </div>
            </td>
            <td class="d-none d-lg-table-cell text-nowrap">
              <template v-if="item.closedAt">
                {{ formatInZone(item.closedAt, WIB) }}
                <div class="small text-secondary">
                  {{ minutes(item.durationMinutes) }}
                </div>
              </template>
              <span
                v-else
                class="text-secondary"
              >—</span>
            </td>
            <td>
              <span :class="TICKET_STATUS_BADGE[item.status]">{{ TICKET_STATUS_LABELS[item.status] }}</span>
              <div
                v-if="item.replacedParts?.length"
                class="small text-secondary mt-1"
              >
                Ganti {{ item.replacedParts.map((p) => REPLACED_PART_LABELS[p]).join(', ') }}
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      <nav
        class="card-footer d-flex flex-wrap align-items-center gap-2"
        aria-label="Halaman daftar NPR"
      >
        <p class="m-0 me-auto text-secondary">
          {{ range }}
        </p>
        <button
          type="button"
          class="btn action-target d-print-none"
          :disabled="data.page <= 1"
          @click="goToPage(data.page - 1)"
        >
          Sebelumnya
        </button>
        <button
          type="button"
          class="btn action-target d-print-none"
          :disabled="data.page >= lastPage"
          @click="goToPage(data.page + 1)"
        >
          Berikutnya
        </button>
      </nav>
    </section>
  </div>
</template>

<style scoped>
.action-target,
.form-control,
.form-select {
  min-height: 44px;
}
.action-target {
  min-width: 44px;
}
.report {
  transition: opacity 0.2s;
}
.report.refreshing {
  opacity: 0.7;
}
/* Enam angka: satu baris di layar lebar, 3 × 2 di tablet, 2 × 3 di ponsel. */
.tiles {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.5rem;
}
@media (min-width: 576px) {
  .tiles {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
@media (min-width: 1200px) {
  .tiles {
    grid-template-columns: repeat(6, minmax(0, 1fr));
  }
}
.tile {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.375rem;
  height: 100%;
  min-height: 44px;
  padding: 0.75rem;
  border: 1px solid var(--tblr-border-color);
  border-radius: 4px;
  color: inherit;
  text-decoration: none;
}
.tile-link:hover,
.tile-link:focus-visible {
  border-color: var(--tblr-primary);
}
.tile-value {
  font-size: 1.5rem;
  font-weight: 600;
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
}
.num {
  font-variant-numeric: tabular-nums;
}
/* Angka di tabel per customer/kategori cukup besar untuk disentuh. */
.group-table td a {
  display: inline-block;
  min-width: 44px;
  padding-block: 0.625rem;
}
.rank {
  width: 1.5rem;
  text-align: end;
  font-variant-numeric: tabular-nums;
}
.remote-main {
  min-width: 0;
}
.ticket-link {
  display: inline-block;
  padding-block: 0.5rem;
  font-weight: 600;
  overflow-wrap: anywhere;
}
.ticket-cell {
  max-width: 22rem;
}
@media (max-width: 767.98px) {
  .ticket-cell {
    width: 100%;
    max-width: 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .report {
    transition: none;
  }
}
/* Cetak / PDF: angka dan tabel saja, tanpa kartu berbayang; bagian tidak terbelah di tengah. */
@page {
  margin: 12mm;
}
@media print {
  .report.refreshing {
    opacity: 1;
  }
  .card {
    box-shadow: none;
    break-inside: avoid;
  }
  section[aria-labelledby='daftar-npr'] {
    break-inside: auto;
  }
  .tiles {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  a {
    color: inherit;
    text-decoration: none;
  }
}
</style>
