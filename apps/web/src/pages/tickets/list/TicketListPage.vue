<script setup lang="ts">
import { IconAlertTriangle, IconPlus, IconSearch, IconTicket, IconX } from '@tabler/icons-vue';
import {
  canOpenModule,
  formatInZone,
  type MasterItem,
  PENDING_PARTY_LABELS,
  type TenantRef,
  TICKET_ACTION_TYPE_LABELS,
  TICKET_FLAG_DAYS,
  TICKET_QUEUE_VIEWS,
  TICKET_STATUS_LABELS,
  TICKET_STATUSES,
  TICKET_VIEW_LABELS,
  TICKET_VIEWS,
  type TicketListItem,
  type TicketListQuery,
  type TicketListResponse,
  type TicketQueueView,
  type TicketStatus,
  type TicketView,
  ticketNeedsUpdate,
} from '@tyio/shared';
import { storeToRefs } from 'pinia';
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { type LocationQuery, RouterLink, useRoute, useRouter } from 'vue-router';
import { ApiError } from '../../../api/client';
import { masterApi } from '../../../api/master';
import { remotesApi } from '../../../api/remotes';
import TicketNumber from '../../../components/TicketNumber.vue';
import { tenantsApi } from '../../../api/tenants';
import { ticketsApi } from '../../../api/tickets';
import { useAuthStore } from '../../../stores/auth';
import { linkFilterChips, type ListLinkFilters } from '../../overview/overview-display';
import { TICKET_STATUS_BADGE } from '../detail/ticket-display';

// Pola halaman: daftar. Tampilan, pencarian, saringan, dan halaman tersimpan di alamat (bisa
// dibagikan, tombol kembali berfungsi). Tampilan bawaan "Aktif" tidak ditulis di alamat.
const route = useRoute();
const router = useRouter();
const { user } = storeToRefs(useAuthStore());
const canCreate = computed(() => (user.value ? canOpenModule(user.value.role, 'tiket') : false));

type FilterKey = 'q' | 'customer' | 'kategori' | 'jarkom';
/** Saringan yang datang dari tautan Overview (2.1); tampil sebagai chip yang bisa dihapus. */
const LINK_KEYS = ['status', 'dari', 'sampai', 'ditutupDari', 'ditutupSampai', 'remote', 'lama'] as const;
const FILTER_KEYS = ['q', 'customer', 'kategori', 'jarkom', ...LINK_KEYS] as const;
const one = (value: LocationQuery[string] | undefined) => (typeof value === 'string' ? value : '');
const filters = computed(() => ({
  tampilan: (TICKET_VIEWS as readonly string[]).includes(one(route.query.tampilan))
    ? (one(route.query.tampilan) as TicketView)
    : 'aktif',
  q: one(route.query.q),
  customer: one(route.query.customer),
  kategori: one(route.query.kategori),
  jarkom: one(route.query.jarkom),
  status: (TICKET_STATUSES as readonly string[]).includes(one(route.query.status))
    ? (one(route.query.status) as TicketStatus)
    : undefined,
  dari: one(route.query.dari),
  sampai: one(route.query.sampai),
  ditutupDari: one(route.query.ditutupDari),
  ditutupSampai: one(route.query.ditutupSampai),
  remote: one(route.query.remote),
  lama: one(route.query.lama),
  halaman: Math.max(1, Number(one(route.query.halaman)) || 1),
}));
const hasFilters = computed(() => FILTER_KEYS.some((key) => Boolean(filters.value[key])));

// Nama remote untuk chip saringan remote (dari "Remote paling sering bermasalah" di Overview).
const remoteLabel = ref('');
watch(
  () => filters.value.remote,
  async (id) => {
    remoteLabel.value = '';
    if (!id) return;
    try {
      const remote = await remotesApi.get(id);
      if (filters.value.remote === id) remoteLabel.value = `${remote.siteId} · ${remote.name}`;
    } catch {
      remoteLabel.value = 'terpilih';
    }
  },
  { immediate: true },
);
const chips = computed(() => linkFilterChips(filters.value as ListLinkFilters, remoteLabel.value || '…'));
function removeChip(keys: ReadonlyArray<keyof ListLinkFilters>): void {
  const query = viewQuery(filters.value.tampilan);
  for (const key of keys) delete query[key];
  void router.replace({ query });
}

