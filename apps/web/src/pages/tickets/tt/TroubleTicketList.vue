<script setup lang="ts">
import { IconSearch } from '@tabler/icons-vue';
import type { TroubleTicketPage } from '@tyio/shared';
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { sinceLabel } from '../list/relative-time';
import { ticketApi } from '../ticket-api';
import { formatZonedShort } from '../zoned-time';
import TroubleTicketStatusPill from './TroubleTicketStatusPill.vue';

// Daftar TT aktif (langkah 1.5b), terpisah dari antrean NPR: TT yang masih menunggu SD,
// terlama dulu, dengan keterangan apakah ringkasannya sudah diteruskan ke SD (K25).
// Saringan (`tq`, `customer`, `tpage`) di alamat halaman, sama seperti antrean NPR.

const props = defineProps<{ customers: Array<{ id: string; name: string }> }>();

const route = useRoute();
const router = useRouter();
const number = new Intl.NumberFormat('id-ID');
const page = ref<TroubleTicketPage | null>(null);
const loading = ref(true);
const error = ref('');
const now = ref(Date.now());

const one = (value: unknown) => (typeof value === 'string' ? value : '');
const filters = computed(() => ({
  q: one(route.query.tq),
  customer: one(route.query.customer),
  page: Math.max(1, Number(one(route.query.tpage)) || 1),
}));
const showCustomer = computed(() => props.customers.length > 1 && !filters.value.customer);

const search = ref(filters.value.q);
let debounce: ReturnType<typeof setTimeout> | undefined;
watch(search, (value) => {
  clearTimeout(debounce);
  debounce = setTimeout(() => setQuery({ tq: value.trim() }), 300);
});
const clock = setInterval(() => (now.value = Date.now()), 60_000);
onBeforeUnmount(() => {
  clearTimeout(debounce);
  clearInterval(clock);
});

function setQuery(change: Partial<Record<'tq' | 'customer' | 'tpage', string>>): void {
  const next: Record<string, string> = { ...(route.query as Record<string, string>), ...change };
  if (!('tpage' in change)) delete next.tpage;
  for (const key of Object.keys(next)) if (!next[key] || (key === 'tpage' && next[key] === '1')) delete next[key];
  void router.replace({ query: next });
}

let latest = 0;
async function load(): Promise<void> {
  const mine = ++latest;
  loading.value = true;
  error.value = '';
  try {
    const result = await ticketApi.troubleTickets({
      tenantId: filters.value.customer,
      q: filters.value.q,
      page: String(filters.value.page),
    });
    if (mine === latest) page.value = result;
  } catch (cause) {
    if (mine === latest) error.value = cause instanceof Error ? cause.message : 'Daftar TT gagal dimuat.';
  } finally {
    if (mine === latest) loading.value = false;
  }
}
watch(filters, () => void load(), { immediate: true, deep: true });

const lastPage = computed(() => (page.value ? Math.max(1, Math.ceil(page.value.total / page.value.pageSize)) : 1));
const range = computed(() => {
  if (!page.value || page.value.total === 0) return '';
  const first = (page.value.page - 1) * page.value.pageSize + 1;
  const last = first + page.value.items.length - 1;
  return `${number.format(first)}–${number.format(last)} dari ${number.format(page.value.total)} TT aktif`;
});
</script>

