<script setup lang="ts">
import { IconFileSpreadsheet, IconList, IconMap, IconSearch, IconX } from '@tabler/icons-vue';
import type { MasterValue, RemotePage, TenantSummary } from '@npr/shared';
import { computed, defineAsyncComponent, onBeforeUnmount, ref, watch } from 'vue';
import { type RouteLocationRaw, useRoute, useRouter } from 'vue-router';
import PageHeader from '../../components/PageHeader.vue';
import { useSessionStore } from '../../stores/session';
import { type RemoteMapQuery, remoteApi } from './remote-api';

// Daftar remote (langkah 1.2): cari dan saring ribuan remote. Semua saringan tersimpan di
// alamat halaman, jadi bisa dibagikan dan tetap ada setelah kembali dari halaman remote.
// Tampilan Peta (langkah 2.3, T140, `?tampilan=peta`) memakai saringan yang sama; peta hanya
// memuat remote aktif atau nonaktif (bawaan aktif). `?koordinat=tidak|ada` menyaring daftar
// menurut ada/tidaknya koordinat (tautan "remote tanpa koordinat" dari peta, T143).

// Leaflet dan garis pulau hanya dimuat saat peta dibuka.
const RemoteMap = defineAsyncComponent(() => import('./map/RemoteMap.vue'));

const route = useRoute();
const router = useRouter();
const session = useSessionStore();
const isAdmin = computed(() => session.user?.role === 'admin');
const number = new Intl.NumberFormat('id-ID');

const customers = ref<TenantSummary[]>([]);
const networks = ref<MasterValue[]>([]);
const page = ref<RemotePage | null>(null);
const loading = ref(true);
const error = ref('');

const one = (value: unknown) => (typeof value === 'string' ? value : '');
const isMap = computed(() => route.query.tampilan === 'peta');
const filters = computed(() => ({
  q: one(route.query.q),
  customer: one(route.query.customer),
  jarkom: one(route.query.jarkom),
  status: one(route.query.status),
  koordinat: ['ada', 'tidak'].includes(one(route.query.koordinat)) ? one(route.query.koordinat) : '',
  page: Math.max(1, Number(one(route.query.page)) || 1),
}));
const filtered = computed(
  () =>
    !!(filters.value.q || filters.value.customer || filters.value.jarkom || filters.value.status || filters.value.koordinat),
);
const customerName = (id: string) => customers.value.find((customer) => customer.id === id)?.name ?? '';
const showCustomer = computed(() => customers.value.length > 1 && !filters.value.customer);

const search = ref(filters.value.q);
let debounce: ReturnType<typeof setTimeout> | undefined;
watch(search, (value) => {
  clearTimeout(debounce);
  debounce = setTimeout(() => setQuery({ q: value.trim() }), 300);
});
onBeforeUnmount(() => clearTimeout(debounce));

/** Mengganti saringan; halaman kembali ke 1 kecuali yang diganti nomor halaman. */
function setQuery(change: Partial<Record<'q' | 'customer' | 'jarkom' | 'status' | 'koordinat' | 'page', string>>): void {
  const next: Record<string, string> = { ...(route.query as Record<string, string>), ...change };
  if (!('page' in change)) delete next.page;
  if ('customer' in change) delete next.jarkom; // jarkom milik customer tertentu
  for (const key of Object.keys(next)) if (!next[key] || (key === 'page' && next[key] === '1')) delete next[key];
  void router.replace({ query: next });
}

function clearFilters(): void {
  search.value = '';
  clearTimeout(debounce);
  void router.replace({ query: {} });
}

/** Alamat tampilan Daftar atau Peta dengan saringan yang sama. */
function viewLink(view: 'daftar' | 'peta'): RouteLocationRaw {
  const next: Record<string, string> = { ...(route.query as Record<string, string>) };
  delete next.page;
  delete next.tampilan;
  if (view === 'peta') {
    delete next.koordinat; // peta hanya memuat remote berkoordinat
    next.tampilan = 'peta';
  }
  return { query: next };
}

/** Peta memuat remote aktif kecuali status Nonaktif dipilih (T141). */
const mapQuery = computed<RemoteMapQuery>(() => ({
  q: filters.value.q || undefined,
  tenantId: filters.value.customer || undefined,
  networkId: filters.value.jarkom || undefined,
  active: filters.value.status === 'nonaktif' ? 'false' : 'true',
}));
const statusValue = computed(() =>
  isMap.value ? (filters.value.status === 'nonaktif' ? 'nonaktif' : '') : filters.value.status,
);
/** Daftar remote yang cocok dengan saringan peta tetapi tanpa koordinat (T143). */
const withoutCoordinatesLink = computed<RouteLocationRaw>(() => {
  const query: Record<string, string> = {
    status: mapQuery.value.active === 'false' ? 'nonaktif' : 'aktif',
    koordinat: 'tidak',
  };
  if (filters.value.q) query.q = filters.value.q;
  if (filters.value.customer) query.customer = filters.value.customer;
  if (filters.value.jarkom) query.jarkom = filters.value.jarkom;
  return { query };
});