const tenants = ref<TenantRef[]>([]);
const categories = ref<MasterItem[]>([]);
const jarkoms = ref<MasterItem[]>([]);
void tenantsApi.list().then((list) => (tenants.value = list)).catch(() => undefined);
void masterApi.options('kategori').then((list) => (categories.value = list)).catch(() => undefined);
void masterApi.options('jarkom').then((list) => (jarkoms.value = list)).catch(() => undefined);
const showCustomer = computed(() => tenants.value.length > 1);
// Jumlah di tab hanya untuk antrean; riwayat (Selesai, Semua) menampilkan totalnya di bawah daftar.
const isQueueView = (view: TicketView): view is TicketQueueView =>
  (TICKET_QUEUE_VIEWS as readonly string[]).includes(view);

const result = ref<TicketListResponse | null>(null);
// Waktu acuan tanda "≥ 7 hari", diperbarui setiap daftar dimuat.
let now = new Date();
const state = ref<'loading' | 'ready' | 'error'>('loading');
const loadError = ref('');
let latest = 0;

async function load(): Promise<void> {
  const request = ++latest;
  const f = filters.value;
  const query: TicketListQuery = {
    view: f.tampilan === 'aktif' ? undefined : f.tampilan,
    q: f.q || undefined,
    tenantId: f.customer || undefined,
    categoryId: f.kategori || undefined,
    jarkomId: f.jarkom || undefined,
    status: f.status,
    occurredFrom: f.dari || undefined,
    occurredTo: f.sampai || undefined,
    closedFrom: f.ditutupDari || undefined,
    closedTo: f.ditutupSampai || undefined,
    remoteId: f.remote || undefined,
    flagged: f.lama ? true : undefined,
    page: f.halaman,
  };
  state.value = result.value ? 'ready' : 'loading';
  try {
    const response = await ticketsApi.list(query);
    if (request !== latest) return; // jawaban lama datang setelah yang baru
    now = new Date();
    result.value = response;
    state.value = 'ready';
  } catch (error) {
    if (request !== latest) return;
    loadError.value = error instanceof ApiError ? error.message : 'Daftar tiket gagal dimuat.';
    state.value = 'error';
  }
}
watch(filters, load, { immediate: true, deep: true });

/** Alamat untuk satu tampilan dengan saringan yang sama, mulai dari halaman 1. */
function viewQuery(view: TicketView): Record<string, string> {
  const f = filters.value;
  const query: Record<string, string> = view === 'aktif' ? {} : { tampilan: view };
  for (const key of FILTER_KEYS) {
    const value = f[key];
    if (value) query[key] = value;
  }
  return query;
}

/** Mengganti saringan di alamat; kembali ke halaman 1. */
function setFilter(key: FilterKey, value: string): void {
  const query = viewQuery(filters.value.tampilan);
  if (value) query[key] = value;
  else delete query[key];
  void router.replace({ query });
}

function goToPage(page: number): void {
  void router.push({ query: { ...route.query, halaman: page > 1 ? String(page) : undefined } });
}

function clearFilters(): void {
  search.value = '';
  void router.replace({ query: filters.value.tampilan === 'aktif' ? {} : { tampilan: filters.value.tampilan } });
}

// Pencarian dikirim setelah pengguna berhenti mengetik sebentar.
const search = ref(filters.value.q);
let typing: ReturnType<typeof setTimeout> | undefined;
watch(search, (value) => {
  clearTimeout(typing);
  typing = setTimeout(() => {
    if (value.trim() !== filters.value.q) setFilter('q', value.trim());
  }, 300);
});
watch(
  () => filters.value.q,
  (q) => {
    if (q !== search.value.trim()) search.value = q;
  },
);
onBeforeUnmount(() => clearTimeout(typing));