<template>
  <div class="card">
    <div class="card-body border-bottom tt-filters">
      <div>
        <label
          class="form-label"
          for="cari-tt"
        >Cari TT</label>
        <div class="input-icon">
          <span
            class="input-icon-addon"
            aria-hidden="true"
          ><IconSearch size="16" /></span>
          <input
            id="cari-tt"
            v-model="search"
            type="search"
            class="form-control"
            maxlength="100"
            autocomplete="off"
            aria-describedby="cari-tt-bantuan"
          >
        </div>
        <div
          id="cari-tt-bantuan"
          class="form-hint"
        >
          No. TT, no. NPR, kode, atau nama remote
        </div>
      </div>
      <div v-if="customers.length > 1">
        <label
          class="form-label"
          for="saring-customer-tt"
        >Customer</label>
        <select
          id="saring-customer-tt"
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
    </div>

    <div
      v-if="error"
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
        {{ filters.q || filters.customer ? 'Tidak ada TT yang cocok' : 'Tidak ada TT aktif' }}
      </p>
      <p class="empty-subtitle text-secondary">
        TT dibuat dari halaman NPR dengan tombol "Buat TT ke SD".
      </p>
    </div>
    <div
      v-else-if="page"
      class="table-responsive"
      :aria-busy="loading"
    >
      <table class="table table-vcenter card-table tt-table">
        <thead>
          <tr>
            <th>No. TT</th>
            <th>Remote</th>
            <th>Problem jarkom</th>
            <th>Status</th>
            <th>Diteruskan ke SD</th>
            <th>Dibuat</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="item in page.items"
            :key="item.id"
          >
            <td class="tt-table__number">
              <RouterLink
                :to="{ name: 'ticket-detail', params: { id: item.ticket.id }, hash: `#tt-${item.id}` }"
                class="font-monospace"
              >
                {{ item.number }}
              </RouterLink>
              <span class="d-block text-secondary small font-monospace">{{ item.ticket.number }}</span>
            </td>
            <td class="tt-table__remote">
              {{ item.remote.name }}
              <span class="d-block text-secondary small">
                <span class="font-monospace">{{ item.remote.code }}</span>
                <template v-if="item.remote.city"> · {{ item.remote.city }}</template>
                <template v-if="showCustomer"> · {{ item.customerName }}</template>
              </span>
            </td>
            <td class="tt-table__problem">
              {{ item.problem }}
            </td>
            <td>
              <TroubleTicketStatusPill :status="item.status" />
            </td>
            <td>
              <template v-if="item.copiedCount > 0">
                Disalin {{ item.copiedCount }}×
                <span class="d-block text-secondary small">terakhir {{ sinceLabel(item.lastCopiedAt ?? item.createdAt, now) }}</span>
              </template>
              <span
                v-else
                class="not-copied"
              >Belum disalin</span>
            </td>
            <td class="text-nowrap">
              {{ formatZonedShort(item.createdAt, item.remote.zone) }}
              <span class="d-block text-secondary small">{{ item.createdByName }}</span>
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
      Memuat daftar TT…
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
        aria-label="Halaman daftar TT"
      >
        <button
          type="button"
          class="btn"
          :disabled="filters.page <= 1 || loading"
          @click="setQuery({ tpage: String(filters.page - 1) })"
        >
          Sebelumnya
        </button>
        <button
          type="button"
          class="btn"
          :disabled="filters.page >= lastPage || loading"
          @click="setQuery({ tpage: String(filters.page + 1) })"
        >
          Berikutnya
        </button>
      </nav>
    </div>
  </div>
</template>

<style scoped>
.tt-filters {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
  gap: 12px;
  max-width: 820px;
}

.tt-table__remote {
  min-width: 170px;
}

.tt-table__problem {
  min-width: 220px;
  max-width: 360px;
  overflow-wrap: anywhere;
}

/* Belum diteruskan ke SD: menonjol, karena SD belum tahu ada TT. */
.not-copied {
  color: #9a3d0d;
  font-weight: 600;
}

[data-bs-theme='dark'] .not-copied {
  color: #f4a577;
}

[aria-busy='true'] {
  opacity: 0.6;
}

@media (max-width: 1199.98px) {
  .tt-table thead {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
  }

  .tt-table tr {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 16px;
    padding: 12px 16px;
    border-bottom: 1px solid var(--tblr-border-color);
  }

  .tt-table.card-table td,
  .tt-table.card-table td:first-child,
  .tt-table.card-table td:last-child {
    display: block;
    padding: 0;
    border: 0;
  }

  .tt-table td.tt-table__number {
    flex: 1 1 auto;
  }

  .tt-table td.tt-table__number a {
    display: inline-block;
    min-height: 44px;
    line-height: 44px;
    overflow-wrap: anywhere;
  }

  .tt-table td.tt-table__remote,
  .tt-table td.tt-table__problem {
    flex-basis: 100%;
    max-width: none;
    min-width: 0;
  }
}

@media (max-width: 575.98px) {
  .tt-filters {
    grid-template-columns: 1fr;
  }
}
</style>