async function load(): Promise<void> {
  if (isMap.value) return;
  loading.value = true;
  error.value = '';
  try {
    page.value = await remoteApi.list({
      q: filters.value.q || undefined,
      tenantId: filters.value.customer || undefined,
      networkId: filters.value.jarkom || undefined,
      active: filters.value.status === 'aktif' ? 'true' : filters.value.status === 'nonaktif' ? 'false' : undefined,
      hasCoordinates: filters.value.koordinat === 'ada' ? 'true' : filters.value.koordinat === 'tidak' ? 'false' : undefined,
      page: filters.value.page,
    });
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Daftar remote gagal dimuat.';
  } finally {
    loading.value = false;
  }
}

watch([filters, isMap], () => void load(), { immediate: true, deep: true });
watch(
  () => filters.value.customer,
  async (customer) => {
    networks.value = customer ? await remoteApi.networks(customer).catch(() => []) : [];
  },
  { immediate: true },
);
void remoteApi.customers().then((list) => (customers.value = list)).catch(() => undefined);

const range = computed(() => {
  if (!page.value || page.value.total === 0) return '';
  const first = (page.value.page - 1) * page.value.pageSize + 1;
  const last = first + page.value.items.length - 1;
  return `${number.format(first)}–${number.format(last)} dari ${number.format(page.value.total)} remote`;
});
const lastPage = computed(() => (page.value ? Math.max(1, Math.ceil(page.value.total / page.value.pageSize)) : 1));

function open(id: string): void {
  void router.push({ name: 'remote-detail', params: { id } });
}
</script>