const range = computed(() => {
  const r = result.value;
  if (!r || r.total === 0) return '';
  const first = (r.page - 1) * r.pageSize + 1;
  const last = Math.min(r.page * r.pageSize, r.total);
  return `${first.toLocaleString('id-ID')}–${last.toLocaleString('id-ID')} dari ${r.total.toLocaleString('id-ID')} tiket`;
});
const lastPage = computed(() => (result.value ? Math.max(1, Math.ceil(result.value.total / result.value.pageSize)) : 1));

const EMPTY_TITLES: Record<TicketView, string> = {
  tt: 'Tidak ada TT aktif',
  aktif: 'Tidak ada tiket aktif',
  saya: 'Belum ada tiket aktif milik Anda',
  pending: 'Tidak ada tiket pending',
  eskalasi: 'Tidak ada tiket eskalasi',
  selesai: 'Belum ada tiket selesai',
  semua: 'Belum ada tiket',
};

function lastActionText(item: TicketListItem): string {
  const last = item.lastAction;
  if (!last) return '';
  if (last.note) return last.note;
  // Status Terbuka hanya ada di entri pertama: tiket dibuat.
  if (last.statusTo === 'terbuka') return 'Tiket dibuat';
  return last.statusTo ? `Status ${TICKET_STATUS_LABELS[last.statusTo]}` : '';
}
</script>

