<script setup lang="ts">
import { IconAlertTriangle, IconAntenna, IconFileImport, IconSearch } from '@tabler/icons-vue';
import {
  type MasterItem,
  PROVINCES,
  REMOTE_STATUS_LABELS,
  REMOTE_STATUSES,
  type RemoteListQuery,
  type RemoteListResponse,
  type RemoteStatus,
  type TenantRef,
} from '@tyio/shared';
import { storeToRefs } from 'pinia';
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { type LocationQuery, RouterLink, useRoute, useRouter } from 'vue-router';
import { ApiError } from '../../api/client';
import { masterApi } from '../../api/master';
import { remotesApi } from '../../api/remotes';
import { tenantsApi } from '../../api/tenants';
import { useAuthStore } from '../../stores/auth';
import { canManageRemotes, STATUS_BADGE } from './remote-display';

// Pola halaman: daftar. Pencarian, saringan, dan halaman tersimpan di alamat (bisa dibagikan,
// tombol kembali berfungsi).
const route = useRoute();
const router = useRouter();
const { user } = storeToRefs(useAuthStore());

const one = (value: LocationQuery[string] | undefined) => (typeof value === 'string' ? value : '');
const filters = computed(() => ({
  q: one(route.query.q),
  customer: one(route.query.customer),
  provinsi: one(route.query.provinsi),
  jarkom: one(route.query.jarkom),
  status: one(route.query.status),
  halaman: Math.max(1, Number(one(route.query.halaman)) || 1),
}));
const hasFilters = computed(() =>
  Boolean(filters.value.q || filters.value.customer || filters.value.provinsi || filters.value.jarkom || filters.value.status),
);

const tenants = ref<TenantRef[]>([]);
const jarkoms = ref<MasterItem[]>([]);
void tenantsApi.list().then((list) => (tenants.value = list)).catch(() => undefined);
void masterApi.options('jarkom').then((list) => (jarkoms.value = list)).catch(() => undefined);
const showCustomer = computed(() => tenants.value.length > 1);

const result = ref<RemoteListResponse | null>(null);
const state = ref<'loading' | 'ready' | 'error'>('loading');
const loadError = ref('');
let latest = 0;

async function load(): Promise<void> {
  const request = ++latest;
  const f = filters.value;
  const query: RemoteListQuery = {
    q: f.q || undefined,
    tenantId: f.customer || undefined,
    province: f.provinsi || undefined,
    jarkomId: f.jarkom || undefined,
    status: (f.status || undefined) as RemoteStatus | undefined,
    page: f.halaman,
  };
  state.value = result.value ? 'ready' : 'loading';
  try {
    const response = await remotesApi.list(query);
    if (request !== latest) return; // jawaban lama datang setelah yang baru
    result.value = response;
    state.value = 'ready';
  } catch (error) {
    if (request !== latest) return;
    loadError.value = error instanceof ApiError ? error.message : 'Daftar remote gagal dimuat.';
    state.value = 'error';
  }
}
watch(filters, load, { immediate: true, deep: true });

/** Mengganti saringan di alamat; kembali ke halaman 1. */
function setFilter(key: 'q' | 'customer' | 'provinsi' | 'jarkom' | 'status', value: string): void {
  const query: Record<string, string> = {};
  for (const [k, v] of Object.entries({ ...filters.value, [key]: value, halaman: '' })) {
    if (v) query[k] = String(v);
  }
  void router.replace({ query });
}

function goToPage(page: number): void {
  void router.push({ query: { ...route.query, halaman: page > 1 ? String(page) : undefined } });
}

function clearFilters(): void {
  search.value = '';
  void router.replace({ query: {} });
}

// Pencarian dikirim setelah pengguna berhenti mengetik sebentar.
const search = ref(filters.value.q);
let typing: ReturnType<typeof setTimeout> | undefined;
watch(search, (value) => {
  clearTimeout(typing);
  typing = setTimeout(() => setFilter('q', value.trim()), 300);
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
  return `${first.toLocaleString('id-ID')}–${last.toLocaleString('id-ID')} dari ${r.total.toLocaleString('id-ID')} remote`;
});
const lastPage = computed(() => (result.value ? Math.max(1, Math.ceil(result.value.total / result.value.pageSize)) : 1));
</script>

