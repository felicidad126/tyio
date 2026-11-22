<script setup lang="ts">
import { IconPlus, IconSearch } from '@tabler/icons-vue';
import {
  isRole,
  type MasterValue,
  ROLE_LABELS,
  TICKET_ACTION_KIND_LABELS,
  TICKET_QUEUE_VIEW_LABELS,
  TICKET_QUEUE_VIEWS,
  TICKET_STATUS_LABELS,
  TICKET_STATUSES,
  type TicketQueueItem,
  type TicketQueuePage,
  type TicketQueueView,
} from '@tyio/shared';
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { type LocationQueryRaw, useRoute, useRouter } from 'vue-router';
import PageHeader from '../../../components/PageHeader.vue';
import TicketStatusPill from '../TicketStatusPill.vue';
import TroubleTicketList from '../tt/TroubleTicketList.vue';
import { ticketApi } from '../ticket-api';
import { formatZoned, formatZonedShort } from '../zoned-time';
import { durationLabel, sinceLabel } from './relative-time';

// Antrean NPR (langkah 1.5): lima tampilan bawaan dengan jumlahnya (T82), saringan di alamat
// halaman (bisa dibagikan; diingat saat kembali ke Tiket), urutan mulai gangguan terlama (T83),
// dan "Ambil" untuk NPR yang belum punya penanggung (T81).

const STORAGE_KEY = 'tyio:antrean';
type Key = 'view' | 'customer' | 'kategori' | 'system' | 'status' | 'q' | 'sort' | 'page';

const route = useRoute();
const router = useRouter();
const number = new Intl.NumberFormat('id-ID');

const customers = ref<Array<{ id: string; name: string }>>([]);
const categories = ref<MasterValue[]>([]);
const systems = ref<MasterValue[]>([]);
const page = ref<TicketQueuePage | null>(null);
const loading = ref(true);
const error = ref('');
const notice = ref('');
const taking = ref<string | null>(null);
const now = ref(Date.now());

const one = (value: unknown) => (typeof value === 'string' ? value : '');
const filters = computed(() => {
  const view = one(route.query.view);
  return {
    view: ((TICKET_QUEUE_VIEWS as readonly string[]).includes(view) ? view : 'semua') as TicketQueueView,
    customer: one(route.query.customer),
    kategori: one(route.query.kategori),
    system: one(route.query.system),
    status: one(route.query.status),
    q: one(route.query.q),
    sort: one(route.query.sort) === 'terbaru' ? 'terbaru' : 'mulai',
    page: Math.max(1, Number(one(route.query.page)) || 1),
  };
});
/** Daftar TT aktif (1.5b) di halaman yang sama: `?daftar=tt`. */
const showTt = computed(() => route.query.daftar === 'tt');
const filtered = computed(
  () => !!(filters.value.customer || filters.value.kategori || filters.value.system || filters.value.status || filters.value.q),
);

// Kembali ke Tiket dari menu (alamat tanpa saringan): pakai saringan terakhir.
try {
  const stored = sessionStorage.getItem(STORAGE_KEY);
  if (stored && Object.keys(route.query).length === 0) {
    const query = JSON.parse(stored) as LocationQueryRaw;
    if (query && typeof query === 'object' && Object.keys(query).length > 0) void router.replace({ query });
  }
} catch {
  // Penyimpanan peramban tidak tersedia: tetap jalan tanpa mengingat saringan.
}

const search = ref(filters.value.q);
let debounce: ReturnType<typeof setTimeout> | undefined;
/** Ketikan yang belum dikirim ke alamat; jangan ditimpa saat saringan lain berubah. */
let typing = false;
watch(search, (value) => {
  clearTimeout(debounce);
  typing = true;
  debounce = setTimeout(() => {
    typing = false;
    setQuery({ q: value.trim() });
  }, 300);
});
watch(
  () => filters.value.q,
  (value) => {
    if (!typing && value !== search.value.trim()) search.value = value;
  },
);
const clock = setInterval(() => (now.value = Date.now()), 60_000);
onBeforeUnmount(() => {
  clearTimeout(debounce);
  clearInterval(clock);
  // Halaman ditinggalkan sebelum ketikan terakhir masuk alamat: tetap diingat.
  if (typing) remember({ ...(route.query as Record<string, string>), q: search.value.trim() });
});