<template>
  <div>
    <PageHeader
      title="Remote"
      subtitle="Data site, jaringan, dan kontak per remote. Data remote hanya diubah admin."
    >
      <template
        v-if="isAdmin"
        #actions
      >
        <RouterLink
          :to="{ name: 'remote-import' }"
          class="btn btn-primary"
        >
          <IconFileSpreadsheet
            size="18"
            class="me-1"
            aria-hidden="true"
          />
          Impor dari Excel
        </RouterLink>
      </template>
    </PageHeader>

    <div class="card">
      <div class="card-header remote-views">
        <nav
          class="nav nav-segmented"
          aria-label="Tampilan remote"
        >
          <RouterLink
            :to="viewLink('daftar')"
            class="nav-link"
            :class="{ active: !isMap }"
            :aria-current="isMap ? undefined : 'page'"
            replace
          >
            <IconList
              size="16"
              aria-hidden="true"
            />
            Daftar
          </RouterLink>
          <RouterLink
            :to="viewLink('peta')"
            class="nav-link"
            :class="{ active: isMap }"
            :aria-current="isMap ? 'page' : undefined"
            replace
          >
            <IconMap
              size="16"
              aria-hidden="true"
            />
            Peta
          </RouterLink>
        </nav>
      </div>
      <div class="card-body border-bottom filters">
        <div class="filters__search">
          <label
            class="form-label"
            for="cari-remote"
          >Cari remote</label>
          <div class="input-icon">
            <span
              class="input-icon-addon"
              aria-hidden="true"
            ><IconSearch size="16" /></span>
            <input
              id="cari-remote"
              v-model="search"
              type="search"
              class="form-control"
              maxlength="100"
              autocomplete="off"
              aria-describedby="cari-remote-bantuan"
            >
          </div>
          <div
            id="cari-remote-bantuan"
            class="form-hint"
          >
            Kode, nama, kota, provinsi, kanwil, kanca, pengelola, atau IP
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
            for="saring-jarkom"
          >Jarkom</label>
          <select
            id="saring-jarkom"
            class="form-select"
            :value="filters.jarkom"
            :disabled="!filters.customer"
            :title="filters.customer ? undefined : 'Pilih customer dulu'"
            @change="setQuery({ jarkom: ($event.target as HTMLSelectElement).value })"
          >
            <option value="">
              {{ filters.customer ? 'Semua jarkom' : 'Pilih customer' }}
            </option>
            <option
              v-for="network in networks"
              :key="network.id"
              :value="network.id"
            >
              {{ network.name }} ({{ network.code }})
            </option>
          </select>
        </div>
        <div>
          <label
            class="form-label"
            for="saring-status"
          >Status</label>
          <select
            v-if="isMap"
            id="saring-status"
            class="form-select"
            :value="statusValue"
            @change="setQuery({ status: ($event.target as HTMLSelectElement).value })"
          >
            <option value="">
              Aktif
            </option>
            <option value="nonaktif">
              Nonaktif
            </option>
          </select>
          <select
            v-else
            id="saring-status"
            class="form-select"
            :value="statusValue"
            @change="setQuery({ status: ($event.target as HTMLSelectElement).value })"
          >
            <option value="">
              Semua status
            </option>
            <option value="aktif">
              Aktif
            </option>
            <option value="nonaktif">
              Nonaktif
            </option>
          </select>
        </div>
      </div>
      <div
        v-if="!isMap && filters.koordinat"
        class="card-body border-bottom py-2 d-flex flex-wrap align-items-center gap-2"
      >
        <span>{{ filters.koordinat === 'tidak' ? 'Hanya remote tanpa koordinat' : 'Hanya remote berkoordinat' }}</span>
        <button
          type="button"
          class="btn btn-sm"
          @click="setQuery({ koordinat: '' })"
        >
          <IconX
            size="16"
            class="me-1"
            aria-hidden="true"
          />
          Hapus saringan koordinat
        </button>
      </div>

      <RemoteMap
        v-if="isMap"
        :query="mapQuery"
        :without-coordinates-link="withoutCoordinatesLink"
      />

      <div
        v-else-if="error"
        class="card-body text-danger"
        role="alert"
      >
        {{ error }}
      </div>
      <div
        v-else-if="page && page.total === 0 && !loading"
        class="empty"
      >
        <p class="empty-title">
          {{ filtered ? 'Tidak ada remote yang cocok' : 'Belum ada remote' }}
        </p>
        <p class="empty-subtitle text-secondary">
          {{ filtered ? 'Ubah kata kunci atau saringan.' : isAdmin ? 'Tambahkan remote dengan mengimpor berkas Excel.' : 'Admin menambahkan remote lewat impor Excel.' }}
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
        v-else-if="page"
        class="table-responsive"
        :aria-busy="loading"
      >
        <table class="table table-vcenter card-table remote-table">
          <thead>
            <tr>
              <th>Kode</th>
              <th>Nama</th>
              <th v-if="showCustomer">
                Customer
              </th>
              <th>Jarkom</th>
              <th>Lokasi</th>
              <th class="d-none d-xl-table-cell">
                Kanwil / Kanca
              </th>
              <th class="d-none d-lg-table-cell">
                IP SNMP
              </th>
              <th class="w-1">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="remote in page.items"
              :key="remote.id"
              class="remote-row"
              :class="{ 'text-secondary': !remote.active }"
              @click="open(remote.id)"
            >
              <td class="font-monospace text-nowrap">
                <RouterLink
                  :to="{ name: 'remote-detail', params: { id: remote.id } }"
                  @click.stop
                >
                  {{ remote.code }}
                </RouterLink>
              </td>
              <td>{{ remote.name }}</td>
              <td v-if="showCustomer">
                {{ customerName(remote.tenantId) }}
              </td>
              <td>{{ remote.networkCode }}</td>
              <td>
                {{ [remote.city, remote.province].filter(Boolean).join(', ') || '—' }}
                <span class="text-secondary">· {{ remote.zone }}</span>
              </td>
              <td class="d-none d-xl-table-cell">
                {{ [remote.kanwil, remote.kanca].filter(Boolean).join(' / ') || '—' }}
              </td>
              <td class="d-none d-lg-table-cell font-monospace">
                {{ remote.ipSnmp ?? '—' }}
              </td>
              <td>
                <span
                  class="pill"
                  :class="remote.active ? 'pill--on' : 'pill--off'"
                >{{ remote.active ? 'Aktif' : 'Nonaktif' }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div
        v-if="!isMap && page && page.total > 0"
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
          aria-label="Halaman daftar remote"
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
  </div>
</template>

<style scoped>
.filters {
  display: grid;
  grid-template-columns: minmax(240px, 2fr) repeat(3, minmax(160px, 1fr));
  gap: 12px;
  align-items: start;
}

.remote-row {
  cursor: pointer;
}

.remote-row:hover {
  background: var(--tblr-active-bg);
}

[aria-busy='true'] {
  opacity: 0.6;
}

/* Pil ukuran S (ATURAN.md §5). */
.pill {
  display: inline-flex;
  align-items: center;
  height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}

.pill--on {
  background: #dcf2e1;
  color: #1b6430;
}

.pill--off {
  background: #eaedf1;
  color: #454f5c;
}

@media (max-width: 991.98px) {
  .filters {
    grid-template-columns: 1fr 1fr;
  }

  .filters__search {
    grid-column: 1 / -1;
  }
}

/* Ponsel: setiap remote menjadi satu blok bertumpuk, tanpa gulir mendatar. */
@media (max-width: 575.98px) {
  .remote-views .nav-segmented {
    --tblr-nav-height: 48px; /* area sentuh 44 px */
  }

  .filters {
    grid-template-columns: 1fr;
  }

  .remote-table thead {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
  }

  .remote-table tr {
    display: flex;
    flex-wrap: wrap;
    gap: 2px 12px;
    padding: 12px 16px;
    border-bottom: 1px solid var(--tblr-border-color);
  }

  .remote-table.card-table td,
  .remote-table.card-table td:first-child,
  .remote-table.card-table td:last-child {
    display: block;
    padding: 0;
    border: 0;
  }

  .remote-table td:first-child {
    flex: 1 1 60%;
  }

  .remote-table td:first-child a {
    display: inline-block;
    min-height: 44px;
    line-height: 44px;
  }

  .remote-table td:nth-child(2) {
    flex-basis: 100%;
    order: 3;
  }

  .remote-table td:nth-child(n + 3) {
    order: 4;
    color: var(--tblr-secondary);
  }

  .remote-table td:last-child {
    order: 2;
  }
}
</style>