<template>
  <div class="page-header mb-3 flex-row flex-wrap gap-2 align-items-end">
    <div class="me-auto">
      <h1 class="page-title">
        Remote
      </h1>
      <p class="text-secondary mb-0">
        Data site: lokasi, jaringan, dan kontak tiap remote.
      </p>
    </div>
    <RouterLink
      v-if="canManageRemotes(user)"
      :to="{ name: 'remote-import' }"
      class="btn btn-primary action-target"
    >
      <IconFileImport
        class="icon"
        :size="18"
        aria-hidden="true"
      />
      Impor dari Excel
    </RouterLink>
  </div>

  <div class="card mb-3">
    <div
      class="card-body"
      role="search"
    >
      <div class="row g-2">
        <div class="col-12 col-lg-4">
          <label
            class="form-label"
            for="remote-search"
          >Cari</label>
          <div class="input-icon">
            <span
              class="input-icon-addon"
              aria-hidden="true"
            ><IconSearch :size="18" /></span>
            <input
              id="remote-search"
              v-model="search"
              type="search"
              class="form-control"
              placeholder="Site ID, nama, kota, atau kanca"
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
            for="remote-customer"
          >Customer</label>
          <select
            id="remote-customer"
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
            for="remote-province"
          >Provinsi</label>
          <select
            id="remote-province"
            class="form-select"
            :value="filters.provinsi"
            @change="setFilter('provinsi', ($event.target as HTMLSelectElement).value)"
          >
            <option value="">
              Semua
            </option>
            <option
              v-for="p in PROVINCES"
              :key="p.name"
              :value="p.name"
            >
              {{ p.name }}
            </option>
          </select>
        </div>
        <div class="col-6 col-lg-2">
          <label
            class="form-label"
            for="remote-jarkom"
          >Jarkom</label>
          <select
            id="remote-jarkom"
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
        <div class="col-6 col-lg-2">
          <label
            class="form-label"
            for="remote-status"
          >Status</label>
          <select
            id="remote-status"
            class="form-select"
            :value="filters.status"
            @change="setFilter('status', ($event.target as HTMLSelectElement).value)"
          >
            <option value="">
              Semua
            </option>
            <option
              v-for="s in REMOTE_STATUSES"
              :key="s"
              :value="s"
            >
              {{ REMOTE_STATUS_LABELS[s] }}
            </option>
          </select>
        </div>
      </div>
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
      Memuat remote…
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
        Daftar remote gagal dimuat
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
        <IconAntenna
          :size="40"
          aria-hidden="true"
        />
      </div>
      <template v-if="hasFilters">
        <p class="empty-title">
          Tidak ada remote yang cocok
        </p>
        <p class="empty-subtitle text-secondary">
          Coba kata lain, atau hapus saringan.
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
          Belum ada remote
        </p>
        <p class="empty-subtitle text-secondary">
          {{ canManageRemotes(user) ? 'Impor daftar remote dari file Excel untuk memulai.' : 'Daftar remote diisi oleh admin.' }}
        </p>
        <div
          v-if="canManageRemotes(user)"
          class="empty-action"
        >
          <RouterLink
            :to="{ name: 'remote-import' }"
            class="btn btn-primary"
          >
            Impor dari Excel
          </RouterLink>
        </div>
      </template>
    </div>

    <template v-else-if="result">
      <table class="table table-vcenter card-table">
        <caption class="visually-hidden">
          Daftar remote, {{ range }}
        </caption>
        <thead>
          <tr>
            <th scope="col">
              Site ID
            </th>
            <th scope="col">
              Nama
            </th>
            <th
              v-if="showCustomer"
              scope="col"
              class="d-none d-lg-table-cell"
            >
              Customer
            </th>
            <th
              scope="col"
              class="d-none d-md-table-cell"
            >
              Lokasi
            </th>
            <th
              scope="col"
              class="d-none d-xl-table-cell"
            >
              Jarkom
            </th>
            <th scope="col">
              Status
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="remote in result.items"
            :key="remote.id"
          >
            <td class="font-monospace text-nowrap">
              {{ remote.siteId }}
            </td>
            <td>
              <RouterLink
                :to="{ name: 'remote-detail', params: { id: remote.id } }"
                class="remote-link"
              >
                {{ remote.name }}
              </RouterLink>
              <div class="d-md-none small text-secondary">
                {{ remote.city }}
              </div>
            </td>
            <td
              v-if="showCustomer"
              class="d-none d-lg-table-cell"
            >
              {{ remote.tenant.name }}
            </td>
            <td class="d-none d-md-table-cell">
              {{ remote.city }}<span class="text-secondary">, {{ remote.province }}</span>
            </td>
            <td class="d-none d-xl-table-cell">
              {{ remote.jarkom.name }}
            </td>
            <td>
              <span :class="STATUS_BADGE[remote.status]">{{ REMOTE_STATUS_LABELS[remote.status] }}</span>
            </td>
          </tr>
        </tbody>
      </table>
      <nav
        class="card-footer d-flex flex-wrap align-items-center gap-2"
        aria-label="Halaman daftar remote"
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
.action-target,
.form-control,
.form-select {
  min-height: 44px;
}
/* Tautan nama memenuhi tinggi sentuh di ponsel tanpa menggeser baris. */
.remote-link {
  display: inline-block;
  padding-block: 0.6rem;
}
</style>