function remember(query: Record<string, unknown>): void {
  try {
    const kept = Object.fromEntries(Object.entries(query).filter(([key, value]) => key !== 'page' && value));
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(kept));
  } catch {
    // Penyimpanan peramban tidak tersedia: saringan tetap di alamat halaman.
  }
}

/** Mengganti saringan; halaman kembali ke 1 kecuali yang diganti nomor halaman. */
function setQuery(change: Partial<Record<Key, string>>): void {
  const next: Record<string, string> = { ...(route.query as Record<string, string>), ...change };
  if (!('page' in change)) delete next.page;
  if ('customer' in change) {
    delete next.kategori; // kategori dan system milik customer tertentu
    delete next.system;
  }
  for (const key of Object.keys(next)) {
    if (!next[key] || (key === 'page' && next[key] === '1') || (key === 'view' && next[key] === 'semua')) delete next[key];
    if (key === 'sort' && next[key] === 'mulai') delete next[key];
  }
  void router.replace({ query: next });
}

function clearFilters(): void {
  search.value = '';
  clearTimeout(debounce);
  typing = false;
  const view = filters.value.view;
  void router.replace({ query: view === 'semua' ? {} : { view } });
}

/** Nomor permintaan terakhir: jawaban permintaan yang lebih lama (saringan usang) diabaikan. */
let latest = 0;

async function load(): Promise<void> {
  const mine = ++latest;
  loading.value = true;
  error.value = '';
  try {
    const f = filters.value;
    const result = await ticketApi.list({
      view: f.view,
      tenantId: f.customer,
      categoryId: f.kategori,
      systemId: f.system,
      status: f.status,
      q: f.q,
      sort: f.sort,
      page: String(f.page),
    });
    if (mine === latest) page.value = result;
  } catch (cause) {
    if (mine === latest) error.value = cause instanceof Error ? cause.message : 'Antrean NPR gagal dimuat.';
  } finally {
    if (mine === latest) loading.value = false;
  }
}

watch(
  filters,
  () => {
    if (!showTt.value) void load();
    remember(route.query);
  },
  { immediate: true, deep: true },
);
watch(showTt, (tt) => {
  if (!tt) void load();
});

/** Customer untuk pilihan kategori/system: yang disaring, atau satu-satunya customer pengguna. */
const masterCustomer = computed(
  () => filters.value.customer || (customers.value.length === 1 ? (customers.value[0]?.id ?? '') : ''),
);
watch(
  masterCustomer,
  async (customer) => {
    [categories.value, systems.value] = customer
      ? await Promise.all([ticketApi.categories(customer).catch(() => []), ticketApi.systems(customer).catch(() => [])])
      : [[], []];
  },
  { immediate: true },
);
void ticketApi.customers().then((list) => (customers.value = list)).catch(() => undefined);

const showCustomer = computed(() => customers.value.length > 1 && !filters.value.customer);
const range = computed(() => {
  if (!page.value || page.value.total === 0) return '';
  const first = (page.value.page - 1) * page.value.pageSize + 1;
  const last = first + page.value.items.length - 1;
  return `${number.format(first)}–${number.format(last)} dari ${number.format(page.value.total)} NPR`;
});
const lastPage = computed(() => (page.value ? Math.max(1, Math.ceil(page.value.total / page.value.pageSize)) : 1));
const emptyTitle = computed(() => {
  if (filtered.value) return 'Tidak ada NPR yang cocok';
  return {
    semua: 'Tidak ada NPR terbuka',
    saya: 'Belum ada NPR yang Anda ambil',
    pending: 'Tidak ada NPR pending',
    eskalasi: 'Tidak ada NPR yang dieskalasi',
    siap: 'Tidak ada NPR yang siap ditutup',
  }[filters.value.view];
});

const roleLabel = (role: string) => (isRole(role) ? ROLE_LABELS[role].split(' ')[0] : role);

async function take(item: TicketQueueItem): Promise<void> {
  taking.value = item.id;
  notice.value = '';
  error.value = '';
  try {
    await ticketApi.take(item.id, null);
    notice.value = `${item.number} sekarang Anda tangani.`;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'NPR gagal diambil.';
  } finally {
    taking.value = null;
    await load();
  }
}

function open(id: string): void {
  void router.push({ name: 'ticket-detail', params: { id } });
}
</script>