<template>
  <div class="page-header mb-3">
    <h1 class="page-title">
      Tiket
    </h1>
    <p class="text-secondary mb-0">
      Antrean NPR: yang masih ditangani dan riwayatnya.
    </p>
  </div>

  <nav
    class="view-tabs mb-3"
    aria-label="Tampilan tiket"
  >
    <ul class="nav nav-pills flex-nowrap">
      <li
        v-for="view in TICKET_VIEWS"
        :key="view"
        class="nav-item"
      >
        <RouterLink
          :to="{ query: viewQuery(view) }"
          class="nav-link view-target text-nowrap"
          :class="{ active: filters.tampilan === view }"
          :aria-current="filters.tampilan === view ? 'page' : undefined"
        >
          {{ TICKET_VIEW_LABELS[view] }}
          <span
            v-if="result && isQueueView(view)"
            class="badge ms-2"
            :class="filters.tampilan === view ? 'bg-white text-primary' : 'bg-secondary-lt'"
          >{{ result.counts[view].toLocaleString('id-ID') }}</span>
        </RouterLink>
      </li>
    </ul>
  </nav>

  <div class="card mb-3">
    <div
      class="card-body"
      role="search"
    >
      <div class="row g-2">
        <div class="col-12 col-lg-4">
          <label
            class="form-label"
            for="ticket-search"
          >Cari</label>
          <div class="input-icon">
            <span
              class="input-icon-addon"
              aria-hidden="true"
            ><IconSearch :size="18" /></span>
            <input
              id="ticket-search"
              v-model="search"
              type="search"
              class="form-control"
              placeholder="No. NPR atau TT, no. tiket customer, Site ID, atau nama remote"
              autocomplete="off"
              maxlength="100"
            >
          </div>
        </div>
        <div
          v-if="showCustomer"
          class="col-6 col-lg-2"
        >
          <label
            class="form-label"
            for="ticket-customer"
          >Customer</label>
          <select
            id="ticket-customer"
            class="form-select"
            :value="filters.customer"
            @change="setFilter('customer', ($event.target as HTMLSelectElement).value)"
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
            for="ticket-category"
          >Kategori</label>
          <select
            id="ticket-category"
            class="form-select"
            :value="filters.kategori"
            @change="setFilter('kategori', ($event.target as HTMLSelectElement).value)"
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
            for="ticket-jarkom"
          >Jarkom</label>
          <select
            id="ticket-jarkom"
            class="form-select"
            :value="filters.jarkom"
            @change="setFilter('jarkom', ($event.target as HTMLSelectElement).value)"
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
      </div>
      <ul
        v-if="chips.length > 0"
        class="list-inline mt-3 mb-0 d-flex flex-wrap gap-2"
        aria-label="Saringan dari Overview"
      >
        <li
          v-for="chip in chips"
          :key="chip.label"
          class="badge bg-blue-lt filter-chip"
        >
          {{ chip.label }}
          <button
            type="button"
            class="btn btn-ghost-secondary btn-icon btn-sm chip-remove"
            :aria-label="`Hapus saringan ${chip.label}`"
            :title="`Hapus saringan ${chip.label}`"
            @click="removeChip(chip.keys)"
          >
            <IconX
              :size="14"
              aria-hidden="true"
            />
          </button>
        </li>
      </ul>
    </div>
  </div>

  <div
    class="card"
    :aria-busy="state === 'loading'"
  >
    <p
      v-if="state === 'loading'"
      class="card-body text-secondary mb-0"
    >
      Memuat tiket…
    </p>

    <div
      v-else-if="state === 'error'"
      class="empty"
    >
      <div class="empty-icon text-danger">
        <IconAlertTriangle
          :size="40"
          aria-hidden="true"
        />
      </div>
      <p class="empty-title">
        Daftar tiket gagal dimuat
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
          Muat ulang daftar
        </button>
      </div>
    </div>

    <div
      v-else-if="result && result.total === 0"
      class="empty"
    >
      <div class="empty-icon">
        <IconTicket
          :size="40"
          aria-hidden="true"
        />
      </div>
      <template v-if="hasFilters">
        <p class="empty-title">
          Tidak ada tiket yang cocok
        </p>
        <p class="empty-subtitle text-secondary">
          Coba kata lain, buka tampilan Semua, atau hapus saringan.
        </p>
        <div class="empty-action">
          <button
            type="button"
            class="btn"
            @click="clearFilters"
          >
            Hapus pencarian dan saringan
          </button>
        </div>
      </template>
      <template v-else>
        <p class="empty-title">
          {{ EMPTY_TITLES[filters.tampilan] }}
        </p>
        <p class="empty-subtitle text-secondary">
          Tiket baru dibuat dari tombol Buat tiket, atau dari halaman remote.
        </p>
        <div
          v-if="canCreate && (filters.tampilan === 'aktif' || filters.tampilan === 'semua')"
          class="empty-action"
        >
          <RouterLink
            :to="{ name: 'ticket-create' }"
            class="btn btn-primary"
          >
            <IconPlus
              class="icon"
              :size="18"
              aria-hidden="true"
            />
            Buat tiket
          </RouterLink>
        </div>
      </template>
    </div>

    <template v-else-if="result">
      <table class="table table-vcenter card-table">
        <caption class="visually-hidden">
          Daftar tiket {{ TICKET_VIEW_LABELS[filters.tampilan] }}, {{ range }}
        </caption>
        <thead>
          <tr>
            <th scope="col">
              Tiket
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
              Kejadian
            </th>
            <th scope="col">
              Status
            </th>
            <th
              scope="col"
              class="d-none d-lg-table-cell"
            >
              Tindakan terakhir
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="item in result.items"
            :key="item.id"
          >
            <td class="ticket-cell">
              <RouterLink
                :to="{ name: 'ticket-detail', params: { id: item.id } }"
                class="ticket-link font-monospace"
              >
                <TicketNumber :number="item.number" />
              </RouterLink>
              <div class="text-truncate">
                {{ item.remote.name }}
                <span class="text-secondary">· {{ item.remote.siteId }} · {{ item.remote.city }}</span>
              </div>
              <div
                v-if="item.tt"
                class="small"
              >
                <span class="badge bg-azure-lt">TT</span>
                <span class="font-monospace"><TicketNumber :number="item.tt.number" /></span>
              </div>
              <div
                v-if="item.customerTicketNumber"
                class="small text-secondary"
              >
                No. tiket customer: <span class="font-monospace">{{ item.customerTicketNumber }}</span>
              </div>
              <div class="d-md-none small text-secondary">
                {{ formatInZone(item.occurredAt, item.remote.timeZone) }} · {{ item.category.name }}
              </div>
            </td>
            <td
              v-if="showCustomer"
              class="d-none d-xl-table-cell"
            >
              {{ item.tenant.name }}
            </td>
            <td class="d-none d-md-table-cell text-nowrap">
              {{ formatInZone(item.occurredAt, item.remote.timeZone) }}
              <div class="small text-secondary">
                {{ item.category.name }}
              </div>
            </td>
            <td class="status-cell">
              <span :class="TICKET_STATUS_BADGE[item.status]">{{ TICKET_STATUS_LABELS[item.status] }}</span>
              <span
                v-if="ticketNeedsUpdate(item, now)"
                class="badge bg-danger text-white ms-1"
                :title="`Masih aktif setelah ${TICKET_FLAG_DAYS} hari sejak kejadian: perbarui NPR ini.`"
              >≥ {{ TICKET_FLAG_DAYS }} hari</span>
              <div
                v-if="item.pending"
                class="small mt-1"
              >
                <strong>Menunggu {{ PENDING_PARTY_LABELS[item.pending.party] }}</strong>
                <div class="text-secondary pending-reason">
                  {{ item.pending.reason }}
                </div>
              </div>
            </td>
            <td class="d-none d-lg-table-cell last-action-cell">
              <template v-if="item.lastAction">
                <div class="small text-secondary">
                  {{ formatInZone(item.lastAction.occurredAt, item.remote.timeZone) }} ·
                  {{ item.lastAction.createdBy.displayName }}
                </div>
                <div class="last-action-text">
                  <strong v-if="item.lastAction.type !== 'catatan'">{{ TICKET_ACTION_TYPE_LABELS[item.lastAction.type] }}:</strong>
                  {{ lastActionText(item) }}
                </div>
              </template>
              <span
                v-else
                class="text-secondary"
              >—</span>
            </td>
          </tr>
        </tbody>
      </table>
      <nav
        class="card-footer d-flex flex-wrap align-items-center gap-2"
        aria-label="Halaman daftar tiket"
      >
        <p class="m-0 me-auto text-secondary">
          {{ range }}
        </p>
        <button
          type="button"
          class="btn action-target"
          :disabled="result.page <= 1"
          @click="goToPage(result.page - 1)"
        >
          Sebelumnya
        </button>
        <button
          type="button"
          class="btn action-target"
          :disabled="result.page >= lastPage"
          @click="goToPage(result.page + 1)"
        >
          Berikutnya
        </button>
      </nav>
    </template>
  </div>
