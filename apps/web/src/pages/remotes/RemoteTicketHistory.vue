<script setup lang="ts">
import { type RemoteTicketHistoryPage, type RemoteZone, TICKET_CLOSE_CAUSE_LABELS } from '@npr/shared';
import { computed, ref, watch } from 'vue';
import TicketStatusPill from '../tickets/TicketStatusPill.vue';
import TroubleTicketStatusPill from '../tickets/tt/TroubleTicketStatusPill.vue';
import { durationLabel } from '../tickets/list/relative-time';
import { ticketApi } from '../tickets/ticket-api';
import { formatZoned } from '../tickets/zoned-time';

// Riwayat NPR di halaman remote (langkah 1.6, T101): semua NPR remote itu, berjalan dan
// ditutup, mulai gangguan terbaru dulu. Lama gangguan dihitung sampai remote pulih; NPR yang
// belum pulih ditandai "berjalan".

const props = defineProps<{ remoteId: string; zone: RemoteZone }>();

const page = ref<RemoteTicketHistoryPage | null>(null);
const pageNumber = ref(1);
const loading = ref(false);
const error = ref('');
const now = ref(Date.now());
let latest = 0;

async function load(): Promise<void> {
  const request = ++latest;
  loading.value = true;
  error.value = '';
  try {
    const result = await ticketApi.remoteHistory(props.remoteId, pageNumber.value);
    if (request !== latest) return;
    page.value = result;
    now.value = Date.now();
  } catch (cause) {
    if (request === latest) error.value = cause instanceof Error ? cause.message : 'Riwayat NPR gagal dimuat.';
  } finally {
    if (request === latest) loading.value = false;
  }
}

watch(
  () => props.remoteId,
  () => {
    pageNumber.value = 1;
    page.value = null;
    void load();
  },
  { immediate: true },
);

function goTo(next: number): void {
  pageNumber.value = next;
  void load();
}

const lastPage = computed(() => (page.value ? Math.max(1, Math.ceil(page.value.total / page.value.pageSize)) : 1));
const range = computed(() => {
  if (!page.value || page.value.total === 0) return '';
  const first = (page.value.page - 1) * page.value.pageSize + 1;
  const last = Math.min(page.value.total, first + page.value.items.length - 1);
  return `${first}–${last} dari ${page.value.total} NPR`;
});

const duration = (startedAt: string, recoveredAt: string | null) =>
  durationLabel(startedAt, recoveredAt ? Date.parse(recoveredAt) : now.value);
</script>

<template>
  <section
    class="card"
    aria-labelledby="judul-riwayat-npr"
  >
    <div class="card-header">
      <h2
        id="judul-riwayat-npr"
        class="card-title"
      >
        Riwayat NPR<template v-if="page">
          ({{ page.total }})
        </template>
      </h2>
    </div>

    <div
      v-if="error"
      class="card-body text-danger"
      role="alert"
    >
      {{ error }}
    </div>
    <div
      v-else-if="page && page.total === 0"
      class="card-body text-secondary"
    >
      Belum ada NPR untuk remote ini.
    </div>
    <div
      v-else-if="page"
      class="table-responsive"
      :aria-busy="loading"
    >
      <table class="table table-vcenter card-table history-table">
        <thead>
          <tr>
            <th>No. NPR</th>
            <th>Status</th>
            <th>Gangguan</th>
            <th>Penyebab · penyelesaian</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="item in page.items"
            :key="item.id"
          >
            <td class="history-table__number">
              <RouterLink
                :to="{ name: 'ticket-detail', params: { id: item.id } }"
                class="font-monospace"
              >
                {{ item.number }}
              </RouterLink>
              <span class="d-block text-secondary small">{{ item.categoryName }}</span>
              <span
                v-for="tt in item.troubleTickets"
                :key="tt.id"
                class="history-table__tt"
              >
                <span class="font-monospace">{{ tt.number }}</span>
                <TroubleTicketStatusPill :status="tt.status" />
              </span>
            </td>
            <td>
              <TicketStatusPill :status="item.status" />
            </td>
            <td class="history-table__outage">
              <template v-if="item.recoveredAt">
                {{ duration(item.startedAt, item.recoveredAt) }}
              </template>
              <template v-else>
                <span class="running">berjalan</span> {{ duration(item.startedAt, null) }}
              </template>
              <span class="d-block text-secondary small">mulai {{ formatZoned(item.startedAt, zone) }}</span>
            </td>
            <td class="history-table__cause">
              <template v-if="item.closeCause">
                <strong>{{ TICKET_CLOSE_CAUSE_LABELS[item.closeCause] }}</strong>
                <span class="d-block text-secondary">{{ item.resolution }}</span>
              </template>
              <span
                v-else
                class="text-secondary"
              >Belum ditutup</span>
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
      Memuat riwayat NPR…
    </p>

    <div
      v-if="page && page.total > page.pageSize"
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
        aria-label="Halaman riwayat NPR"
      >
        <button
          type="button"
          class="btn"
          :disabled="pageNumber <= 1 || loading"
          @click="goTo(pageNumber - 1)"
        >
          Sebelumnya
        </button>
        <button
          type="button"
          class="btn"
          :disabled="pageNumber >= lastPage || loading"
          @click="goTo(pageNumber + 1)"
        >
          Berikutnya
        </button>
      </nav>
    </div>
  </section>
</template>

<style scoped>
.history-table__number {
  width: 1%;
  min-width: 210px;
  white-space: nowrap;
}

.history-table__tt {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 8px;
  margin-top: 4px;
  font-size: 13px;
  color: var(--tblr-secondary);
}

.history-table__outage {
  width: 1%;
  white-space: nowrap;
}

.history-table__cause {
  min-width: 220px;
  overflow-wrap: anywhere;
}

.running {
  color: #9a3d0d;
  font-weight: 600;
}

[data-bs-theme='dark'] .running {
  color: #f4a577;
}

[aria-busy='true'] {
  opacity: 0.6;
}

.card-footer .btn {
  min-height: 44px;
}

/* Di bawah 1200 px setiap NPR menjadi blok bertumpuk (sama dengan antrean), tanpa geser mendatar. */
@media (max-width: 1199.98px) {
  .history-table thead {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
  }

  .history-table tr {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 16px;
    padding: 12px 16px;
    border-bottom: 1px solid var(--tblr-border-color);
  }

  .history-table.card-table td,
  .history-table.card-table td:first-child,
  .history-table.card-table td:last-child {
    display: block;
    padding: 0;
    border: 0;
  }

  /* Lebar 1% milik mode tabel tidak dibawa ke blok: nomor NPR tidak terpotong di tengah. */
  .history-table td.history-table__number {
    flex: 1 1 auto;
    width: auto;
    min-width: 0;
    white-space: normal;
  }

  .history-table td.history-table__number a {
    display: inline-block;
    min-height: 44px;
    line-height: 44px;
    overflow-wrap: anywhere;
  }

  .history-table td.history-table__outage,
  .history-table td.history-table__cause {
    flex-basis: 100%;
    width: auto;
    min-width: 0;
    white-space: normal;
  }
}
</style>