<template>
  <div>
    <PageHeader
      title="Tiket"
      subtitle="Antrean NPR. Yang paling lama gangguannya di atas."
    >
      <template #actions>
        <RouterLink
          :to="{ name: 'ticket-new' }"
          class="btn btn-primary header-action"
        >
          <IconPlus
            size="18"
            aria-hidden="true"
          />
          Buat NPR
        </RouterLink>
      </template>
    </PageHeader>

    <nav
      class="lists"
      aria-label="Daftar tiket"
    >
      <RouterLink
        :to="{ query: {} }"
        class="lists__item"
        :aria-current="showTt ? undefined : 'page'"
      >
        NPR
      </RouterLink>
      <RouterLink
        :to="{ query: { daftar: 'tt' } }"
        class="lists__item"
        :aria-current="showTt ? 'page' : undefined"
      >
        TT aktif
      </RouterLink>
    </nav>

    <TroubleTicketList
      v-if="showTt"
      :customers="customers"
    />

    <template v-else>
      <nav
        class="views"
        aria-label="Tampilan antrean"
      >
        <RouterLink
          v-for="view in TICKET_QUEUE_VIEWS"
          :key="view"
          :to="{ query: { ...route.query, view: view === 'semua' ? undefined : view, page: undefined } }"
          replace
          class="views__item"
          :aria-current="filters.view === view ? 'page' : undefined"
        >
          {{ TICKET_QUEUE_VIEW_LABELS[view] }}
          <span
            class="views__count"
            :aria-label="`${page?.counts[view] ?? 0} NPR`"
          >{{ page ? number.format(page.counts[view]) : '–' }}</span>
        </RouterLink>
      </nav>

      <div class="card">
        <div class="card-body border-bottom filters">
          <div class="filters__search">
            <label
              class="form-label"
              for="cari-npr"
            >Cari di antrean</label>
            <div class="input-icon">
              <span
                class="input-icon-addon"
                aria-hidden="true"
              ><IconSearch size="16" /></span>
              <input
                id="cari-npr"
                v-model="search"
                type="search"
                class="form-control"
                maxlength="100"
                autocomplete="off"
                aria-describedby="cari-npr-bantuan"
              >
            </div>
            <div
              id="cari-npr-bantuan"
              class="form-hint"
            >
              No. NPR, no. tiket customer, kode, nama, atau kota remote
            </div>
          </div>
          <div v-if="customers.length > 1">
            <label
              class="form-label"
              for="saring-customer"
            >Customer</label>
            <select
              id="saring-customer"
              class="form-select"
              :value="filters.customer"
              @change="setQuery({ customer: ($event.target as HTMLSelectElement).value })"
            >
              <option value="">
                Semua customer
              </option>
              <option
                v-for="customer in customers"
                :key="customer.id"
                :value="customer.id"
              >
                {{ customer.name }}
              </option>
            </select>
          </div>
          <div>
            <label
              class="form-label"
              for="saring-kategori"
            >Kategori</label>
            <select
              id="saring-kategori"
              class="form-select"
              :value="filters.kategori"
              :disabled="!masterCustomer"
              @change="setQuery({ kategori: ($event.target as HTMLSelectElement).value })"
            >
              <option value="">
                {{ masterCustomer ? 'Semua kategori' : 'Pilih customer' }}
              </option>
              <option
                v-for="value in categories"
                :key="value.id"
                :value="value.id"
              >
                {{ value.name }}
              </option>
            </select>
          </div>
          <div>
            <label
              class="form-label"
              for="saring-system"
            >System</label>
            <select
              id="saring-system"
              class="form-select"
              :value="filters.system"
              :disabled="!masterCustomer"
              @change="setQuery({ system: ($event.target as HTMLSelectElement).value })"
            >
              <option value="">
                {{ masterCustomer ? 'Semua system' : 'Pilih customer' }}
              </option>
              <option
                v-for="value in systems"
                :key="value.id"
                :value="value.id"
              >
                {{ value.name }}
              </option>
            </select>
          </div>
          <div>
            <label
              class="form-label"
              for="saring-status"
            >Status</label>
            <select
              id="saring-status"
              class="form-select"
              :value="filters.status"
              @change="setQuery({ status: ($event.target as HTMLSelectElement).value })"
            >
              <option value="">
                Sesuai tampilan
              </option>
              <option
                v-for="status in TICKET_STATUSES"
                :key="status"
                :value="status"
              >
                {{ TICKET_STATUS_LABELS[status] }}
              </option>
            </select>
          </div>
          <div>
            <label
              class="form-label"
              for="urutan"
            >Urutan</label>
            <select
              id="urutan"
              class="form-select"
              :value="filters.sort"
              @change="setQuery({ sort: ($event.target as HTMLSelectElement).value })"
            >
              <option value="mulai">
                Gangguan terlama dulu
              </option>
              <option value="terbaru">
                NPR terbaru dulu
              </option>
            </select>
          </div>
        </div>

        <div
          v-if="notice"
          class="alert alert-success m-3 mb-0"
          role="status"
        >
          {{ notice }}
        </div>
        <div
          v-if="error"
          class="card-body text-danger"
          role="alert"
        >
          {{ error }}
        </div>
        <div
          v-if="page && page.total === 0 && !loading"
          class="empty"
        >
          <p class="empty-title">
            {{ emptyTitle }}
          </p>
          <p class="empty-subtitle text-secondary">
            {{ filtered ? 'Ubah kata kunci atau saringan.' : filters.view === 'saya' ? 'Tekan "Ambil" di NPR yang belum punya penanggung.' : 'NPR baru muncul di sini begitu dibuat.' }}
          </p>
          <div class="empty-action">
            <button
              v-if="filtered"
              type="button"
              class="btn"
              @click="clearFilters"
            >
              Hapus saringan
            </button>
          </div>
        </div>
        <div
          v-else-if="page && page.total > 0"
          class="table-responsive"
          :aria-busy="loading"
        >
          <table class="table table-vcenter card-table queue-table">
            <thead>
              <tr>
                <th>No. NPR</th>
                <th>Remote</th>
                <th>{{ showCustomer ? 'Customer · Kategori' : 'Kategori' }}</th>
                <th>Status</th>
                <th>Gangguan</th>
                <th>Penanggung</th>
                <th class="d-none d-xxl-table-cell">
                  Aksi terakhir
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="item in page.items"
                :key="item.id"
                class="queue-row"
                @click="open(item.id)"
              >
                <td class="queue-row__number">
                  <RouterLink
                    :to="{ name: 'ticket-detail', params: { id: item.id } }"
                    class="font-monospace"
                    @click.stop
                  >
                    {{ item.number }}
                  </RouterLink>
                  <span
                    v-if="item.customerTicketNumber"
                    class="d-block text-secondary font-monospace small"
                  >{{ item.customerTicketNumber }}</span>
                </td>
                <td class="queue-row__remote">
                  {{ item.remote.name }}
                  <span class="d-block text-secondary small">
                    <span class="font-monospace">{{ item.remote.code }}</span>
                    <template v-if="item.remote.city"> · {{ item.remote.city }}</template>
                  </span>
                </td>
                <td>
                  <template v-if="showCustomer">
                    {{ item.customerName }}
                    <span class="d-block text-secondary small">{{ item.categoryName }}</span>
                  </template>
                  <template v-else>
                    {{ item.categoryName }}
                  </template>
                </td>
                <td class="queue-row__status">
                  <TicketStatusPill :status="item.status" />
                  <span
                    v-if="item.pendingReason"
                    class="d-block small pending-reason"
                  >{{ item.pendingReason }}</span>
                </td>
                <td class="queue-row__duration">
                  {{ durationLabel(item.startedAt, now) }}
                  <span
                    class="d-block text-secondary small"
                    :title="`Mulai ${formatZoned(item.startedAt, item.remote.zone)}`"
                  >sejak {{ formatZonedShort(item.startedAt, item.remote.zone) }}</span>
                </td>
                <td
                  class="queue-row__owner"
                  @click.stop
                >
                  <template v-if="item.assignee">
                    {{ item.assignee.name }}
                    <span class="text-secondary">· {{ roleLabel(item.assignee.role) }}</span>
                  </template>
                  <button
                    v-else-if="item.status !== 'ditutup'"
                    type="button"
                    class="btn btn-sm take-button"
                    :disabled="taking !== null"
                    :aria-label="`Ambil ${item.number}`"
                    @click="take(item)"
                  >
                    {{ taking === item.id ? 'Mengambil…' : 'Ambil' }}
                  </button>
                  <span
                    v-else
                    class="text-secondary"
                  >—</span>
                </td>
                <td class="d-none d-xxl-table-cell">
                  {{ TICKET_ACTION_KIND_LABELS[item.lastAction.kind] }}
                  <span class="d-block text-secondary small">{{ sinceLabel(item.lastAction.at, now) }} · {{ item.lastAction.byName }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p
          v-else-if="loading"
          class="card-body text-secondary m-0"
          role="status"
        >
          Memuat antrean…
        </p>

        <div
          v-if="page && page.total > 0"
          class="card-footer d-flex flex-wrap gap-2 align-items-center"
        >
          <p
            class="m-0 text-secondary me-auto"
            role="status"
          >
            {{ range }}
          </p>
          <nav
            class="d-flex gap-2"
            aria-label="Halaman antrean"
          >
            <button
              type="button"
              class="btn"
              :disabled="filters.page <= 1 || loading"
              @click="setQuery({ page: String(filters.page - 1) })"
            >
              Sebelumnya
            </button>
            <button
              type="button"
              class="btn"
              :disabled="filters.page >= lastPage || loading"
              @click="setQuery({ page: String(filters.page + 1) })"
            >
              Berikutnya
            </button>
          </nav>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.header-action {
  gap: 6px;
  min-height: 44px;
}

.lists {
  display: inline-flex;
  gap: 4px;
  margin-bottom: 12px;
  padding: 3px;
  border-radius: 8px;
  background: var(--tblr-bg-surface-secondary);
}

.lists__item {
  display: inline-flex;
  align-items: center;
  min-height: 40px;
  padding: 0 16px;
  border-radius: 6px;
  color: var(--tblr-secondary);
  font-weight: 500;
  text-decoration: none;
}

.lists__item[aria-current='page'] {
  background: var(--tblr-bg-surface);
  color: var(--tblr-body-color);
  font-weight: 600;
  box-shadow: 0 1px 2px rgba(24, 36, 51, 0.12);
}

.views {
  display: flex;
  gap: 4px;
  margin-bottom: 12px;
  overflow-x: auto;
  border-bottom: 1px solid var(--tblr-border-color);
}

.views__item {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  padding: 0 12px;
  border-bottom: 2px solid transparent;
  color: var(--tblr-secondary);
  font-weight: 500;
  white-space: nowrap;
  text-decoration: none;
}

.views__item[aria-current='page'] {
  border-bottom-color: var(--tblr-primary);
  color: var(--tblr-primary);
  font-weight: 600;
}

.views__count {
  min-width: 22px;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--tblr-bg-surface-secondary);
  color: var(--tblr-body-color);
  font-size: 12px;
  text-align: center;
}