</template>

<style scoped>
.filter-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0 0 0 0.75rem;
  font-size: 0.875rem;
  font-weight: 500;
  white-space: normal;
  text-align: start;
}
.chip-remove {
  min-width: 44px;
  min-height: 44px;
}
.action-target,
.view-target,
.form-control,
.form-select {
  min-height: 44px;
}
.view-target {
  display: inline-flex;
  align-items: center;
}
/* Di layar sempit tab bergulir sendiri ke samping, halaman tidak. */
.view-tabs {
  overflow-x: auto;
  scrollbar-width: thin;
}
/* Nomor tiket memenuhi tinggi sentuh di ponsel tanpa menggeser baris; nomor panjang (kode
   jarkom/customer sampai 16 huruf) boleh patah daripada melebarkan tabel. */
.ticket-link {
  display: inline-block;
  padding-block: 0.5rem;
  font-weight: 600;
  overflow-wrap: anywhere;
}
.ticket-cell {
  max-width: 22rem;
}
/* Di ponsel hanya kolom Tiket dan Status: kolom Tiket mengambil sisa lebar dan memotong
   teks panjang dengan "…", bukan melebarkan halaman. */
@media (max-width: 767.98px) {
  .ticket-cell {
    width: 100%;
    max-width: 0;
  }
}
.status-cell {
  min-width: 7rem;
  max-width: 14rem;
}
.pending-reason,
.last-action-text {
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.last-action-cell {
  min-width: 11rem;
  max-width: 18rem;
}
</style>
