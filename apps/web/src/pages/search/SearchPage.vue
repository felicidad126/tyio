<script setup lang="ts">
import { IconAlertTriangle, IconSearch } from '@tabler/icons-vue';
import {
  formatInZone,
  REMOTE_STATUS_LABELS,
  SEARCH_LIMIT,
  SEARCH_MIN_LENGTH,
  type SearchResponse,
  TICKET_STATUS_LABELS,
} from '@tyio/shared';
import { computed, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { ApiError } from '../../api/client';
import { searchApi } from '../../api/search';
import TicketNumber from '../../components/TicketNumber.vue';
import { STATUS_BADGE } from '../remotes/remote-display';
import { TICKET_STATUS_BADGE } from '../tickets/detail/ticket-display';

// Pola halaman: daftar hasil. Kata dicari tersimpan di alamat (?q=), jadi hasilnya bisa
// dibagikan dan tombol kembali berfungsi. Paling banyak SEARCH_LIMIT per jenis; sisanya
// dibuka di daftar Tiket atau Remote dengan kata yang sama.
const route = useRoute();
const router = useRouter();
const q = computed(() => (typeof route.query.q === 'string' ? route.query.q.trim() : ''));
const input = ref(q.value);
watch(q, (value) => (input.value = value));

const result = ref<SearchResponse | null>(null);
const state = ref<'idle' | 'loading' | 'ready' | 'error'>('idle');
const loadError = ref('');
let latest = 0;

async function load(): Promise<void> {
  const request = ++latest;
  if (q.value.length < SEARCH_MIN_LENGTH) {
    result.value = null;
    state.value = 'idle';
    return;
  }
  state.value = 'loading';
  try {
    const response = await searchApi.search(q.value);
    if (request !== latest) return;
    result.value = response;
    state.value = 'ready';
  } catch (error) {
    if (request !== latest) return;
    loadError.value = error instanceof ApiError ? error.message : 'Pencarian gagal. Coba lagi.';
    state.value = 'error';
  }
}
watch(q, load, { immediate: true });

function submit(): void {
  void router.replace({ query: { q: input.value.trim() || undefined } });
}

const nothing = computed(() => result.value && result.value.ticketTotal === 0 && result.value.remoteTotal === 0);
</script>

<template>
  <div class="page-header mb-3">
    <h1 class="page-title">
      Hasil pencarian
    </h1>
    <p
      v-if="q"
      class="text-secondary mb-0"
    >
      untuk "{{ q }}"
    </p>
  </div>

  <form
    class="card mb-3"
    role="search"
    @submit.prevent="submit"
  >
    <div class="card-body d-flex gap-2">
      <label
        class="visually-hidden"
        for="search-page-input"
      >Cari tiket atau remote</label>
      <div class="input-icon flex-fill">
        <span
          class="input-icon-addon"
          aria-hidden="true"
        ><IconSearch :size="18" /></span>
        <input
          id="search-page-input"
          v-model="input"
          type="search"
          class="form-control"
          placeholder="No. NPR, no. tiket customer, Site ID, atau nama remote"
          autocomplete="off"
          maxlength="100"
        >
      </div>
      <button
        type="submit"
        class="btn btn-primary action-target"
      >
        Cari
      </button>
    </div>
  </form>

  <p
    v-if="state === 'idle'"
    class="text-secondary"
  >
    Ketik paling sedikit {{ SEARCH_MIN_LENGTH }} karakter: no. NPR (atau potongannya), no. tiket customer, Site ID,
    nama, kota, atau kanca remote.
  </p>

  <p
    v-else-if="state === 'loading'"
    class="text-secondary"
    aria-busy="true"
  >
    Mencari…
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
        Pencarian gagal
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
          Cari lagi
        </button>
      </div>
    </div>
  </div>

  <div
    v-else-if="nothing"
    class="card"
  >
    <div class="empty">
      <div class="empty-icon">
        <IconSearch
          :size="40"
          aria-hidden="true"
        />
      </div>
      <p class="empty-title">
        Tidak ada tiket atau remote yang cocok
      </p>
      <p class="empty-subtitle text-secondary">
        Periksa ejaan, atau coba potongan nomor seperti "2026/11/0002" atau Site ID.
      </p>
    </div>
  </div>

  <template v-else-if="result">
    <section
      v-if="result.ticketTotal > 0"
      class="card mb-3"
      aria-labelledby="hasil-tiket"
    >
      <div class="card-header">
        <h2
          id="hasil-tiket"
          class="card-title"
        >
          Tiket <span class="badge bg-secondary-lt ms-1">{{ result.ticketTotal.toLocaleString('id-ID') }}</span>
        </h2>
      </div>
      <ul class="list-group list-group-flush">
        <li
          v-for="t in result.tickets"
          :key="t.id"
          class="list-group-item d-flex flex-wrap align-items-center gap-2"
        >
          <div class="me-auto result-main">
            <RouterLink
              :to="{ name: 'ticket-detail', params: { id: t.id } }"
              class="result-link font-monospace"
            >
              <TicketNumber :number="t.number" />
            </RouterLink>
            <div class="text-truncate">
              {{ t.remote.name }}
              <span class="text-secondary">· {{ t.remote.siteId }} · {{ t.tenant.name }}</span>
            </div>
            <div class="small text-secondary">
              {{ formatInZone(t.occurredAt, t.remote.timeZone) }} · {{ t.category.name }}
              <template v-if="t.customerTicketNumber">
                · No. tiket customer <span class="font-monospace">{{ t.customerTicketNumber }}</span>
              </template>
            </div>
          </div>
          <span :class="TICKET_STATUS_BADGE[t.status]">{{ TICKET_STATUS_LABELS[t.status] }}</span>
        </li>
      </ul>
      <div
        v-if="result.ticketTotal > SEARCH_LIMIT"
        class="card-footer"
      >
        <RouterLink :to="{ name: 'tiket', query: { tampilan: 'semua', q } }">
          Lihat semua {{ result.ticketTotal.toLocaleString('id-ID') }} tiket di daftar Tiket
        </RouterLink>
      </div>
    </section>

    <section
      v-if="result.remoteTotal > 0"
      class="card mb-3"
      aria-labelledby="hasil-remote"
    >
      <div class="card-header">
        <h2
          id="hasil-remote"
          class="card-title"
        >
          Remote <span class="badge bg-secondary-lt ms-1">{{ result.remoteTotal.toLocaleString('id-ID') }}</span>
        </h2>
      </div>
      <ul class="list-group list-group-flush">
        <li
          v-for="r in result.remotes"
          :key="r.id"
          class="list-group-item d-flex flex-wrap align-items-center gap-2"
        >
          <div class="me-auto result-main">
            <RouterLink
              :to="{ name: 'remote-detail', params: { id: r.id } }"
              class="result-link"
            >
              {{ r.name }}
            </RouterLink>
            <div class="small text-secondary">
              <span class="font-monospace">{{ r.siteId }}</span> · {{ r.city }}, {{ r.province }} · {{ r.tenant.name }}
            </div>
          </div>
          <span :class="STATUS_BADGE[r.status]">{{ REMOTE_STATUS_LABELS[r.status] }}</span>
        </li>
      </ul>
      <div
        v-if="result.remoteTotal > SEARCH_LIMIT"
        class="card-footer"
      >
        <RouterLink :to="{ name: 'remote', query: { q } }">
          Lihat semua {{ result.remoteTotal.toLocaleString('id-ID') }} remote di daftar Remote
        </RouterLink>
      </div>
    </section>
  </template>
</template>

<style scoped>
.action-target,
.form-control {
  min-height: 44px;
}
.result-main {
  min-width: 0;
}
.result-link {
  display: inline-block;
  padding-block: 0.5rem;
  font-weight: 600;
  overflow-wrap: anywhere;
}
</style>