.filters {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 12px;
  align-items: start;
}

/* Kotak cari satu baris penuh; lima pilihan saringan di baris berikutnya. */
.filters__search {
  grid-column: 1 / -1;
  max-width: 560px;
}

.queue-row__remote {
  min-width: 150px;
}

.queue-row {
  cursor: pointer;
}

.queue-row:hover {
  background: var(--tblr-active-bg);
}

.queue-row__number a {
  white-space: nowrap;
}

/* Pending menonjol: alasan tertulis di bawah status (spesifikasi 1.5). */
.pending-reason {
  max-width: 220px;
  margin-top: 4px;
  color: #7a4a00;
}

:global([data-bs-theme='dark']) .pending-reason {
  color: #f0c36b;
}

.take-button {
  min-height: 36px;
}

[aria-busy='true'] {
  opacity: 0.6;
}

@media (max-width: 1199.98px) {
  .filters {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 767.98px) {
  .filters {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .take-button {
    min-height: 44px;
  }
}

/* Di bawah 1200 px setiap NPR menjadi satu blok bertumpuk, tanpa gulir mendatar. */
@media (max-width: 1199.98px) {
  .queue-table thead {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
  }

  .queue-table tr {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 16px;
    padding: 12px 16px;
    border-bottom: 1px solid var(--tblr-border-color);
  }

  .queue-table.card-table td,
  .queue-table.card-table td:first-child,
  .queue-table.card-table td:last-child {
    display: block;
    padding: 0;
    border: 0;
  }

  .queue-table td:first-child {
    flex: 1 1 auto;
  }

  .queue-table td:first-child a {
    display: inline-block;
    min-height: 44px;
    line-height: 44px;
    white-space: normal;
    overflow-wrap: anywhere;
  }

  .queue-table td.queue-row__remote {
    flex-basis: 100%;
    min-width: 0;
    order: 3;
  }

  .queue-table td.queue-row__status {
    order: 2;
  }

  .queue-table td:nth-child(n + 3):not(.queue-row__status, .queue-row__remote) {
    order: 4;
  }
}

@media (max-width: 479.98px) {
  .filters {
    grid-template-columns: 1fr;
  }
}
</style>
